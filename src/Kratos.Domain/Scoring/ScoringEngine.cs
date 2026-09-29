namespace Kratos.Domain.Scoring;

/// <summary>Scores are 0-100. Deterministic and auditable: AI never computes scores.</summary>
public sealed record Scores(
    decimal Opportunity,
    decimal Brickwall,
    decimal Checklist,
    decimal Perception,
    decimal Completion,
    decimal Health,
    RiskLevel RiskLevel,
    IReadOnlyList<string> RiskReasons);

public sealed record SectionStatus(SectionKey Key, string Code, string Title, decimal Completion, DateTime? UpdatedAt, bool IsStale);

/// <summary>Master data the engine needs. Inactive items are already filtered out by the caller.</summary>
public sealed record ScoringContext(
    IReadOnlyList<BrickwallCriterion> Criteria,
    IReadOnlyList<ChecklistQuestion> Questions,
    IReadOnlyDictionary<string, decimal> Weights,
    DateTime NowUtc,
    decimal? PreviousHealth = null);

public static class WeightKeys
{
    public const string HealthOpportunity = "health.opportunity";
    public const string HealthBrickwall = "health.brickwall";
    public const string HealthChecklist = "health.checklist";
    public const string HealthPerception = "health.perception";
    public const string HealthCompletion = "health.completion";
    public const string OppPotential = "opp.potential";
    public const string OppEffort = "opp.effort";
    public const string OppComplexity = "opp.complexity";
    public const string ChkEssential = "checklist.essential";
    public const string ChkDesirable = "checklist.desirable";
    public const string ChkUseful = "checklist.useful";
    public const string ImpA = "importance.A";
    public const string ImpB = "importance.B";
    public const string ImpC = "importance.C";
    public const string PenaltyOverdue = "penalty.overdueAction";
    public const string PenaltyStale = "penalty.staleSection";
    public const string RiskHigh = "risk.highBelowHealth";
    public const string RiskMedium = "risk.mediumBelowHealth";

    /// <summary>Defaults used when an admin has not configured a weight.</summary>
    public static readonly IReadOnlyDictionary<string, (string Label, decimal Weight)> Defaults =
        new Dictionary<string, (string, decimal)>
        {
            [HealthOpportunity] = ("Health: opportunity score", 20),
            [HealthBrickwall] = ("Health: relationship (brickwall)", 25),
            [HealthChecklist] = ("Health: tactical checklist", 15),
            [HealthPerception] = ("Health: stakeholder perception", 20),
            [HealthCompletion] = ("Health: plan completion", 20),
            [OppPotential] = ("Opportunity: potential", 50),
            [OppEffort] = ("Opportunity: low effort", 25),
            [OppComplexity] = ("Opportunity: low complexity", 25),
            [ChkEssential] = ("Checklist: Essential question", 3),
            [ChkDesirable] = ("Checklist: Desirable question", 2),
            [ChkUseful] = ("Checklist: Useful question", 1),
            [ImpA] = ("Stakeholder importance A", 3),
            [ImpB] = ("Stakeholder importance B", 2),
            [ImpC] = ("Stakeholder importance C", 1),
            [PenaltyOverdue] = ("Penalty per overdue action", 4),
            [PenaltyStale] = ("Penalty per stale section", 2),
            [RiskHigh] = ("High risk below health", 45),
            [RiskMedium] = ("Medium risk below health", 65),
        };
}

public static class ScoringEngine
{
    private const decimal MaxOverduePenalty = 20;
    private const decimal MaxStalePenalty = 12;

    public static IReadOnlyList<(SectionKey Key, string Code, string Title)> Catalog { get; } =
    [
        (SectionKey.Profile, "S1", "Know your customer"),
        (SectionKey.Infobase, "S2", "Information base"),
        (SectionKey.Vision, "S3–S4", "Vision & objectives"),
        (SectionKey.Strategy, "S5", "Strategic direction"),
        (SectionKey.Opportunities, "S6", "Opportunity matrix"),
        (SectionKey.Stakeholders, "S7", "Mapping the account"),
        (SectionKey.Brickwall, "S8", "Brickwall"),
        (SectionKey.Tactical, "S9", "Tactical checklist"),
        (SectionKey.PriorityActions, "S10", "Priority actions"),
        (SectionKey.ActionPlan, "S11", "Time-bound action plan"),
        (SectionKey.Resources, "S12", "Resources needed"),
    ];

    public static decimal W(ScoringContext ctx, string key) =>
        ctx.Weights.TryGetValue(key, out var w) ? w : WeightKeys.Defaults[key].Weight;

    public static decimal OpportunityScore(Opportunity o, ScoringContext ctx)
    {
        decimal wp = W(ctx, WeightKeys.OppPotential), we = W(ctx, WeightKeys.OppEffort), wc = W(ctx, WeightKeys.OppComplexity);
        var total = wp + we + wc;
        if (total <= 0) return 0;
        var p = Clamp15(o.Potential);
        var e = 6 - Clamp15(o.Effort);
        var c = 6 - Clamp15(o.Complexity);
        return Round((wp * p + we * e + wc * c) / (5 * total) * 100);
    }

    public static IReadOnlyList<SectionStatus> Sections(Account a, ScoringContext ctx)
    {
        var list = new List<SectionStatus>(Catalog.Count);
        foreach (var (key, code, title) in Catalog)
        {
            a.SectionUpdatedAt.TryGetValue(key, out var updated);
            DateTime? updatedAt = updated == default ? null : updated;
            var cadence = Math.Max(1, a.ReviewCadenceDays);
            var stale = updatedAt is { } u && (ctx.NowUtc - u).TotalDays > cadence;
            list.Add(new SectionStatus(key, code, title, Completion(key, a, ctx), updatedAt, stale));
        }
        return list;
    }

    public static decimal Completion(SectionKey key, Account a, ScoringContext ctx)
    {
        var priority = a.Opportunities.Where(o => o.IsPriority).ToList();
        switch (key)
        {
            case SectionKey.Profile:
                return Fraction(
                    a.AccountSince.HasValue, a.CurrentRunRate.HasValue, Has(a.CxoConnect), Has(a.Challenges),
                    a.CurrentOfferingIds.Count > 0,
                    a.Team.Any(t => t.Raci == Raci.A) && a.Team.Any(t => t.Raci == Raci.R));
            case SectionKey.Infobase:
                return Fraction(Has(a.Unknowns), Has(a.KnownUnconfirmed), Has(a.GrowthLevers));
            case SectionKey.Vision:
                return Fraction(Has(a.VisionThreeYear), Has(a.VisionOneYear), a.Objectives.Any(Has));
            case SectionKey.Strategy:
                return a.StrategyIds.Count > 0 ? 100 : 0;
            case SectionKey.Opportunities:
                return a.Opportunities.Count == 0 ? 0 : priority.Count > 0 ? 100 : 50;
            case SectionKey.Stakeholders:
                return Fraction(
                    a.Stakeholders.Count > 0,
                    a.Stakeholders.Any(s => s.Role == StakeholderRole.DecisionMaker),
                    a.Stakeholders.Count > 0 && a.Stakeholders.All(s => s.Perception.HasValue));
            case SectionKey.Brickwall:
            {
                if (ctx.Criteria.Count == 0) return 0;
                var ids = ctx.Criteria.Select(c => c.Id).ToHashSet();
                var rated = a.Brickwall.Count(b => b.Score.HasValue && ids.Contains(b.CriterionId));
                return Round(100m * rated / ctx.Criteria.Count);
            }
            case SectionKey.Tactical:
            {
                if (priority.Count == 0 || ctx.Questions.Count == 0) return 0;
                var qIds = ctx.Questions.Select(q => q.Id).ToHashSet();
                var pIds = priority.Select(p => p.Id).ToHashSet();
                var answered = a.Checklist.Count(r => r.Answer.HasValue && qIds.Contains(r.QuestionId) && pIds.Contains(r.OpportunityId));
                return Round(Math.Min(100m, 100m * answered / (priority.Count * ctx.Questions.Count)));
            }
            case SectionKey.PriorityActions:
            {
                if (priority.Count == 0) return 0;
                var covered = priority.Count(p => a.Actions.Any(x => x.OpportunityId == p.Id && x.ParentId is null));
                return Round(100m * covered / priority.Count);
            }
            case SectionKey.ActionPlan:
            {
                var top = a.Actions.Where(x => x.ParentId is null).ToList();
                if (top.Count == 0) return 0;
                var withSubs = top.Count(t => a.Actions.Any(x => x.ParentId == t.Id));
                return Round(50 + 50m * withSubs / top.Count);
            }
            case SectionKey.Resources:
                return a.Resources.Count > 0 ? 100 : 0;
            default:
                return 0;
        }
    }

    public static Scores Calculate(Account a, ScoringContext ctx)
    {
        var today = DateOnly.FromDateTime(ctx.NowUtc);
        var sections = Sections(a, ctx);

        var pool = a.Opportunities.Where(o => o.IsPriority).ToList();
        if (pool.Count == 0) pool = a.Opportunities;
        var opportunity = pool.Count == 0 ? 0 : Round(pool.Average(o => OpportunityScore(o, ctx)));

        var brickwall = BrickwallScore(a, ctx);
        var checklist = ChecklistScore(a, ctx);
        var perception = PerceptionScore(a, ctx);
        var completion = Round(sections.Average(s => s.Completion));

        decimal wo = W(ctx, WeightKeys.HealthOpportunity), wb = W(ctx, WeightKeys.HealthBrickwall),
                wk = W(ctx, WeightKeys.HealthChecklist), wp = W(ctx, WeightKeys.HealthPerception),
                wcp = W(ctx, WeightKeys.HealthCompletion);
        var wsum = wo + wb + wk + wp + wcp;
        var baseHealth = wsum <= 0 ? 0 : (wo * opportunity + wb * brickwall + wk * checklist + wp * perception + wcp * completion) / wsum;

        var overdue = a.Actions.Count(x => x.IsOverdue(today));
        var stale = sections.Count(s => s.IsStale);
        var penalty = Math.Min(MaxOverduePenalty, overdue * W(ctx, WeightKeys.PenaltyOverdue))
                    + Math.Min(MaxStalePenalty, stale * W(ctx, WeightKeys.PenaltyStale));
        var health = Round(Math.Clamp(baseHealth - penalty, 0, 100));

        var reasons = new List<string>();
        if (overdue > 0) reasons.Add($"{overdue} overdue action{(overdue == 1 ? "" : "s")}");
        if (stale > 0) reasons.Add($"{stale} section{(stale == 1 ? "" : "s")} not reviewed within the {a.ReviewCadenceDays}-day cadence");
        if (!a.Stakeholders.Any(s => s.Role == StakeholderRole.DecisionMaker && s.Perception >= 3))
            reasons.Add("No decision maker with a neutral or better perception of Psiog");
        if (completion < 50) reasons.Add($"Plan only {completion:0}% complete");
        if (ctx.PreviousHealth is { } prev && prev - health >= 10)
            reasons.Add($"Health fell {prev - health:0} points since the last version");

        var high = W(ctx, WeightKeys.RiskHigh);
        var medium = W(ctx, WeightKeys.RiskMedium);
        var level = health < high || overdue >= 3 ? RiskLevel.High
                  : health < medium || reasons.Count > 0 ? RiskLevel.Medium
                  : RiskLevel.Low;
        if (health < high) reasons.Insert(0, $"Health {health:0} is below the high-risk threshold of {high:0}");

        return new Scores(opportunity, brickwall, checklist, perception, completion, health, level, reasons);
    }

    public static decimal BrickwallScore(Account a, ScoringContext ctx)
    {
        decimal num = 0, den = 0;
        foreach (var c in ctx.Criteria)
        {
            var r = a.Brickwall.FirstOrDefault(b => b.CriterionId == c.Id);
            if (r?.Score is not { } s) continue;
            num += c.Weight * Clamp15(s) / 5m;
            den += c.Weight;
        }
        return den == 0 ? 0 : Round(num / den * 100);
    }

    public static decimal ChecklistScore(Account a, ScoringContext ctx)
    {
        var priority = a.Opportunities.Where(o => o.IsPriority).Select(o => o.Id).ToList();
        if (priority.Count == 0 || ctx.Questions.Count == 0) return 0;
        decimal num = 0, den = 0;
        foreach (var oppId in priority)
        {
            foreach (var q in ctx.Questions)
            {
                var w = q.Weight switch
                {
                    ChecklistWeight.Essential => W(ctx, WeightKeys.ChkEssential),
                    ChecklistWeight.Desirable => W(ctx, WeightKeys.ChkDesirable),
                    _ => W(ctx, WeightKeys.ChkUseful),
                };
                var ans = a.Checklist.FirstOrDefault(r => r.OpportunityId == oppId && r.QuestionId == q.Id)?.Answer;
                num += w * ans switch { ChecklistAnswer.Yes => 1m, ChecklistAnswer.Partial => 0.5m, _ => 0m };
                den += w;
            }
        }
        return den == 0 ? 0 : Round(num / den * 100);
    }

    public static decimal PerceptionScore(Account a, ScoringContext ctx)
    {
        decimal num = 0, den = 0;
        foreach (var s in a.Stakeholders)
        {
            if (s.Perception is not { } p) continue;
            var w = s.Importance switch
            {
                Importance.A => W(ctx, WeightKeys.ImpA),
                Importance.B => W(ctx, WeightKeys.ImpB),
                _ => W(ctx, WeightKeys.ImpC),
            };
            num += w * Clamp15(p) / 5m;
            den += w;
        }
        return den == 0 ? 0 : Round(num / den * 100);
    }

    private static int Clamp15(int v) => Math.Clamp(v, 1, 5);
    private static bool Has(string? s) => !string.IsNullOrWhiteSpace(s);
    private static decimal Fraction(params bool[] parts) => parts.Length == 0 ? 0 : Round(100m * parts.Count(p => p) / parts.Length);
    private static decimal Round(decimal v) => Math.Round(v, 1, MidpointRounding.AwayFromZero);
}
