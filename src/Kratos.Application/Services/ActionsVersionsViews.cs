using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Services;

public sealed class ActionService(
    IActionRepository actions, IAccountRepository accounts, IUserRepository users, IUnitOfWork uow,
    AccessScope scope, IAuditService audit, IClock clock)
{
    public async Task<List<ActionDto>> ListAsync(Guid? accountId, ActionStatus? status, bool mine, bool overdue, Guid currentUserId, CancellationToken ct)
    {
        if (!scope.CanReadPlanContent) throw new ForbiddenException();
        var visible = await scope.VisibleAccountIdsAsync(ct);
        IReadOnlyCollection<Guid> ids = visible;
        if (accountId is { } id)
        {
            if (!visible.Contains(id)) throw new NotFoundException("Account");
            ids = [id];
        }
        var today = DateOnly.FromDateTime(clock.UtcNow);
        var list = await actions.ListAsync(new ActionQuery(ids, status, mine ? currentUserId : null, overdue, today), ct);
        var accountNames = (await accounts.ListAsync(list.Select(a => a.AccountId).Distinct().ToList(), ct)).ToDictionary(a => a.Id, a => a.Name);
        var names = await users.NamesAsync(list.Select(a => a.OwnerId), ct);
        return list.OrderBy(a => a.DueDate).Select(a => ToDto(a, accountNames.GetValueOrDefault(a.AccountId, ""), names, today)).ToList();
    }

    public async Task<ActionDto> CreateAsync(Guid accountId, CreateActionRequest r, ActionOrigin origin, CancellationToken ct)
    {
        new Validator().Text(r.Title, "title", Limits.ShortText, required: true)
            .Require(r.DueDate >= DateOnly.FromDateTime(clock.UtcNow).AddDays(-1), "dueDate", "Due date cannot be in the past.")
            .Require(r.DueDate <= DateOnly.FromDateTime(clock.UtcNow).AddYears(3), "dueDate", "Due date must be within three years.")
            .ThrowIfInvalid();
        await scope.EnsureCanEditAsync(accountId, ct);
        var a = await accounts.GetAsync(accountId, ct) ?? throw new NotFoundException("Account");
        await EnsureOwnerAsync(a, r.OwnerId, ct);
        if (r.OpportunityId is { } oid && a.Opportunities.All(o => o.Id != oid))
            throw new ValidationException("opportunityId", "That opportunity is not on this account.");
        if (r.ParentId is { } pid)
        {
            var parent = a.Actions.FirstOrDefault(x => x.Id == pid) ?? throw new ValidationException("parentId", "Parent action not found on this account.");
            if (parent.ParentId is not null) throw new ValidationException("parentId", "Sub-actions can only be one level deep.");
            if (r.DueDate > parent.DueDate) throw new ValidationException("dueDate", "A sub-action must be due on or before its parent action.");
        }
        var item = new ActionItem
        {
            AccountId = accountId, Title = r.Title.Trim(), SourceSection = r.SourceSection, OpportunityId = r.OpportunityId,
            OwnerId = r.OwnerId, DueDate = r.DueDate, ParentId = r.ParentId, Origin = origin, CreatedAt = clock.UtcNow,
        };
        actions.Add(item);
        a.Touch(r.ParentId is null && r.OpportunityId is not null ? SectionKey.PriorityActions : SectionKey.ActionPlan, clock.UtcNow);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("action.create", $"action/{item.Id}", AuditOutcome.Success, origin.ToString(), ct);
        var names = await users.NamesAsync([item.OwnerId], ct);
        return ToDto(item, a.Name, names, DateOnly.FromDateTime(clock.UtcNow));
    }

    public async Task<ActionDto> PatchAsync(Guid id, PatchActionRequest r, CancellationToken ct)
    {
        var item = await actions.GetAsync(id, ct) ?? throw new NotFoundException("Action");
        await scope.EnsureCanEditAsync(item.AccountId, ct);
        var a = await accounts.GetAsync(item.AccountId, ct) ?? throw new NotFoundException("Account");
        if (r.Title is not null) { new Validator().Text(r.Title, "title", Limits.ShortText, required: true).ThrowIfInvalid(); item.Title = r.Title.Trim(); }
        if (r.OwnerId is { } owner) { await EnsureOwnerAsync(a, owner, ct); item.OwnerId = owner; }
        if (r.DueDate is { } due)
        {
            if (due > DateOnly.FromDateTime(clock.UtcNow).AddYears(3)) throw new ValidationException("dueDate", "Due date must be within three years.");
            item.DueDate = due;
        }
        if (r.Status is { } st)
        {
            if (st == ActionStatus.Done && a.Actions.Any(x => x.ParentId == item.Id && x.Status != ActionStatus.Done))
                throw new ValidationException("status", "Finish the sub-actions before closing this action.");
            item.Status = st;
            item.CompletedAt = st == ActionStatus.Done ? clock.UtcNow : null;
        }
        a.Touch(SectionKey.ActionPlan, clock.UtcNow);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("action.update", $"action/{item.Id}", AuditOutcome.Success, r.Status?.ToString() ?? "", ct);
        var names = await users.NamesAsync([item.OwnerId], ct);
        return ToDto(item, a.Name, names, DateOnly.FromDateTime(clock.UtcNow));
    }

    private async Task EnsureOwnerAsync(Account a, Guid ownerId, CancellationToken ct)
    {
        var owner = await users.GetAsync(ownerId, ct);
        if (owner is not { IsActive: true } || owner.Role == Role.Admin)
            throw new ValidationException("ownerId", "The owner must be an active member of the account team.");
        if (a.CaptainId != ownerId && a.Team.All(t => t.UserId != ownerId) && owner.Role != Role.GroupLead)
            throw new ValidationException("ownerId", "Add this person to the account team before assigning them actions.");
    }

    public static ActionDto ToDto(ActionItem a, string accountName, IReadOnlyDictionary<Guid, string> names, DateOnly today) =>
        new(a.Id, a.AccountId, accountName, a.Title, a.SourceSection, a.OpportunityId, a.OwnerId, names.GetValueOrDefault(a.OwnerId, "Unknown user"),
            a.DueDate, a.Status, a.IsOverdue(today), a.ParentId, a.Origin, a.CreatedAt);
}

public sealed class VersionService(
    IVersionRepository versions, IAccountRepository accounts, IUserRepository users, IUnitOfWork uow,
    AccessScope scope, ScoringService scoring, AccountService accountService, ICurrentUser user, IAuditService audit, IClock clock)
{
    public async Task<VersionDto> CreateAsync(Guid accountId, CreateVersionRequest r, CancellationToken ct)
    {
        new Validator().Text(r.ChangeSummary, "changeSummary", Limits.ShortText).ThrowIfInvalid();
        await scope.EnsureCanEditAsync(accountId, ct);
        var a = await accounts.GetAsync(accountId, ct) ?? throw new NotFoundException("Account");
        var plan = await accountService.ToPlanAsync(a, ct);
        var v = new PlanVersion
        {
            AccountId = a.Id, Number = a.CurrentVersion + 1, CreatedAt = clock.UtcNow, CreatedById = user.Id,
            ChangeSummary = string.IsNullOrWhiteSpace(r.ChangeSummary) ? "Periodic review" : r.ChangeSummary.Trim(),
            SnapshotJson = JsonSerializer.Serialize(plan, Json.Options),
            ScoresJson = JsonSerializer.Serialize(plan.Scores, Json.Options),
        };
        versions.Add(v);
        a.CurrentVersion = v.Number;
        a.LastReviewedAt = clock.UtcNow;
        // A review re-confirms every section, so staleness resets.
        foreach (var (key, _, _) in ScoringEngine.Catalog) a.SectionUpdatedAt[key] = clock.UtcNow;
        a.RowVersion = Guid.NewGuid();
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("plan.version", $"account/{a.Id}", AuditOutcome.Success, $"v{v.Number}", ct);
        return new VersionDto(v.Number, v.CreatedAt, user.Email, v.ChangeSummary, plan.Scores);
    }

    public async Task<List<VersionDto>> ListAsync(Guid accountId, CancellationToken ct)
    {
        await scope.EnsureCanReadPlanAsync(accountId, ct);
        var list = await versions.ListAsync(accountId, ct);
        var names = await users.NamesAsync(list.Select(v => v.CreatedById), ct);
        return list.OrderByDescending(v => v.Number).Select(v => new VersionDto(v.Number, v.CreatedAt,
            names.GetValueOrDefault(v.CreatedById, "Unknown user"), v.ChangeSummary,
            JsonSerializer.Deserialize<ScoresDto>(v.ScoresJson, Json.Options)!)).ToList();
    }

    public async Task<TrendDto> TrendAsync(Guid accountId, CancellationToken ct)
    {
        await scope.EnsureCanReadPlanAsync(accountId, ct);
        var list = await versions.ListAsync(accountId, ct);
        var points = list.OrderBy(v => v.Number).Select(v =>
        {
            var s = JsonSerializer.Deserialize<ScoresDto>(v.ScoresJson, Json.Options)!;
            return new TrendPoint(v.Number, DateOnly.FromDateTime(v.CreatedAt), s.Health, s.Opportunity, s.Brickwall, s.Checklist, s.Perception);
        }).ToList();
        return new TrendDto(points);
    }

    public async Task<DiffDto> DiffAsync(Guid accountId, int number, int against, CancellationToken ct)
    {
        await scope.EnsureCanReadPlanAsync(accountId, ct);
        var a = await versions.GetAsync(accountId, number, ct) ?? throw new NotFoundException("Version");
        var b = await versions.GetAsync(accountId, against, ct) ?? throw new NotFoundException("Version");
        var before = JsonSerializer.Deserialize<AccountPlanDto>(b.SnapshotJson, Json.Options)!;
        var after = JsonSerializer.Deserialize<AccountPlanDto>(a.SnapshotJson, Json.Options)!;
        return new DiffDto(PlanDiff.Compare(before, after));
    }
}

/// <summary>Field-level diff between two plan snapshots, grouped by S-section.</summary>
public static class PlanDiff
{
    public static List<DiffChange> Compare(AccountPlanDto before, AccountPlanDto after)
    {
        var changes = new List<DiffChange>();
        void Add(SectionKey s, string field, object? x, object? y)
        {
            var bx = Render(x);
            var by = Render(y);
            if (bx != by) changes.Add(new DiffChange(s, field, bx, by));
        }

        Add(SectionKey.Profile, "Account since", before.Profile.AccountSince, after.Profile.AccountSince);
        Add(SectionKey.Profile, "Current run rate", before.Profile.CurrentRunRate, after.Profile.CurrentRunRate);
        Add(SectionKey.Profile, "CXO connect", before.Profile.CxoConnect, after.Profile.CxoConnect);
        Add(SectionKey.Profile, "Challenges", before.Profile.Challenges, after.Profile.Challenges);
        Add(SectionKey.Profile, "Team", string.Join(", ", before.Team.Select(t => $"{t.DisplayName} ({t.Raci})")), string.Join(", ", after.Team.Select(t => $"{t.DisplayName} ({t.Raci})")));
        Add(SectionKey.Infobase, "Unknowns", before.Infobase.Unknowns, after.Infobase.Unknowns);
        Add(SectionKey.Infobase, "Known but unconfirmed", before.Infobase.KnownUnconfirmed, after.Infobase.KnownUnconfirmed);
        Add(SectionKey.Infobase, "Growth levers", before.Infobase.GrowthLevers, after.Infobase.GrowthLevers);
        Add(SectionKey.Vision, "3-year vision", before.Vision.ThreeYear, after.Vision.ThreeYear);
        Add(SectionKey.Vision, "1-year vision", before.Vision.OneYear, after.Vision.OneYear);
        Add(SectionKey.Vision, "Objectives", string.Join("; ", before.Vision.Objectives), string.Join("; ", after.Vision.Objectives));
        Add(SectionKey.Strategy, "Strategies selected", before.StrategyIds.Count, after.StrategyIds.Count);

        CompareSet(changes, SectionKey.Opportunities, before.Opportunities, after.Opportunities, o => o.Id, o => o.Title,
            o => $"P{o.Potential}/E{o.Effort}/C{o.Complexity}{(o.IsPriority ? " priority" : "")}");
        CompareSet(changes, SectionKey.Stakeholders, before.Stakeholders, after.Stakeholders, s => s.Id, s => s.Name,
            s => $"{s.Role}, {s.Importance}, perception {s.Perception?.ToString() ?? "–"}");
        CompareSet(changes, SectionKey.Resources, before.Resources, after.Resources, r => r.Id, r => r.Type.ToString(), r => $"{r.Description} {r.Amount}");
        CompareSet(changes, SectionKey.ActionPlan, before.Actions, after.Actions, x => x.Id, x => x.Title, x => $"{x.Status}, due {x.DueDate:yyyy-MM-dd}");

        Add(SectionKey.Brickwall, "Relationship score", before.Scores.Brickwall, after.Scores.Brickwall);
        Add(SectionKey.Tactical, "Checklist score", before.Scores.Checklist, after.Scores.Checklist);
        return changes;
    }

    private static void CompareSet<T>(List<DiffChange> changes, SectionKey section, IEnumerable<T> before, IEnumerable<T> after,
        Func<T, Guid> id, Func<T, string> label, Func<T, string> render)
    {
        var b = before.ToDictionary(id);
        var a = after.ToDictionary(id);
        foreach (var (k, v) in a)
        {
            if (!b.TryGetValue(k, out var old)) changes.Add(new DiffChange(section, label(v), "(added)", render(v)));
            else if (render(old) != render(v) || label(old) != label(v)) changes.Add(new DiffChange(section, label(v), render(old), render(v)));
        }
        foreach (var (k, v) in b)
            if (!a.ContainsKey(k)) changes.Add(new DiffChange(section, label(v), render(v), "(removed)"));
    }

    private static string Render(object? v) => v switch
    {
        null => "",
        DateOnly d => d.ToString("yyyy-MM-dd"),
        decimal m => m.ToString("0.##"),
        _ => v.ToString() ?? "",
    };
}

public sealed class ViewService(IAccountRepository accounts, AccessScope scope, ScoringService scoring, IMasterDataRepository master)
{
    public async Task<MacViewDto> MacAsync(CancellationToken ct)
    {
        EnsurePlanReader();
        var list = await accounts.ListAsync(await scope.VisibleAccountIdsAsync(ct), ct);
        var summaries = await scoring.SummariesAsync(list, ct);
        var totals = new MacTotals(summaries.Count, summaries.Count(s => s.RiskLevel == RiskLevel.High),
            summaries.Sum(s => s.OverdueActions), summaries.Count == 0 ? 0 : Math.Round(summaries.Average(s => s.Health), 1));
        var byGroup = summaries.GroupBy(s => s.GroupName).Select(g => new GroupHealth(g.Key, Math.Round(g.Average(x => x.Health), 1))).OrderBy(g => g.GroupName).ToList();
        return new MacViewDto(totals, summaries.OrderBy(s => s.Health).ToList(), byGroup);
    }

    public async Task<NbdViewDto> NbdAsync(CancellationToken ct)
    {
        EnsurePlanReader();
        var list = (await accounts.ListAsync(await scope.VisibleAccountIdsAsync(ct), ct)).Where(a => a.Type == AccountType.NBD).ToList();
        var summaries = (await scoring.SummariesAsync(list, ct)).ToDictionary(s => s.Id);
        var ctx = await scoring.ContextAsync(ct);
        var rows = new List<NbdAccountDto>();
        foreach (var a in list)
        {
            var scores = ScoringEngine.Calculate(a, ctx);
            // Readiness to win: how prepared the team is on its priority opportunities.
            var readiness = Math.Round((scores.Checklist * 0.5m) + (scores.Perception * 0.3m) + (scores.Completion * 0.2m), 1);
            var top = new List<OpportunityDto>();
            foreach (var o in a.Opportunities.OrderByDescending(o => ScoringEngine.OpportunityScore(o, ctx)).Take(3))
                top.Add(new OpportunityDto(o.Id, o.Title, o.OfferingId, await scoring.OfferingNameAsync(o.OfferingId, ct), o.Potential, o.Effort,
                    o.Complexity, o.EstimatedValue, o.IsPriority, ScoringEngine.OpportunityScore(o, ctx)));
            rows.Add(new NbdAccountDto(summaries[a.Id], readiness, top));
        }
        return new NbdViewDto(rows.OrderByDescending(r => r.Readiness).ToList());
    }

    public async Task<EbdViewDto> EbdAsync(CancellationToken ct)
    {
        EnsurePlanReader();
        var list = (await accounts.ListAsync(await scope.VisibleAccountIdsAsync(ct), ct)).Where(a => a.Type == AccountType.EBD).ToList();
        var offerings = (await master.OfferingsAsync(ct)).Where(o => o.IsActive).OrderBy(o => o.Name).ToList();
        var ctx = await scoring.ContextAsync(ct);
        var rows = list.OrderBy(a => a.Name).Select(a => new EbdRow(a.Id, a.Name, ScoringEngine.BrickwallScore(a, ctx),
            offerings.Select(o => new EbdCell(o.Id,
                a.CurrentOfferingIds.Contains(o.Id) ? "Current"
                : a.Opportunities.Any(x => x.OfferingId == o.Id) ? "Opportunity"
                : a.AspirationalOfferingIds.Contains(o.Id) ? "Aspirational" : "None")).ToList())).ToList();
        return new EbdViewDto(offerings.Select(o => new IdName(o.Id, o.Name)).ToList(), rows);
    }

    private void EnsurePlanReader()
    {
        if (!scope.CanReadPlanContent) throw new ForbiddenException("Portfolio views show plan content, which Admins cannot see.");
    }
}
