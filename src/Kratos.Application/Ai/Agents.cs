using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Application.Services;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Ai;

/// <summary>AC 8. Recommends what to do next, whose help to seek, which channel and why. Uses read-only tools scoped to one account.</summary>
public sealed class NextBestActionAgent(
    IAiGateway ai, AccountService accounts, AccessScope scope, IAiRepository repo, IUnitOfWork uow,
    IUserRepository users, IAuditService audit, ICurrentUser user, IClock clock, ActionService actions)
{
    public const string Name = "next-best-action";

    internal sealed record Output(string Action, List<HelperDto> WhoseHelp, string Channel, string Rationale,
        List<string> SourceSections, bool AtRisk, string? RiskReason);

    private static readonly string[] Channels = ["Meeting", "Email", "ExecutiveConnect", "Event", "Call", "Workshop"];

    public async Task<RecommendationDto> RecommendAsync(Guid accountId, CancellationToken ct)
    {
        await scope.EnsureCanEditAsync(accountId, ct);
        var plan = await accounts.GetPlanAsync(accountId, ct);
        var internalPeople = (await users.ListAsync(ct)).Where(u => u.IsActive && u.Role != Role.Admin)
            .Select(u => new { u.DisplayName, role = u.Role.ToString() }).ToList();

        var tools = new List<AiTool>
        {
            Tool("get_plan_gaps", "Sections of the account plan (S1-S12) with completion % and staleness. Use to find what is missing or out of date.",
                () => plan.Sections.Select(s => new { s.Code, s.Key, s.Title, s.Completion, s.IsStale })),
            Tool("get_scores", "Current deterministic scores (0-100) and rule-based risk reasons for the account.",
                () => new { plan.Scores, opportunities = plan.Opportunities.Select(o => new { o.Title, o.OfferingName, o.Potential, o.Effort, o.Complexity, o.IsPriority, o.Score }) }),
            Tool("get_stakeholder_map", "Customer stakeholders with role, importance A/B/C, buying motive and perception of Psiog (1-5).",
                () => plan.Stakeholders.Select(s => new { s.Name, s.Title, s.Role, s.Importance, s.BuyingMotive, s.Perception, s.PerceptionVsCompetitors, s.Knowledge })),
            Tool("get_overdue_and_open_actions", "Open and overdue actions with owner, due date and the section they came from.",
                () => plan.Actions.Where(a => a.Status != ActionStatus.Done).Select(a => new { a.Title, a.OwnerName, a.DueDate, a.Status, a.IsOverdue, a.SourceSection })),
            Tool("get_internal_people", "Psiog people who can help (account team with RACI, plus leaders by role).",
                () => new { team = plan.Team.Select(t => new { t.DisplayName, t.Raci, t.Responsibility }), leaders = internalPeople }),
        };

        var system = $"""
            You are the Next Best Action advisor inside Psiog's Digital KAM platform. Psiog is a digital engineering services company
            (BI, application engineering, integrations, QA and AI). You help account teams decide the single most valuable next step on one key account.
            Use the tools to read the plan before answering. Base every claim on what the tools return; if data is missing, recommend closing that gap.
            Prefer actions that move a priority opportunity forward or repair a weak relationship with an important decision maker.
            The scores and risk flags are computed by rules; you explain and act on them, you do not recalculate them.
            {AiJson.UntrustedDataRule}
            Reply with JSON only, matching the schema. Keep "action" under 200 characters and "rationale" under 600.
            "channel" must be one of: {string.Join(", ", Channels)}. "sourceSections" uses these keys: {string.Join(", ", SectionKeys.All)}.
            "whoseHelp.type" is "Internal" for Psiog people or "CustomerStakeholder" for people at the client; use names exactly as the tools return them.
            """;
        var userMsg = $"""
            <account_data>
            Account: {plan.Summary.Name} ({plan.Summary.Type}, {plan.Summary.Industry}, {plan.Summary.Region}). Captain: {plan.Summary.CaptainName}.
            Today: {clock.UtcNow:yyyy-MM-dd}.
            </account_data>
            Recommend the next best action for this account.
            """;

        var result = await ai.RunAsync(AiTask.NextBestAction,
            new AiRequest(Name, system, userMsg, OutputSchema(), tools, 3000, accountId), ct);
        var o = ParseOutput(result.Text);

        var sections = (o.SourceSections ?? []).Select(SectionKeys.TryParse).Where(s => s.HasValue).Select(s => s!.Value).Distinct().ToList();
        var dto = new RecommendationDto(Guid.NewGuid(), accountId, clock.UtcNow, RecommendationStatus.New,
            AiJson.Clean(o.Action, 300),
            (o.WhoseHelp ?? []).Take(5).Select(h => new HelperDto(AiJson.Clean(h.Name, 120),
                h.Type == "CustomerStakeholder" ? "CustomerStakeholder" : "Internal", AiJson.Clean(h.Why, 300))).ToList(),
            Channels.Contains(o.Channel) ? o.Channel : "Meeting",
            AiJson.Clean(o.Rationale, 1200), sections,
            o.AtRisk || plan.Scores.RiskLevel == RiskLevel.High,
            string.IsNullOrWhiteSpace(o.RiskReason) ? (plan.Scores.RiskLevel == RiskLevel.High ? string.Join("; ", plan.Scores.RiskReasons) : null) : AiJson.Clean(o.RiskReason, 400),
            result.Meta(Name));
        if (dto.Action.Length == 0) throw new AiUnavailableException("The AI did not return a usable recommendation. Try again.");

        var entity = new AiRecommendation
        {
            Id = dto.Id, AccountId = accountId, CreatedAt = dto.CreatedAt, RequestedById = user.Id,
            PayloadJson = JsonSerializer.Serialize(dto, Json.Options), MetaJson = JsonSerializer.Serialize(dto.Meta, Json.Options),
        };
        repo.Add(entity);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("ai.nba", $"account/{accountId}", AuditOutcome.Success, result.Model, ct);
        return dto;
    }

    public async Task<List<RecommendationDto>> ListAsync(Guid accountId, CancellationToken ct)
    {
        await scope.EnsureCanReadPlanAsync(accountId, ct);
        return (await repo.RecommendationsAsync(accountId, ct)).OrderByDescending(r => r.CreatedAt).Take(20).Select(Hydrate).ToList();
    }

    public async Task<ActionDto> AcceptAsync(Guid recommendationId, AcceptRecommendationRequest r, CancellationToken ct)
    {
        var rec = await repo.GetRecommendationAsync(recommendationId, ct) ?? throw new NotFoundException("Recommendation");
        await scope.EnsureCanEditAsync(rec.AccountId, ct);
        if (rec.Status != RecommendationStatus.New) throw new ConflictException("This recommendation was already accepted or dismissed.");
        var dto = Hydrate(rec);
        var section = dto.SourceSections.FirstOrDefault(SectionKey.PriorityActions);
        var action = await actions.CreateAsync(rec.AccountId,
            new CreateActionRequest(dto.Action.Length > 480 ? dto.Action[..480] : dto.Action, section, null, r.OwnerId, r.DueDate, null),
            ActionOrigin.AiNextBestAction, ct);
        rec.Status = RecommendationStatus.Accepted;
        await uow.SaveChangesAsync(ct);
        return action;
    }

    public async Task DismissAsync(Guid recommendationId, string? reason, CancellationToken ct)
    {
        var rec = await repo.GetRecommendationAsync(recommendationId, ct) ?? throw new NotFoundException("Recommendation");
        await scope.EnsureCanEditAsync(rec.AccountId, ct);
        if (rec.Status != RecommendationStatus.New) throw new ConflictException("This recommendation was already accepted or dismissed.");
        rec.Status = RecommendationStatus.Dismissed;
        rec.DismissReason = AiJson.Clean(reason, 500);
        await uow.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Lenient parse: models without native structured output sometimes return a single helper object, a plain name,
    /// a comma-separated section list, or booleans as strings. Normalise those; anything unusable becomes empty.
    /// </summary>
    internal static Output ParseOutput(string text)
    {
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start < 0 || end <= start) throw new AiUnavailableException("The AI response was not in the expected format. Try again.");
        System.Text.Json.Nodes.JsonNode? root;
        try { root = System.Text.Json.Nodes.JsonNode.Parse(text[start..(end + 1)]); }
        catch (JsonException ex) { throw new AiUnavailableException("The AI response was not in the expected format. Try again.", ex.Message); }
        if (root is not System.Text.Json.Nodes.JsonObject obj) throw new AiUnavailableException("The AI response was not in the expected format. Try again.");

        static string Str(System.Text.Json.Nodes.JsonNode? n) => n switch
        {
            null => "",
            System.Text.Json.Nodes.JsonValue v when v.TryGetValue<string>(out var s) => s,
            System.Text.Json.Nodes.JsonValue v => v.ToJsonString(),
            _ => n.ToJsonString(),
        };
        static HelperDto Helper(System.Text.Json.Nodes.JsonNode? n) => n is System.Text.Json.Nodes.JsonObject h
            ? new HelperDto(Str(h["name"] ?? h["person"] ?? h["who"]), Str(h["type"]), Str(h["why"] ?? h["reason"]))
            : new HelperDto(Str(n), "Internal", "");

        var helpers = obj["whoseHelp"] switch
        {
            System.Text.Json.Nodes.JsonArray arr => arr.Select(Helper).ToList(),
            System.Text.Json.Nodes.JsonObject single => [Helper(single)],
            System.Text.Json.Nodes.JsonValue v => Str(v).Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Select(x => new HelperDto(x, "Internal", "")).ToList(),
            _ => new List<HelperDto>(),
        };
        var sections = obj["sourceSections"] switch
        {
            System.Text.Json.Nodes.JsonArray arr => arr.Select(Str).ToList(),
            System.Text.Json.Nodes.JsonValue v => Str(v).Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
            _ => new List<string>(),
        };
        var atRiskNode = obj["atRisk"];
        var atRisk = atRiskNode is System.Text.Json.Nodes.JsonValue b && b.TryGetValue<bool>(out var flag) ? flag
                   : Str(atRiskNode).Trim().Equals("true", StringComparison.OrdinalIgnoreCase) || Str(atRiskNode).Trim().Equals("yes", StringComparison.OrdinalIgnoreCase);
        return new Output(Str(obj["action"]), helpers.Where(h => h.Name.Length > 0).ToList(), Str(obj["channel"]), Str(obj["rationale"]),
            sections, atRisk, Str(obj["riskReason"]));
    }

    private static RecommendationDto Hydrate(AiRecommendation r) =>
        JsonSerializer.Deserialize<RecommendationDto>(r.PayloadJson, Json.Options)! with { Status = r.Status };

    private static AiTool Tool(string name, string description, Func<object> data) =>
        new(name, description, AiJson.Schema(new { type = "object", properties = new { }, additionalProperties = false }),
            (_, _) => Task.FromResult(AiJson.Serialize(data())));

    private static JsonElement OutputSchema() => AiJson.Schema(new
    {
        type = "object",
        additionalProperties = false,
        required = new[] { "action", "whoseHelp", "channel", "rationale", "sourceSections", "atRisk", "riskReason" },
        properties = new
        {
            action = new { type = "string" },
            whoseHelp = new
            {
                type = "array",
                items = new
                {
                    type = "object", additionalProperties = false, required = new[] { "name", "type", "why" },
                    properties = new { name = new { type = "string" }, type = new { type = "string", @enum = new[] { "Internal", "CustomerStakeholder" } }, why = new { type = "string" } },
                },
            },
            channel = new { type = "string", @enum = Channels },
            rationale = new { type = "string" },
            sourceSections = new { type = "array", items = new { type = "string", @enum = SectionKeys.All } },
            atRisk = new { type = "boolean" },
            riskReason = new { type = "string", description = "Empty string when not at risk" },
        },
    });
}

/// <summary>Drafts text for a plan section. Never saves: the user inserts or discards the draft.</summary>
public sealed class PlanCopilotAgent(IAiGateway ai, AccountService accounts, AccessScope scope)
{
    public const string Name = "plan-copilot";

    public async Task<CopilotResponse> SuggestAsync(Guid accountId, CopilotRequest r, CancellationToken ct)
    {
        new Validator().Text(r.Instruction, "instruction", Limits.MaxCopilotInstruction, required: true).ThrowIfInvalid();
        await scope.EnsureCanEditAsync(accountId, ct);
        var plan = await accounts.GetPlanAsync(accountId, ct);
        var context = new
        {
            plan.Summary.Name, plan.Summary.Industry, plan.Summary.Type, plan.Profile.Challenges, plan.Profile.CxoConnect,
            plan.Infobase, plan.Vision,
            opportunities = plan.Opportunities.Select(o => new { o.Title, o.OfferingName, o.IsPriority }),
            stakeholders = plan.Stakeholders.Select(s => new { s.Title, s.Role, s.Importance, s.BuyingMotive }),
        };
        var system = $"""
            You are a writing assistant for Psiog account managers filling in a key account plan.
            Draft concise, specific text for the requested section in plain English (no markdown headings, at most 180 words).
            Ground the draft in the account data. Do not invent customer names, figures or facts that are not in the data; use a clear placeholder like [confirm budget] instead.
            {AiJson.UntrustedDataRule}
            """;
        var user = $"<account_data>\n{AiJson.Serialize(context)}\n</account_data>\nSection: {r.Section}\nRequest: {r.Instruction}";
        var result = await ai.RunAsync(AiTask.Copilot, new AiRequest(Name, system, user, MaxTokens: 800, AccountId: accountId), ct);
        return new CopilotResponse(AiJson.Clean(result.Text, 3000), result.Meta(Name));
    }
}

/// <summary>Rules decide which accounts are at risk; the model explains the drivers in plain language for leadership.</summary>
public sealed class RiskSentinelAgent(IAiGateway ai, IAccountRepository accounts, AccessScope scope, ScoringService scoring)
{
    public const string Name = "risk-sentinel";

    private sealed record Explanations(List<ExplanationItem> Items);
    private sealed record ExplanationItem(string AccountId, string Explanation);

    public async Task<RiskScanDto> ScanAsync(CancellationToken ct)
    {
        scope.EnsureRole(Role.Executive, Role.GroupLead);
        var list = await accounts.ListAsync(await scope.VisibleAccountIdsAsync(ct), ct);
        var summaries = await scoring.SummariesAsync(list, ct);
        var flagged = new List<(AccountSummaryDto S, IReadOnlyList<string> Reasons)>();
        foreach (var a in list)
        {
            var s = await scoring.ScoreAsync(a, ct);
            if (s.RiskLevel != RiskLevel.Low) flagged.Add((summaries.First(x => x.Id == a.Id), s.RiskReasons));
        }
        if (flagged.Count == 0) return new RiskScanDto([], null);

        var data = flagged.Select(f => new { accountId = f.S.Id, f.S.Name, f.S.Type, f.S.Health, f.S.RiskLevel, drivers = f.Reasons, f.S.OverdueActions, f.S.StaleSections });
        var system = $$"""
            You brief Psiog leadership on key accounts that deterministic rules have flagged as at risk.
            For each account write one or two plain sentences: why it is at risk and the first thing leadership should do. Use only the drivers given.
            {{AiJson.UntrustedDataRule}}
            Reply with JSON: {"items":[{"accountId":"...","explanation":"..."}]}
            """;
        AiResult? result = null;
        Dictionary<string, string> text = [];
        try
        {
            result = await ai.RunAsync(AiTask.RiskExplanation, new AiRequest(Name, system, $"<account_data>\n{AiJson.Serialize(data)}\n</account_data>", MaxTokens: 2500), ct);
            text = AiJson.Parse<Explanations>(result.Text).Items.GroupBy(i => i.AccountId).ToDictionary(g => g.Key, g => AiJson.Clean(g.First().Explanation, 600), StringComparer.OrdinalIgnoreCase);
        }
        catch (AiUnavailableException)
        {
            // Degrade gracefully: the rule-based drivers are still returned without narrative.
        }
        var items = flagged.OrderBy(f => f.S.RiskLevel == RiskLevel.High ? 0 : 1).ThenBy(f => f.S.Health)
            .Select(f => new RiskScanItem(f.S.Id, f.S.Name, f.S.RiskLevel, f.Reasons,
                text.GetValueOrDefault(f.S.Id.ToString(), string.Join(". ", f.Reasons)))).ToList();
        return new RiskScanDto(items, result?.Meta(Name));
    }
}

/// <summary>Portfolio narrative for the Executive export pack and the brief page.</summary>
public sealed class ExecutiveBriefAgent(IAiGateway ai, ViewService views, AccessScope scope, IClock clock)
{
    public const string Name = "executive-brief";

    private sealed record Output(string Headline, List<SectionOut> Sections);
    private sealed record SectionOut(string Title, string Body, List<string> AccountIds);

    public async Task<ExecutiveBriefDto> BriefAsync(CancellationToken ct)
    {
        scope.EnsureRole(Role.Executive);
        var mac = await views.MacAsync(ct);
        var data = new
        {
            mac.Totals, mac.HealthByGroup,
            accounts = mac.Accounts.Select(a => new { a.Id, a.Name, a.Type, a.GroupName, a.Health, a.RiskLevel, a.Completion, a.OverdueActions, a.StaleSections, a.LastReviewedAt }),
        };
        var system = $$"""
            You write a one-page portfolio brief for Psiog's executive team about key accounts.
            Sections, in order: "What moved", "Where we are exposed", "Where to invest", "Asks of leadership". Each body is 2-4 plain sentences.
            Cite accounts by id in accountIds. Use only the data; do not invent revenue or names.
            {{AiJson.UntrustedDataRule}}
            Reply with JSON: {"headline":"...","sections":[{"title":"...","body":"...","accountIds":["..."]}]}
            """;
        var result = await ai.RunAsync(AiTask.ExecutiveBrief, new AiRequest(Name, system, $"<account_data>\n{AiJson.Serialize(data)}\n</account_data>", MaxTokens: 3000), ct);
        var o = AiJson.Parse<Output>(result.Text);
        var known = mac.Accounts.Select(a => a.Id).ToHashSet();
        return new ExecutiveBriefDto(clock.UtcNow, AiJson.Clean(o.Headline, 300),
            (o.Sections ?? []).Take(6).Select(s => new BriefSection(AiJson.Clean(s.Title, 120), AiJson.Clean(s.Body, 1500),
                (s.AccountIds ?? []).Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty).Where(known.Contains).Distinct().ToList())).ToList(),
            result.Meta(Name));
    }
}

/// <summary>Maps workbook sheets the deterministic importer could not recognise onto the KAM schema.</summary>
public sealed class WorkbookInterpreterAgent(IAiGateway ai)
{
    public const string Name = "workbook-interpreter";

    public sealed record FieldGuess(string Section, string Field, string Value, decimal Confidence, string Cell);
    public sealed record Output(string? AccountName, List<FieldGuess> Fields, List<string> Notes);

    public async Task<(Output Result, AiResult Meta)> InterpretAsync(IReadOnlyList<WorkbookSheet> sheets, CancellationToken ct)
    {
        var text = string.Join("\n", sheets.Select(s =>
            $"<sheet name=\"{s.Name}\">\n" + string.Join("\n", s.Cells.Take(400).Select(c => $"{c.Address}: {Trim(c.Value)}")) + "\n</sheet>"));
        var system = $$"""
            You read Psiog key account planning workbooks. Map the cells to these plan fields:
            profile.cxoConnect, profile.challenges, profile.currentRunRate, profile.accountSince,
            infobase.unknowns, infobase.knownUnconfirmed, infobase.growthLevers,
            vision.threeYear, vision.oneYear, vision.objective (one entry per objective),
            stakeholders.name / stakeholders.title / stakeholders.role / stakeholders.importance (one field per value, same cell row),
            opportunities.title, resources.description.
            Only map values that are clearly present. Confidence is 0-1. Cell is the A1 address with sheet name, e.g. "S2 Info Base!B4".
            {{AiJson.UntrustedDataRule}}
            Reply with JSON: {"accountName": string|null, "fields":[{"section","field","value","confidence","cell"}], "notes":[string]}
            """;
        var result = await ai.RunAsync(AiTask.WorkbookInterpretation, new AiRequest(Name, system, $"<workbook>\n{text}\n</workbook>", MaxTokens: 6000), ct);
        return (AiJson.Parse<Output>(result.Text), result);
    }

    private static string Trim(string v) => v.Length > 300 ? v[..300] + "…" : v.Replace('\n', ' ');
}
