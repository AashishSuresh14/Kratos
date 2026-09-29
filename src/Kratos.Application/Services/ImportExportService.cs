using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using Kratos.Application.Abstractions;
using Kratos.Application.Ai;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Domain;

namespace Kratos.Application.Services;

/// <summary>Everything read from a workbook, before it is committed to an account.</summary>
public sealed class ImportedPlan
{
    public string? AccountName { get; set; }
    public DateOnly? AccountSince { get; set; }
    public decimal? CurrentRunRate { get; set; }
    public string CxoConnect { get; set; } = "";
    public string Challenges { get; set; } = "";
    public string Unknowns { get; set; } = "";
    public string KnownUnconfirmed { get; set; } = "";
    public string GrowthLevers { get; set; } = "";
    public string VisionThreeYear { get; set; } = "";
    public string VisionOneYear { get; set; } = "";
    public List<string> Objectives { get; set; } = [];
    public List<string> Strategies { get; set; } = [];
    public List<ImportedStakeholder> Stakeholders { get; set; } = [];
    public List<ImportedOpportunity> Opportunities { get; set; } = [];
    public List<ImportedRating> Brickwall { get; set; } = [];
    public List<ImportedAction> Actions { get; set; } = [];
    public List<ImportedResource> Resources { get; set; } = [];
}

public sealed record ImportedStakeholder(string Name, string Title, string Role, string Importance, string BuyingMotive, int? Perception);
public sealed record ImportedOpportunity(string Title, string Offering, int Potential, int Effort, int Complexity, bool IsPriority);
public sealed record ImportedRating(string Criterion, int Score);
public sealed record ImportedAction(string Title, string Owner, DateOnly? DueDate, bool IsSubAction, string Sheet);
public sealed record ImportedResource(ResourceType Type, string Description, decimal? Amount);

/// <summary>AC 5 and AC 6: Excel import with a validation report, round-trip export, and tailored BD / Executive packs.</summary>
public sealed partial class ImportExportService(
    IWorkbookReader reader, IWorkbookWriter writer, IImportRepository imports, IAccountRepository accounts, IMasterDataRepository master,
    IUserRepository users, IUnitOfWork uow, AccessScope scope, AccountService accountService, ViewService views, ScoringService scoring,
    WorkbookInterpreterAgent interpreter, ICurrentUser user, IAuditService audit, IClock clock)
{
    // Sheet recognition follows the existing KAM workbook tabs (KYC, S2 ... S12).
    private static readonly (SectionKey Section, string[] Keys)[] SheetRules =
    [
        (SectionKey.Profile, ["kyc", "s1", "know your customer", "account profile"]),
        (SectionKey.Infobase, ["s2", "info base", "information base", "infobase"]),
        (SectionKey.Vision, ["s3", "s4", "vision", "objective"]),
        (SectionKey.Strategy, ["s5", "strategic direction", "strategy"]),
        (SectionKey.Opportunities, ["s6", "opportunity matrix", "opportunit"]),
        (SectionKey.Stakeholders, ["s7", "mapping the account", "stakeholder", "mapping"]),
        (SectionKey.Brickwall, ["s8", "brickwall", "brick wall"]),
        (SectionKey.Tactical, ["s9", "tactical"]),
        (SectionKey.PriorityActions, ["s10", "priority action"]),
        (SectionKey.ActionPlan, ["s11", "time bound", "action plan"]),
        (SectionKey.Resources, ["s12", "resources"]),
    ];

    public async Task<ImportReportDto> AnalyseAsync(string fileName, Stream content, long length, CancellationToken ct)
    {
        scope.EnsureRole(Role.AccountManager, Role.GroupLead);
        var safeName = Path.GetFileName(fileName ?? "workbook.xlsx");
        if (!safeName.EndsWith(".xlsx", StringComparison.OrdinalIgnoreCase))
            throw new ValidationException("file", "Upload an Excel workbook (.xlsx). Older .xls files must be re-saved as .xlsx.");
        if (length <= 0) throw new ValidationException("file", "The file is empty.");
        if (length > Limits.MaxImportBytes) throw new ValidationException("file", "The file is larger than 10 MB.");

        var model = reader.Read(content, Limits.MaxCellsPerSheet);
        var findings = new List<ImportFinding>();
        var plan = new ImportedPlan();
        var fieldCounts = new Dictionary<SectionKey, (int Fields, decimal Confidence)>();
        var unrecognised = new List<WorkbookSheet>();

        foreach (var sheet in model.Sheets)
        {
            var section = Recognise(sheet.Name);
            if (section is null)
            {
                if (sheet.Cells.Count > 0) unrecognised.Add(sheet);
                findings.Add(new("Warning", sheet.Name, null, "Sheet name does not match a KAM section; the AI interpreter will try to read it."));
                continue;
            }
            var n = ExtractSection(section.Value, sheet, plan, findings);
            Add(fieldCounts, section.Value, n, 0.95m);
            findings.Add(new(n == 0 ? "Warning" : "Info", sheet.Name, null,
                n == 0 ? "Recognised as a KAM section but no values could be read." : $"Read {n} value{(n == 1 ? "" : "s")}."));
        }

        foreach (var (section, _) in SheetRules)
            if (section is not SectionKey.Tactical && !model.Sheets.Any(s => Recognise(s.Name) == section))
                findings.Add(new("Warning", "(workbook)", null, $"No sheet found for {section}. That section will start empty."));

        AiMeta? meta = null;
        var textSheets = unrecognised.Concat(model.Sheets.Where(s => Recognise(s.Name) is { } sec && fieldCounts.GetValueOrDefault(sec).Fields == 0)).ToList();
        if (textSheets.Count > 0)
        {
            try
            {
                var (guess, result) = await interpreter.InterpretAsync(textSheets, ct);
                meta = result.Meta(WorkbookInterpreterAgent.Name);
                ApplyGuesses(guess, plan, fieldCounts, findings);
            }
            catch (AiUnavailableException ex)
            {
                findings.Add(new("Warning", "(workbook)", null, $"AI interpretation skipped: {ex.Message}"));
            }
            catch (TooManyRequestsException ex)
            {
                findings.Add(new("Warning", "(workbook)", null, ex.Message));
            }
        }

        plan.AccountName ??= GuessAccountName(model, safeName);
        if (string.IsNullOrWhiteSpace(plan.AccountName))
            findings.Add(new("Error", "KYC", null, "Could not find the account name. Add it to the KYC sheet or choose an existing account when committing."));
        var total = fieldCounts.Values.Sum(v => v.Fields);
        if (total == 0) findings.Add(new("Error", "(workbook)", null, "No plan content could be read from this workbook."));

        var session = new ImportSession
        {
            At = clock.UtcNow, UserId = user.Id, FileName = safeName,
            MappedJson = JsonSerializer.Serialize(plan, Json.Options),
        };
        var report = new ImportReportDto(session.Id, safeName, model.Sheets.Select(s => s.Name).ToList(), plan.AccountName,
            findings.OrderBy(f => f.Severity switch { "Error" => 0, "Warning" => 1, _ => 2 }).ToList(),
            fieldCounts.Select(kv => new MappedSection(kv.Key, kv.Value.Fields, Math.Round(kv.Value.Confidence, 2))).OrderBy(m => m.Section).ToList(),
            total > 0, meta);
        session.ReportJson = JsonSerializer.Serialize(report, Json.Options);
        imports.Add(session);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("import.analyse", $"import/{session.Id}", AuditOutcome.Success, safeName, ct);
        return report;
    }

    public async Task<AccountPlanDto> CommitAsync(Guid importId, CommitImportRequest r, CancellationToken ct)
    {
        var session = await imports.GetAsync(importId, ct) ?? throw new NotFoundException("Import");
        if (session.UserId != user.Id) throw new NotFoundException("Import");
        if (session.Committed) throw new ConflictException("This import has already been committed.");
        if (clock.UtcNow - session.At > TimeSpan.FromHours(24)) throw new ValidationException("importId", "This import has expired. Upload the workbook again.");
        var report = JsonSerializer.Deserialize<ImportReportDto>(session.ReportJson, Json.Options)!;
        if (!report.CanCommit) throw new ValidationException("importId", "This workbook has errors that must be fixed before committing.");
        var plan = JsonSerializer.Deserialize<ImportedPlan>(session.MappedJson, Json.Options)!;

        Account a;
        if (r.AccountId is { } existingId)
        {
            a = await accountService.LoadForEditAsync(existingId, null, ct);
        }
        else
        {
            var name = plan.AccountName?.Trim();
            if (string.IsNullOrWhiteSpace(name)) throw new ValidationException("accountId", "The workbook has no account name. Choose an existing account.");
            if (await accounts.NameExistsAsync(name, null, ct)) throw new ConflictException($"An account named '{name}' already exists. Import into it instead.");
            var groups = await master.GroupsAsync(ct);
            var group = r.GroupId is { } gid ? groups.FirstOrDefault(g => g.Id == gid)
                : groups.FirstOrDefault(g => g.LeadUserId == user.Id) ?? groups.FirstOrDefault();
            if (group is null) throw new ValidationException("groupId", "Choose a group for the new account.");
            if (user.Role == Role.GroupLead && group.LeadUserId != user.Id) throw new ForbiddenException("You can only import into groups you lead.");
            a = new Account { Name = name, Type = r.Type ?? AccountType.EBD, GroupId = group.Id, CaptainId = user.Id };
            a.Team.Add(new TeamMember { AccountId = a.Id, UserId = user.Id, Raci = Raci.A, Responsibility = "Account captain" });
            accounts.Add(a);
        }

        await ApplyAsync(a, plan, ct);
        foreach (var (key, _) in SheetRules) a.Touch(key, clock.UtcNow);
        session.Committed = true;
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("import.commit", $"account/{a.Id}", AuditOutcome.Success, session.FileName, ct);
        return await accountService.ToPlanAsync(a, ct);
    }

    private async Task ApplyAsync(Account a, ImportedPlan p, CancellationToken ct)
    {
        a.AccountSince ??= p.AccountSince;
        a.CurrentRunRate ??= p.CurrentRunRate;
        a.CxoConnect = Merge(a.CxoConnect, p.CxoConnect);
        a.Challenges = Merge(a.Challenges, p.Challenges);
        a.Unknowns = Merge(a.Unknowns, p.Unknowns);
        a.KnownUnconfirmed = Merge(a.KnownUnconfirmed, p.KnownUnconfirmed);
        a.GrowthLevers = Merge(a.GrowthLevers, p.GrowthLevers);
        a.VisionThreeYear = Merge(a.VisionThreeYear, p.VisionThreeYear);
        a.VisionOneYear = Merge(a.VisionOneYear, p.VisionOneYear);
        a.Objectives = a.Objectives.Concat(p.Objectives).Select(o => Cap(o, Limits.ShortText)).Distinct(StringComparer.OrdinalIgnoreCase).Take(Limits.MaxObjectives).ToList();

        var strategies = await master.StrategiesAsync(ct);
        foreach (var s in p.Strategies)
            if (BestMatch(strategies, x => x.Name, s) is { } m && !a.StrategyIds.Contains(m.Id)) a.StrategyIds.Add(m.Id);

        foreach (var s in p.Stakeholders.Take(200))
        {
            if (a.Stakeholders.Any(x => x.Name.Equals(s.Name, StringComparison.OrdinalIgnoreCase))) continue;
            var st = new Stakeholder
            {
                AccountId = a.Id, Name = Cap(s.Name, Limits.Name), Title = Cap(s.Title, Limits.Name), BuyingMotive = Cap(s.BuyingMotive, Limits.ShortText),
                Role = ParseRole(s.Role), Importance = ParseImportance(s.Importance), Perception = s.Perception is >= 1 and <= 5 ? s.Perception : null,
            };
            a.Stakeholders.Add(st);
            accounts.AddChild(st);
        }

        var offerings = await master.OfferingsAsync(ct);
        foreach (var o in p.Opportunities.Take(100))
        {
            var offering = BestMatch(offerings, x => x.Name, o.Offering) ?? BestMatch(offerings, x => x.Name, o.Title) ?? offerings.FirstOrDefault();
            if (offering is null) break;
            var opp = new Opportunity
            {
                AccountId = a.Id, Title = Cap(o.Title, Limits.Name), OfferingId = offering.Id, Potential = Math.Clamp(o.Potential, 1, 5),
                Effort = Math.Clamp(o.Effort, 1, 5), Complexity = Math.Clamp(o.Complexity, 1, 5), IsPriority = o.IsPriority,
            };
            a.Opportunities.Add(opp);
            accounts.AddChild(opp);
        }

        var criteria = await master.CriteriaAsync(ct);
        foreach (var r in p.Brickwall)
        {
            if (BestMatch(criteria, c => c.Name, r.Criterion) is not { } c) continue;
            var existing = a.Brickwall.FirstOrDefault(b => b.CriterionId == c.Id);
            if (existing is null) { existing = new BrickwallRating { AccountId = a.Id, CriterionId = c.Id }; a.Brickwall.Add(existing); accounts.AddChild(existing); }
            existing.Score = Math.Clamp(r.Score, 1, 5);
        }

        foreach (var r in p.Resources.Take(50))
        {
            var res = new ResourceNeed { AccountId = a.Id, Type = r.Type, Description = Cap(r.Description, Limits.ShortText), Amount = r.Amount };
            a.Resources.Add(res);
            accounts.AddChild(res);
        }

        // Actions: owner resolved by display name; unresolved owners fall back to the importer and are noted in the title.
        var people = await users.ListAsync(ct);
        ActionItem? lastParent = null;
        var today = DateOnly.FromDateTime(clock.UtcNow);
        foreach (var act in p.Actions.Take(200))
        {
            var owner = people.FirstOrDefault(u => u.IsActive && u.Role != Role.Admin && u.DisplayName.Equals(act.Owner, StringComparison.OrdinalIgnoreCase));
            var item = new ActionItem
            {
                AccountId = a.Id, Title = Cap(owner is null && act.Owner.Length > 0 ? $"{act.Title} (owner in workbook: {act.Owner})" : act.Title, Limits.ShortText),
                SourceSection = act.Sheet == "S10" ? SectionKey.PriorityActions : SectionKey.ActionPlan,
                OwnerId = owner?.Id ?? user.Id, DueDate = act.DueDate ?? today.AddDays(30),
                ParentId = act.IsSubAction ? lastParent?.Id : null, CreatedAt = clock.UtcNow,
            };
            if (!act.IsSubAction) lastParent = item;
            a.Actions.Add(item);
            accounts.AddChild(item);
        }
    }

    // ---------------- Export (AC 5 round trip, AC 6 packs) ----------------

    public async Task<FileResult> ExportAccountAsync(Guid accountId, CancellationToken ct)
    {
        var plan = await accountService.GetPlanAsync(accountId, ct);
        var master = await Master(ct);
        var sheets = new List<WorkbookTable>
        {
            new("KYC", ["Field", "Value"], [
                Row("Account", plan.Summary.Name), Row("Type", plan.Summary.Type.ToString()), Row("Group", plan.Summary.GroupName),
                Row("Captain", plan.Summary.CaptainName), Row("Account since", plan.Profile.AccountSince?.ToString("yyyy-MM-dd")),
                Row("Current run rate (USD)", plan.Profile.CurrentRunRate), Row("CXO connect", plan.Profile.CxoConnect),
                Row("Current offerings", string.Join(", ", plan.Profile.CurrentOfferingIds.Select(master.Offering))),
                Row("Aspirational offerings", string.Join(", ", plan.Profile.AspirationalOfferingIds.Select(master.Offering))),
                Row("Challenges", plan.Profile.Challenges),
                .. plan.Team.Select(t => Row($"Team ({t.Raci})", $"{t.DisplayName} — {t.Responsibility}")),
            ]),
            new("S2 Info Base", ["Field", "Value"], [Row("What Psiog doesn't know", plan.Infobase.Unknowns),
                Row("Known but not confirmed", plan.Infobase.KnownUnconfirmed), Row("Levers to grow the account", plan.Infobase.GrowthLevers)]),
            new("S3 3 year vision S4 objectives", ["Field", "Value"], [Row("3-year vision", plan.Vision.ThreeYear), Row("1-year vision", plan.Vision.OneYear),
                .. plan.Vision.Objectives.Select((o, i) => Row($"Objective {i + 1}", o))]),
            new("S5 Strategic Direction", ["Strategy"], plan.StrategyIds.Select(id => (IReadOnlyList<object?>)[master.Strategy(id)]).ToList()),
            new("S6 Opportunity Matrix", ["Opportunity", "Offering", "Potential", "Effort", "Complexity", "Estimated value", "Priority", "Score"],
                plan.Opportunities.Select(o => (IReadOnlyList<object?>)[o.Title, o.OfferingName, o.Potential, o.Effort, o.Complexity, o.EstimatedValue, o.IsPriority ? "Yes" : "No", o.Score]).ToList()),
            new("S7 Mapping the account", ["Name", "Designation", "Role", "Importance", "Buying motive", "Perception of Psiog", "Vs competitors", "Knowledge"],
                plan.Stakeholders.Select(s => (IReadOnlyList<object?>)[s.Name, s.Title, s.Role.ToString(), s.Importance.ToString(), s.BuyingMotive, s.Perception, s.PerceptionVsCompetitors, s.Knowledge.ToString()]).ToList()),
            new("S8 Brickwall", ["Criterion", "Category", "Score", "Note"],
                plan.Brickwall.Select(b => (IReadOnlyList<object?>)[master.Criterion(b.CriterionId).Name, master.Criterion(b.CriterionId).Category, b.Score, b.Note]).ToList()),
            new("S9 Tactical Checklist", ["Opportunity", "Question", "Weight", "Answer"],
                plan.Tactical.SelectMany(t => t.Answers.Select(x => (IReadOnlyList<object?>)[plan.Opportunities.FirstOrDefault(o => o.Id == t.OpportunityId)?.Title,
                    master.Question(x.QuestionId).Text, master.Question(x.QuestionId).Weight, x.Answer?.ToString()])).ToList()),
            new("S10 Priority actions", ["Action", "Opportunity", "Owner", "Due", "Status"],
                plan.Actions.Where(x => x.ParentId is null && x.OpportunityId is not null).Select(x => (IReadOnlyList<object?>)[x.Title,
                    plan.Opportunities.FirstOrDefault(o => o.Id == x.OpportunityId)?.Title, x.OwnerName, x.DueDate.ToString("yyyy-MM-dd"), x.Status.ToString()]).ToList()),
            new("S11 Time bound action plan", ["Action", "Sub-action", "Owner", "Due", "Status", "Section"],
                ActionPlanRows(plan.Actions)),
            new("S12 Resources Needed", ["Type", "Description", "Amount"],
                plan.Resources.Select(r => (IReadOnlyList<object?>)[r.Type.ToString(), r.Description, r.Amount]).ToList()),
        };
        await audit.RecordAsync("export.account", $"account/{accountId}", AuditOutcome.Success, "", ct);
        return new FileResult($"{SafeFile(plan.Summary.Name)}-KAM-v{plan.Summary.CurrentVersion}.xlsx", writer.Write(sheets));
    }

    public async Task<FileResult> BdPackAsync(CancellationToken ct)
    {
        scope.EnsureRole(Role.GroupLead, Role.Executive, Role.AccountManager);
        var ids = await scope.VisibleAccountIdsAsync(ct);
        var list = await accounts.ListAsync(ids, ct);
        var master = await Master(ct);
        var names = await users.NamesAsync(list.SelectMany(a => a.Actions.Select(x => x.OwnerId)), ct);
        var ctx = await scoring.ContextAsync(ct);
        var today = DateOnly.FromDateTime(clock.UtcNow);
        var sheets = new List<WorkbookTable>
        {
            new("Opportunities", ["Account", "Type", "Opportunity", "Offering", "Potential", "Effort", "Complexity", "Value", "Priority", "Score"],
                list.SelectMany(a => a.Opportunities.Select(o => (IReadOnlyList<object?>)[a.Name, a.Type.ToString(), o.Title, master.Offering(o.OfferingId),
                    o.Potential, o.Effort, o.Complexity, o.EstimatedValue, o.IsPriority ? "Yes" : "No", Domain.Scoring.ScoringEngine.OpportunityScore(o, ctx)])).ToList()),
            new("Stakeholders", ["Account", "Name", "Designation", "Role", "Importance", "Perception", "Buying motive"],
                list.SelectMany(a => a.Stakeholders.Select(s => (IReadOnlyList<object?>)[a.Name, s.Name, s.Title, s.Role.ToString(), s.Importance.ToString(), s.Perception, s.BuyingMotive])).ToList()),
            new("Actions", ["Account", "Action", "Owner", "Due", "Status", "Overdue", "Origin"],
                list.SelectMany(a => a.Actions.Where(x => x.Status != ActionStatus.Done).Select(x => (IReadOnlyList<object?>)[a.Name, x.Title,
                    names.GetValueOrDefault(x.OwnerId, ""), x.DueDate.ToString("yyyy-MM-dd"), x.Status.ToString(), x.IsOverdue(today) ? "Yes" : "No", x.Origin.ToString()])).ToList()),
        };
        await audit.RecordAsync("export.bdpack", "exports/bd-pack", AuditOutcome.Success, $"{list.Count} accounts", ct);
        return new FileResult($"Kratos-BD-pack-{today:yyyy-MM-dd}.xlsx", writer.Write(sheets));
    }

    public async Task<FileResult> ExecutivePackAsync(CancellationToken ct)
    {
        scope.EnsureRole(Role.Executive);
        var mac = await views.MacAsync(ct);
        var today = DateOnly.FromDateTime(clock.UtcNow);
        var list = await accounts.ListAsync(await scope.VisibleAccountIdsAsync(ct), ct);
        var risks = new List<IReadOnlyList<object?>>();
        foreach (var a in list)
        {
            var s = await scoring.ScoreAsync(a, ct);
            foreach (var reason in s.RiskReasons) risks.Add([a.Name, s.RiskLevel.ToString(), reason]);
        }
        var sheets = new List<WorkbookTable>
        {
            new("Portfolio summary", ["Metric", "Value"], [Row("Accounts", mac.Totals.Accounts), Row("At high risk", mac.Totals.AtRisk),
                Row("Overdue actions", mac.Totals.OverdueActions), Row("Average health", mac.Totals.AvgHealth), Row("Generated", today.ToString("yyyy-MM-dd")),
                .. mac.HealthByGroup.Select(g => Row($"Avg health — {g.GroupName}", g.AvgHealth))]),
            new("Account health", ["Account", "Type", "Group", "Captain", "Health", "Risk", "Completion %", "Overdue", "Stale sections", "Last reviewed", "Version"],
                mac.Accounts.Select(a => (IReadOnlyList<object?>)[a.Name, a.Type.ToString(), a.GroupName, a.CaptainName, a.Health, a.RiskLevel.ToString(), a.Completion,
                    a.OverdueActions, a.StaleSections, a.LastReviewedAt?.ToString("yyyy-MM-dd"), a.CurrentVersion]).ToList()),
            new("Risks", ["Account", "Risk level", "Reason"], risks),
        };
        await audit.RecordAsync("export.execpack", "exports/executive-pack", AuditOutcome.Success, "", ct);
        return new FileResult($"Kratos-Executive-pack-{today:yyyy-MM-dd}.xlsx", writer.Write(sheets));
    }

    // ---------------- Deterministic extraction ----------------

    public static SectionKey? Recognise(string sheetName)
    {
        var n = Normalise(sheetName);
        // Explicit S-codes first ("S10 Priority actions" must not match "S1").
        var code = SheetCode().Match(n);
        if (code.Success)
        {
            return int.Parse(code.Groups[1].Value, CultureInfo.InvariantCulture) switch
            {
                1 => SectionKey.Profile, 2 => SectionKey.Infobase, 3 or 4 => SectionKey.Vision, 5 => SectionKey.Strategy,
                6 => SectionKey.Opportunities, 7 => SectionKey.Stakeholders, 8 => SectionKey.Brickwall, 9 => SectionKey.Tactical,
                10 => SectionKey.PriorityActions, 11 => SectionKey.ActionPlan, 12 => SectionKey.Resources, _ => null,
            };
        }
        foreach (var (section, keys) in SheetRules)
            if (keys.Where(k => !SheetCode().IsMatch(k)).Any(k => n.Contains(k, StringComparison.Ordinal))) return section;
        return null;
    }

    private static int ExtractSection(SectionKey section, WorkbookSheet sheet, ImportedPlan p, List<ImportFinding> findings)
    {
        var pairs = LabelValues(sheet);
        var table = Table(sheet);
        var n = 0;
        string? Find(params string[] keys) => pairs.FirstOrDefault(kv => keys.Any(k => kv.Label.Contains(k, StringComparison.Ordinal)))?.Value;
        void Set(Action<string> apply, string? value) { if (!string.IsNullOrWhiteSpace(value)) { apply(value.Trim()); n++; } }

        switch (section)
        {
            case SectionKey.Profile:
                Set(v => p.AccountName ??= v, Find("account name", "customer name", "client name", "company name", "account"));
                Set(v => p.CxoConnect = v, Find("cxo"));
                Set(v => p.Challenges = v, Find("challenge", "pain"));
                if (Find("run rate", "revenue", "billing") is { } rr && TryMoney(rr, out var money)) { p.CurrentRunRate = money; n++; }
                if (Find("since", "start", "age") is { } since && TryDate(since, out var d)) { p.AccountSince = d; n++; }
                break;
            case SectionKey.Infobase:
                Set(v => p.Unknowns = v, Find("don't know", "dont know", "do not know", "doesn't know", "does not know", "unknown"));
                Set(v => p.KnownUnconfirmed = v, Find("not confirmed", "unconfirmed", "hasn't confirmed", "to be confirmed"));
                Set(v => p.GrowthLevers = v, Find("grow", "lever", "can use"));
                break;
            case SectionKey.Vision:
                Set(v => p.VisionThreeYear = v, Find("3 year", "three year", "3-year", "3 yr"));
                Set(v => p.VisionOneYear = v, Find("1 year", "one year", "1-year", "this year"));
                foreach (var kv in pairs.Where(kv => kv.Label.Contains("objective", StringComparison.Ordinal)))
                {
                    p.Objectives.Add(kv.Value);
                    n++;
                }
                break;
            case SectionKey.Strategy:
                if (table is null)
                {
                    // Single-column list of chosen strategies.
                    foreach (var c in sheet.Cells.Where(c => c.Value.Length > 3 && !Normalise(c.Value).StartsWith("strateg", StringComparison.Ordinal)))
                    {
                        p.Strategies.Add(c.Value);
                        n++;
                    }
                    break;
                }
                foreach (var row in table.Rows)
                {
                    var name = Col(table!, row, "strateg", "reason", "direction") ?? row.FirstOrDefault(v => v.Length > 3);
                    var selected = Col(table!, row, "select", "yes", "applicable", "chosen");
                    if (name is not null && (selected is null || IsYes(selected))) { p.Strategies.Add(name); n++; }
                }
                break;
            case SectionKey.Opportunities:
                foreach (var row in table?.Rows ?? [])
                {
                    var title = Col(table!, row, "opportunit", "requirement", "description");
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    p.Opportunities.Add(new ImportedOpportunity(title, Col(table!, row, "offering", "service", "practice") ?? "",
                        Score(Col(table!, row, "potential", "value", "size")), Score(Col(table!, row, "effort")), Score(Col(table!, row, "complex")),
                        IsYes(Col(table!, row, "priority") ?? "")));
                    n++;
                }
                break;
            case SectionKey.Stakeholders:
                foreach (var row in table?.Rows ?? [])
                {
                    var name = Col(table!, row, "name", "stakeholder");
                    if (string.IsNullOrWhiteSpace(name)) continue;
                    int? perception = int.TryParse(Col(table!, row, "perception", "rating") ?? "", out var pv) ? pv : null;
                    p.Stakeholders.Add(new ImportedStakeholder(name, Col(table!, row, "designation", "title", "position") ?? "",
                        Col(table!, row, "role", "decision", "influence") ?? "", Col(table!, row, "importance", "priority", "a/b/c") ?? "",
                        Col(table!, row, "motive", "buying") ?? "", perception));
                    n++;
                }
                break;
            case SectionKey.Brickwall:
                foreach (var row in table?.Rows ?? [])
                {
                    var crit = Col(table!, row, "criteri", "parameter", "relationship", "attribute") ?? row.FirstOrDefault();
                    var score = Col(table!, row, "score", "rating", "current");
                    if (crit is not null && int.TryParse(score, out var s) && s is >= 1 and <= 5) { p.Brickwall.Add(new ImportedRating(crit, s)); n++; }
                }
                break;
            case SectionKey.PriorityActions:
            case SectionKey.ActionPlan:
                foreach (var row in table?.Rows ?? [])
                {
                    var sub = Col(table!, row, "sub");
                    var main = Col(table!, row, "action", "activity", "task");
                    var title = string.IsNullOrWhiteSpace(sub) ? main : sub;
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    DateOnly? due = TryDate(Col(table!, row, "date", "due", "by when", "timeline") ?? "", out var dd) ? dd : null;
                    p.Actions.Add(new ImportedAction(title, Col(table!, row, "owner", "responsib", "who") ?? "", due,
                        !string.IsNullOrWhiteSpace(sub) && string.IsNullOrWhiteSpace(main), section == SectionKey.PriorityActions ? "S10" : "S11"));
                    n++;
                }
                break;
            case SectionKey.Resources:
                foreach (var kv in pairs)
                {
                    ResourceType? type = kv.Label.Contains("money", StringComparison.Ordinal) || kv.Label.Contains("budget", StringComparison.Ordinal) ? ResourceType.Money
                        : kv.Label.Contains("expert", StringComparison.Ordinal) || kv.Label.Contains("specialist", StringComparison.Ordinal) ? ResourceType.Expertise
                        : kv.Label.Contains("management", StringComparison.Ordinal) ? ResourceType.ManagementTime
                        : kv.Label.Contains("travel", StringComparison.Ordinal) ? ResourceType.Travel : null;
                    if (type is null) continue;
                    p.Resources.Add(new ImportedResource(type.Value, kv.Value, TryMoney(kv.Value, out var amt) ? amt : null));
                    n++;
                }
                break;
            case SectionKey.Tactical:
                // Checklist answers need priority opportunities to exist first; counted for the report only.
                n = table?.Rows.Count ?? 0;
                if (n > 0) findings.Add(new("Info", sheet.Name, null, "Tactical checklist answers are re-entered against priority opportunities after import."));
                break;
        }
        return n;
    }

    private static void ApplyGuesses(WorkbookInterpreterAgent.Output g, ImportedPlan p, Dictionary<SectionKey, (int, decimal)> counts, List<ImportFinding> findings)
    {
        if (!string.IsNullOrWhiteSpace(g.AccountName) && string.IsNullOrWhiteSpace(p.AccountName)) p.AccountName = AiJson.Clean(g.AccountName, Limits.Name);
        // The AI only fills gaps: list sections the rules already read from their own sheet are never topped up with guesses.
        var hadStakeholders = p.Stakeholders.Count > 0;
        var hadOpportunities = p.Opportunities.Count > 0;
        var hadResources = p.Resources.Count > 0;
        var hadObjectives = p.Objectives.Count > 0;
        foreach (var f in (g.Fields ?? []).Where(f => f.Confidence >= 0.5m && !string.IsNullOrWhiteSpace(f.Value)))
        {
            var value = AiJson.Clean(f.Value, Limits.LongText);
            SectionKey? section = null;
            switch ($"{f.Section}.{f.Field}".ToLowerInvariant().Replace("profile.profile.", "profile.", StringComparison.Ordinal))
            {
                case "profile.cxoconnect": if (p.CxoConnect.Length == 0) { p.CxoConnect = value; section = SectionKey.Profile; } break;
                case "profile.challenges": if (p.Challenges.Length == 0) { p.Challenges = value; section = SectionKey.Profile; } break;
                case "profile.currentrunrate": if (p.CurrentRunRate is null && TryMoney(value, out var m)) { p.CurrentRunRate = m; section = SectionKey.Profile; } break;
                case "profile.accountsince": if (p.AccountSince is null && TryDate(value, out var d)) { p.AccountSince = d; section = SectionKey.Profile; } break;
                case "infobase.unknowns": if (p.Unknowns.Length == 0) { p.Unknowns = value; section = SectionKey.Infobase; } break;
                case "infobase.knownunconfirmed": if (p.KnownUnconfirmed.Length == 0) { p.KnownUnconfirmed = value; section = SectionKey.Infobase; } break;
                case "infobase.growthlevers": if (p.GrowthLevers.Length == 0) { p.GrowthLevers = value; section = SectionKey.Infobase; } break;
                case "vision.threeyear": if (p.VisionThreeYear.Length == 0) { p.VisionThreeYear = value; section = SectionKey.Vision; } break;
                case "vision.oneyear": if (p.VisionOneYear.Length == 0) { p.VisionOneYear = value; section = SectionKey.Vision; } break;
                case "vision.objective": if (!hadObjectives) { p.Objectives.Add(value); section = SectionKey.Vision; } break;
                case "stakeholders.name": if (!hadStakeholders) { p.Stakeholders.Add(new ImportedStakeholder(value, "", "", "", "", null)); section = SectionKey.Stakeholders; } break;
                case "opportunities.title": if (!hadOpportunities) { p.Opportunities.Add(new ImportedOpportunity(value, "", 3, 3, 3, false)); section = SectionKey.Opportunities; } break;
                case "resources.description": if (!hadResources) { p.Resources.Add(new ImportedResource(ResourceType.Expertise, value, null)); section = SectionKey.Resources; } break;
            }
            if (section is { } s)
            {
                var (count, conf) = counts.GetValueOrDefault(s);
                counts[s] = (count + 1, count == 0 ? f.Confidence : Math.Min(conf, f.Confidence));
                findings.Add(new("Info", f.Cell.Split('!')[0], f.Cell, $"AI mapped a value to {f.Section}.{f.Field} (confidence {f.Confidence:0.00}). Review before committing."));
            }
        }
        foreach (var note in (g.Notes ?? []).Take(10)) findings.Add(new("Info", "(AI)", null, AiJson.Clean(note, 300)));
    }

    private sealed record Pair(string Label, string Value);
    private sealed record SheetTable(IReadOnlyList<string> Headers, List<List<string>> Rows);

    /// <summary>Label in one cell, value in the next non-empty cell to the right (or directly below for long text blocks).</summary>
    private static List<Pair> LabelValues(WorkbookSheet sheet)
    {
        var byRow = sheet.Cells.GroupBy(c => c.Row).ToDictionary(g => g.Key, g => g.OrderBy(c => c.Column).ToList());
        var pairs = new List<Pair>();
        foreach (var (row, cells) in byRow.OrderBy(k => k.Key))
        {
            for (var i = 0; i < cells.Count; i++)
            {
                var label = cells[i].Value.Trim();
                if (label.Length is < 2 or > 120 || double.TryParse(label, out _)) continue;
                string? value = i + 1 < cells.Count ? cells[i + 1].Value : null;
                if (value is null && byRow.TryGetValue(row + 1, out var next))
                    value = next.FirstOrDefault(c => c.Column == cells[i].Column)?.Value;
                if (!string.IsNullOrWhiteSpace(value) && !value.Equals(label, StringComparison.Ordinal))
                    pairs.Add(new Pair(Normalise(label), value.Trim()));
                break;
            }
        }
        return pairs;
    }

    /// <summary>The first row with three or more text cells is the header; following rows are records.</summary>
    private static SheetTable? Table(WorkbookSheet sheet)
    {
        var rows = sheet.Cells.GroupBy(c => c.Row).OrderBy(g => g.Key).Select(g => g.OrderBy(c => c.Column).ToList()).ToList();
        var headerIdx = rows.FindIndex(r => r.Count(c => c.Value.Length is > 1 and < 60 && !double.TryParse(c.Value, out _)) >= 3);
        if (headerIdx < 0) return null;
        var header = rows[headerIdx];
        var cols = header.Select(c => c.Column).ToList();
        var records = rows.Skip(headerIdx + 1)
            .Select(r => cols.Select(col => r.FirstOrDefault(c => c.Column == col)?.Value.Trim() ?? "").ToList())
            .Where(r => r.Count(v => v.Length > 0) >= 1)
            .ToList();
        return new SheetTable(header.Select(h => Normalise(h.Value)).ToList(), records);
    }

    private static string? Col(SheetTable t, List<string> row, params string[] keys)
    {
        for (var i = 0; i < t.Headers.Count && i < row.Count; i++)
            if (keys.Any(k => t.Headers[i].Contains(k, StringComparison.Ordinal)) && row[i].Length > 0) return row[i];
        return null;
    }

    private static int Score(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return 3;
        if (int.TryParse(v, out var n)) return Math.Clamp(n, 1, 5);
        var s = v.ToLowerInvariant();
        return s.StartsWith('h') ? 5 : s.StartsWith('l') ? 1 : 3;
    }

    private static bool IsYes(string v) => v.Trim().ToLowerInvariant() is "y" or "yes" or "true" or "1" or "x" or "✓" or "priority" or "p1" or "high";

    private static bool TryMoney(string v, out decimal amount)
    {
        var s = MoneyNoise().Replace(v.ToLowerInvariant(), "");
        var mult = 1m;
        if (s.EndsWith('m')) { mult = 1_000_000; s = s[..^1]; }
        else if (s.EndsWith('k')) { mult = 1_000; s = s[..^1]; }
        var ok = decimal.TryParse(s, NumberStyles.Number, CultureInfo.InvariantCulture, out amount);
        amount *= mult;
        return ok && amount >= 0;
    }

    private static bool TryDate(string v, out DateOnly date)
    {
        if (DateOnly.TryParse(v, CultureInfo.InvariantCulture, out date)) return true;
        if (DateTime.TryParse(v, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt)) { date = DateOnly.FromDateTime(dt); return true; }
        if (double.TryParse(v, NumberStyles.Number, CultureInfo.InvariantCulture, out var serial) && serial is > 20000 and < 80000)
        { date = DateOnly.FromDateTime(DateTime.FromOADate(serial)); return true; }
        if (int.TryParse(v, out var year) && year is > 1980 and < 2100) { date = new DateOnly(year, 1, 1); return true; }
        return false;
    }

    private static string? GuessAccountName(WorkbookModel model, string fileName)
    {
        var stem = Path.GetFileNameWithoutExtension(fileName);
        var cleaned = FileNoise().Replace(stem, " ").Trim();
        return cleaned.Length >= 2 ? cleaned : null;
    }

    private static T? BestMatch<T>(IEnumerable<T> items, Func<T, string> name, string query) where T : class
    {
        if (string.IsNullOrWhiteSpace(query)) return null;
        var q = Normalise(query);
        return items.FirstOrDefault(i => Normalise(name(i)) == q)
            ?? items.FirstOrDefault(i => Normalise(name(i)).Contains(q, StringComparison.Ordinal) || q.Contains(Normalise(name(i)), StringComparison.Ordinal));
    }

    private static StakeholderRole ParseRole(string v)
    {
        var s = v.ToLowerInvariant();
        return s.Contains("decision", StringComparison.Ordinal) || s == "dm" ? StakeholderRole.DecisionMaker
            : s.Contains("gate", StringComparison.Ordinal) ? StakeholderRole.Gatekeeper
            : s.Contains("user", StringComparison.Ordinal) ? StakeholderRole.User : StakeholderRole.Influencer;
    }

    private static Importance ParseImportance(string v) => v.Trim().ToUpperInvariant() switch { "A" or "HIGH" => Importance.A, "C" or "LOW" => Importance.C, _ => Importance.B };

    private static string Normalise(string s) => Spaces().Replace(s.ToLowerInvariant().Replace('_', ' ').Replace(':', ' '), " ").Trim();
    private static string Merge(string existing, string incoming) => string.IsNullOrWhiteSpace(existing) ? Cap(incoming, Limits.LongText) : existing;
    private static string Cap(string s, int max) => s.Length > max ? s[..max] : s;
    private static string SafeFile(string s) => FileNoise().Replace(s, "-").Trim('-');
    private static IReadOnlyList<object?> Row(string label, object? value) => [label, value];
    private static void Add(Dictionary<SectionKey, (int Fields, decimal Confidence)> d, SectionKey k, int n, decimal c)
    {
        var (f, conf) = d.GetValueOrDefault(k);
        if (n > 0) d[k] = (f + n, f == 0 ? c : Math.Min(conf, c));
    }

    private static List<IReadOnlyList<object?>> ActionPlanRows(IReadOnlyList<ActionDto> actions)
    {
        var rows = new List<IReadOnlyList<object?>>();
        foreach (var parent in actions.Where(a => a.ParentId is null).OrderBy(a => a.DueDate))
        {
            rows.Add([parent.Title, null, parent.OwnerName, parent.DueDate.ToString("yyyy-MM-dd"), parent.Status.ToString(), parent.SourceSection.ToString()]);
            foreach (var sub in actions.Where(a => a.ParentId == parent.Id).OrderBy(a => a.DueDate))
                rows.Add([null, sub.Title, sub.OwnerName, sub.DueDate.ToString("yyyy-MM-dd"), sub.Status.ToString(), sub.SourceSection.ToString()]);
        }
        return rows;
    }

    private sealed record MasterLookup(Dictionary<Guid, string> Offerings, Dictionary<Guid, string> Strategies,
        Dictionary<Guid, BrickwallCriterion> Criteria, Dictionary<Guid, ChecklistQuestion> Questions)
    {
        public string Offering(Guid id) => Offerings.GetValueOrDefault(id, "");
        public string Strategy(Guid id) => Strategies.GetValueOrDefault(id, "");
        public BrickwallCriterion Criterion(Guid id) => Criteria.GetValueOrDefault(id) ?? new BrickwallCriterion { Name = "(removed)" };
        public ChecklistQuestion Question(Guid id) => Questions.GetValueOrDefault(id) ?? new ChecklistQuestion { Text = "(removed)" };
    }

    private async Task<MasterLookup> Master(CancellationToken ct) => new(
        (await master.OfferingsAsync(ct)).ToDictionary(o => o.Id, o => o.Name),
        (await master.StrategiesAsync(ct)).ToDictionary(o => o.Id, o => o.Name),
        (await master.CriteriaAsync(ct)).ToDictionary(o => o.Id),
        (await master.QuestionsAsync(ct)).ToDictionary(o => o.Id));

    [GeneratedRegex(@"^s\s?(\d{1,2})\b")] private static partial Regex SheetCode();
    [GeneratedRegex(@"\s+")] private static partial Regex Spaces();
    [GeneratedRegex(@"[^0-9.km]")] private static partial Regex MoneyNoise();
    [GeneratedRegex(@"[^A-Za-z0-9]+")] private static partial Regex FileNoise();
}
