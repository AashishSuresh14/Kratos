namespace Kratos.Domain;

public abstract class Entity
{
    public Guid Id { get; set; } = Guid.NewGuid();
}

public sealed class AppUser : Entity
{
    public string Email { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public Role Role { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class AccountGroup : Entity
{
    public string Name { get; set; } = "";
    public Guid LeadUserId { get; set; }
}

public sealed class Account : Entity
{
    public string Name { get; set; } = "";
    public string Industry { get; set; } = "";
    public string Region { get; set; } = "";
    public AccountType Type { get; set; }
    public Guid GroupId { get; set; }
    public Guid CaptainId { get; set; }

    // S1 KYC
    public DateOnly? AccountSince { get; set; }
    public decimal? CurrentRunRate { get; set; }
    public string CxoConnect { get; set; } = "";
    public string Challenges { get; set; } = "";
    public List<Guid> CurrentOfferingIds { get; set; } = [];
    public List<Guid> AspirationalOfferingIds { get; set; } = [];
    public int ReviewCadenceDays { get; set; } = 30;

    // S2 Info base
    public string Unknowns { get; set; } = "";
    public string KnownUnconfirmed { get; set; } = "";
    public string GrowthLevers { get; set; } = "";

    // S3-S4 Vision & objectives
    public string VisionThreeYear { get; set; } = "";
    public string VisionOneYear { get; set; } = "";
    public List<string> Objectives { get; set; } = [];

    // S5 Strategic direction
    public List<Guid> StrategyIds { get; set; } = [];

    public DateTime? LastReviewedAt { get; set; }
    public int CurrentVersion { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    /// <summary>Optimistic concurrency token, rotated on every write.</summary>
    public Guid RowVersion { get; set; } = Guid.NewGuid();

    /// <summary>Last write time per section, used for staleness (AC 3).</summary>
    public Dictionary<SectionKey, DateTime> SectionUpdatedAt { get; set; } = [];

    public List<TeamMember> Team { get; set; } = [];
    public List<Stakeholder> Stakeholders { get; set; } = [];
    public List<Opportunity> Opportunities { get; set; } = [];
    public List<BrickwallRating> Brickwall { get; set; } = [];
    public List<ChecklistResponse> Checklist { get; set; } = [];
    public List<ResourceNeed> Resources { get; set; } = [];
    public List<ActionItem> Actions { get; set; } = [];

    public void Touch(SectionKey section, DateTime nowUtc)
    {
        SectionUpdatedAt[section] = nowUtc;
        UpdatedAt = nowUtc;
        RowVersion = Guid.NewGuid();
    }
}

public sealed class TeamMember : Entity
{
    public Guid AccountId { get; set; }
    public Guid UserId { get; set; }
    public Raci Raci { get; set; }
    public string Responsibility { get; set; } = "";
}

public sealed class Stakeholder : Entity
{
    public Guid AccountId { get; set; }
    public string Name { get; set; } = "";
    public string Title { get; set; } = "";
    public StakeholderRole Role { get; set; }
    public Importance Importance { get; set; }
    public string BuyingMotive { get; set; } = "";
    public int? Perception { get; set; }
    public string PerceptionVsCompetitors { get; set; } = "";
    public Knowledge Knowledge { get; set; }
    public string Notes { get; set; } = "";
}

public sealed class Opportunity : Entity
{
    public Guid AccountId { get; set; }
    public string Title { get; set; } = "";
    public Guid OfferingId { get; set; }
    public int Potential { get; set; } = 3;
    public int Effort { get; set; } = 3;
    public int Complexity { get; set; } = 3;
    public decimal? EstimatedValue { get; set; }
    public bool IsPriority { get; set; }
}

public sealed class BrickwallRating : Entity
{
    public Guid AccountId { get; set; }
    public Guid CriterionId { get; set; }
    public int? Score { get; set; }
    public string Note { get; set; } = "";
}

public sealed class ChecklistResponse : Entity
{
    public Guid AccountId { get; set; }
    public Guid OpportunityId { get; set; }
    public Guid QuestionId { get; set; }
    public ChecklistAnswer? Answer { get; set; }
}

public sealed class ResourceNeed : Entity
{
    public Guid AccountId { get; set; }
    public ResourceType Type { get; set; }
    public string Description { get; set; } = "";
    public decimal? Amount { get; set; }
}

public sealed class ActionItem : Entity
{
    public Guid AccountId { get; set; }
    public string Title { get; set; } = "";
    public SectionKey SourceSection { get; set; }
    public Guid? OpportunityId { get; set; }
    public Guid OwnerId { get; set; }
    public DateOnly DueDate { get; set; }
    public ActionStatus Status { get; set; } = ActionStatus.Open;
    public Guid? ParentId { get; set; }
    public ActionOrigin Origin { get; set; } = ActionOrigin.Manual;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? CompletedAt { get; set; }

    public bool IsOverdue(DateOnly today) => Status != ActionStatus.Done && DueDate < today;
}

public sealed class PlanVersion : Entity
{
    public Guid AccountId { get; set; }
    public int Number { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public Guid CreatedById { get; set; }
    public string ChangeSummary { get; set; } = "";
    public string SnapshotJson { get; set; } = "{}";
    public string ScoresJson { get; set; } = "{}";
}

// ---- Master data (AC 9) ----

public sealed class Offering : Entity
{
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public sealed class StrategyOption : Entity
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public bool IsActive { get; set; } = true;
}

public sealed class BrickwallCriterion : Entity
{
    public string Name { get; set; } = "";
    public BrickwallCategory Category { get; set; }
    public decimal Weight { get; set; } = 1;
    public bool IsActive { get; set; } = true;
}

public sealed class ChecklistQuestion : Entity
{
    public string Text { get; set; } = "";
    public ChecklistWeight Weight { get; set; }
    public bool IsActive { get; set; } = true;
}

public sealed class ScoringWeight : Entity
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public decimal Weight { get; set; }
}

// ---- AI and security ----

public sealed class AiRecommendation : Entity
{
    public Guid AccountId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public RecommendationStatus Status { get; set; } = RecommendationStatus.New;
    public string PayloadJson { get; set; } = "{}";
    public string MetaJson { get; set; } = "{}";
    public string? DismissReason { get; set; }
    public Guid RequestedById { get; set; }
}

public sealed class AiCallLog : Entity
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public string Agent { get; set; } = "";
    public string Provider { get; set; } = "";
    public string Model { get; set; } = "";
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int LatencyMs { get; set; }
    public bool Success { get; set; }
    public bool FallbackUsed { get; set; }
    public string? Error { get; set; }
    public Guid? UserId { get; set; }
    public Guid? AccountId { get; set; }
}

public sealed class AiEvaluation : Entity
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public string Agent { get; set; } = "";
    public decimal Score { get; set; }
    public bool Passed { get; set; }
    public string Notes { get; set; } = "";
}

public sealed class AuditEvent : Entity
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public Guid? UserId { get; set; }
    public string UserEmail { get; set; } = "";
    public string Action { get; set; } = "";
    public string Resource { get; set; } = "";
    public AuditOutcome Outcome { get; set; }
    public string Ip { get; set; } = "";
    public string Detail { get; set; } = "";
}

public sealed class SecurityFinding : Entity
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public Severity Severity { get; set; }
    public string Rule { get; set; } = "";
    public string Detail { get; set; } = "";
    public string? Explanation { get; set; }
    public FindingStatus Status { get; set; } = FindingStatus.Open;
    public string Fingerprint { get; set; } = "";
}

public sealed class ImportSession : Entity
{
    public DateTime At { get; set; } = DateTime.UtcNow;
    public Guid UserId { get; set; }
    public string FileName { get; set; } = "";
    public string ReportJson { get; set; } = "{}";
    public string MappedJson { get; set; } = "{}";
    public bool Committed { get; set; }
}

/// <summary>Daily denormalised score row per account for Power BI / Databricks. Written by the reporting job, never by users.</summary>
public sealed class AccountScoreSnapshot : Entity
{
    public DateOnly SnapshotDate { get; set; }
    public Guid AccountId { get; set; }
    public string AccountName { get; set; } = "";
    public string AccountType { get; set; } = "";
    public string GroupName { get; set; } = "";
    public string CaptainName { get; set; } = "";
    public string Industry { get; set; } = "";
    public string Region { get; set; } = "";
    public decimal Health { get; set; }
    public decimal Opportunity { get; set; }
    public decimal Brickwall { get; set; }
    public decimal Checklist { get; set; }
    public decimal Perception { get; set; }
    public decimal Completion { get; set; }
    public string RiskLevel { get; set; } = "";
    public int OverdueActions { get; set; }
    public int OpenActions { get; set; }
    public int StaleSections { get; set; }
    public decimal PipelineValue { get; set; }
    public decimal? CurrentRunRate { get; set; }
    public int PlanVersion { get; set; }
}
