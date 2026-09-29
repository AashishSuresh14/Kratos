using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.UnitTests;

public class ScoringEngineTests
{
    private static readonly DateTime Now = new(2026, 9, 29, 10, 0, 0, DateTimeKind.Utc);

    private static ScoringContext Ctx(IReadOnlyList<BrickwallCriterion>? criteria = null, IReadOnlyList<ChecklistQuestion>? questions = null,
        Dictionary<string, decimal>? weights = null, decimal? previous = null) =>
        new(criteria ?? [], questions ?? [], weights ?? new Dictionary<string, decimal>(), Now, previous);

    [Fact]
    public void Opportunity_score_rewards_high_potential_low_effort_low_complexity()
    {
        var best = new Opportunity { Potential = 5, Effort = 1, Complexity = 1 };
        var worst = new Opportunity { Potential = 1, Effort = 5, Complexity = 5 };
        Assert.Equal(100m, ScoringEngine.OpportunityScore(best, Ctx()));
        Assert.Equal(20m, ScoringEngine.OpportunityScore(worst, Ctx()));
    }

    [Fact]
    public void Opportunity_score_clamps_out_of_range_ratings()
    {
        var o = new Opportunity { Potential = 99, Effort = -3, Complexity = 0 };
        Assert.Equal(100m, ScoringEngine.OpportunityScore(o, Ctx()));
    }

    [Fact]
    public void Opportunity_weights_are_configurable()
    {
        var o = new Opportunity { Potential = 5, Effort = 5, Complexity = 5 };
        var onlyPotential = new Dictionary<string, decimal> { [WeightKeys.OppPotential] = 1, [WeightKeys.OppEffort] = 0, [WeightKeys.OppComplexity] = 0 };
        Assert.Equal(100m, ScoringEngine.OpportunityScore(o, Ctx(weights: onlyPotential)));
    }

    [Fact]
    public void Brickwall_is_weighted_average_of_rated_criteria_only()
    {
        var heavy = new BrickwallCriterion { Weight = 3 };
        var light = new BrickwallCriterion { Weight = 1 };
        var unrated = new BrickwallCriterion { Weight = 5 };
        var a = new Account();
        a.Brickwall.Add(new BrickwallRating { CriterionId = heavy.Id, Score = 5 });
        a.Brickwall.Add(new BrickwallRating { CriterionId = light.Id, Score = 1 });
        // (3*1.0 + 1*0.2) / 4 = 0.8
        Assert.Equal(80m, ScoringEngine.BrickwallScore(a, Ctx(criteria: [heavy, light, unrated])));
    }

    [Fact]
    public void Checklist_weights_essential_above_useful_and_partial_counts_half()
    {
        var essential = new ChecklistQuestion { Weight = ChecklistWeight.Essential };
        var useful = new ChecklistQuestion { Weight = ChecklistWeight.Useful };
        var a = new Account();
        var opp = new Opportunity { IsPriority = true };
        a.Opportunities.Add(opp);
        a.Checklist.Add(new ChecklistResponse { OpportunityId = opp.Id, QuestionId = essential.Id, Answer = ChecklistAnswer.Partial });
        a.Checklist.Add(new ChecklistResponse { OpportunityId = opp.Id, QuestionId = useful.Id, Answer = ChecklistAnswer.Yes });
        // (3*0.5 + 1*1) / 4 = 0.625
        Assert.Equal(62.5m, ScoringEngine.ChecklistScore(a, Ctx(questions: [essential, useful])));
    }

    [Fact]
    public void Checklist_is_zero_without_priority_opportunities()
    {
        var a = new Account();
        a.Opportunities.Add(new Opportunity { IsPriority = false });
        Assert.Equal(0m, ScoringEngine.ChecklistScore(a, Ctx(questions: [new ChecklistQuestion()])));
    }

    [Fact]
    public void Perception_weights_by_importance_and_ignores_unrated()
    {
        var a = new Account();
        a.Stakeholders.Add(new Stakeholder { Importance = Importance.A, Perception = 5 });
        a.Stakeholders.Add(new Stakeholder { Importance = Importance.C, Perception = 1 });
        a.Stakeholders.Add(new Stakeholder { Importance = Importance.A, Perception = null });
        // (3*1.0 + 1*0.2) / 4 = 0.8
        Assert.Equal(80m, ScoringEngine.PerceptionScore(a, Ctx()));
    }

    [Fact]
    public void Empty_account_has_zero_health_and_is_high_risk()
    {
        var s = ScoringEngine.Calculate(new Account(), Ctx());
        Assert.Equal(0m, s.Health);
        Assert.Equal(RiskLevel.High, s.RiskLevel);
        Assert.Contains(s.RiskReasons, r => r.Contains("decision maker", StringComparison.Ordinal));
    }

    [Fact]
    public void Overdue_actions_reduce_health_and_penalty_is_capped()
    {
        var (a, ctx) = StrongAccountWithMaster();
        var baseline = ScoringEngine.Calculate(a, ctx).Health;
        var parent = a.Actions.First(x => x.ParentId is null);
        for (var i = 0; i < 20; i++)
            a.Actions.Add(new ActionItem { ParentId = parent.Id, DueDate = DateOnly.FromDateTime(Now).AddDays(-1), Status = ActionStatus.Open });
        var after = ScoringEngine.Calculate(a, ctx);
        Assert.Equal(baseline - 20m, after.Health); // 20 overdue x 4 = 80, capped at 20
        Assert.Equal(RiskLevel.High, after.RiskLevel); // 3+ overdue is always high risk
    }

    [Fact]
    public void Done_actions_are_never_overdue()
    {
        var a = new ActionItem { DueDate = new DateOnly(2020, 1, 1), Status = ActionStatus.Done };
        Assert.False(a.IsOverdue(DateOnly.FromDateTime(Now)));
    }

    [Fact]
    public void Stale_section_detected_after_review_cadence()
    {
        var a = new Account { ReviewCadenceDays = 30 };
        a.SectionUpdatedAt[SectionKey.Infobase] = Now.AddDays(-31);
        a.SectionUpdatedAt[SectionKey.Vision] = Now.AddDays(-29);
        var sections = ScoringEngine.Sections(a, Ctx());
        Assert.True(sections.Single(s => s.Key == SectionKey.Infobase).IsStale);
        Assert.False(sections.Single(s => s.Key == SectionKey.Vision).IsStale);
        Assert.False(sections.Single(s => s.Key == SectionKey.Brickwall).IsStale); // never written is incomplete, not stale
    }

    [Fact]
    public void Sections_follow_workbook_order_S1_to_S12()
    {
        var codes = ScoringEngine.Sections(new Account(), Ctx()).Select(s => s.Code).ToArray();
        Assert.Equal(["S1", "S2", "S3–S4", "S5", "S6", "S7", "S8", "S9", "S10", "S11", "S12"], codes);
    }

    [Fact]
    public void Health_drop_since_last_version_is_a_risk_reason()
    {
        var s = ScoringEngine.Calculate(StrongAccount(), Ctx(previous: 99));
        Assert.Contains(s.RiskReasons, r => r.StartsWith("Health fell", StringComparison.Ordinal));
    }

    [Fact]
    public void Well_maintained_account_is_low_risk()
    {
        var (a, ctx) = StrongAccountWithMaster();
        var s = ScoringEngine.Calculate(a, ctx);
        Assert.True(s.Health >= 65, $"health {s.Health}");
        Assert.Equal(RiskLevel.Low, s.RiskLevel);
    }

    private static (Account, ScoringContext) StrongAccountWithMaster()
    {
        var a = StrongAccount();
        var criteria = new List<BrickwallCriterion> { new() { Weight = 1 }, new() { Weight = 1 } };
        var questions = new List<ChecklistQuestion> { new() { Weight = ChecklistWeight.Essential }, new() { Weight = ChecklistWeight.Useful } };
        foreach (var c in criteria) a.Brickwall.Add(new BrickwallRating { CriterionId = c.Id, Score = 4 });
        var opp = a.Opportunities.First(o => o.IsPriority);
        foreach (var q in questions) a.Checklist.Add(new ChecklistResponse { OpportunityId = opp.Id, QuestionId = q.Id, Answer = ChecklistAnswer.Yes });
        return (a, Ctx(criteria, questions));
    }

    private static Account StrongAccount()
    {
        var a = new Account
        {
            AccountSince = new DateOnly(2021, 1, 1), CurrentRunRate = 500_000, CxoConnect = "Quarterly CIO review", Challenges = "Legacy estate",
            CurrentOfferingIds = [Guid.NewGuid()], Unknowns = "x", KnownUnconfirmed = "y", GrowthLevers = "z",
            VisionThreeYear = "Primary partner", VisionOneYear = "Win BI", Objectives = ["Sponsor"], StrategyIds = [Guid.NewGuid()],
        };
        var captain = Guid.NewGuid();
        a.Team.Add(new TeamMember { UserId = captain, Raci = Raci.A });
        a.Team.Add(new TeamMember { UserId = Guid.NewGuid(), Raci = Raci.R });
        a.Stakeholders.Add(new Stakeholder { Role = StakeholderRole.DecisionMaker, Importance = Importance.A, Perception = 5 });
        var opp = new Opportunity { Potential = 5, Effort = 2, Complexity = 2, IsPriority = true };
        a.Opportunities.Add(opp);
        var parent = new ActionItem { OpportunityId = opp.Id, DueDate = DateOnly.FromDateTime(Now).AddDays(10) };
        a.Actions.Add(parent);
        a.Actions.Add(new ActionItem { ParentId = parent.Id, DueDate = DateOnly.FromDateTime(Now).AddDays(5) });
        a.Resources.Add(new ResourceNeed { Description = "Architect" });
        foreach (var k in Enum.GetValues<SectionKey>()) a.SectionUpdatedAt[k] = Now.AddDays(-1);
        return a;
    }
}
