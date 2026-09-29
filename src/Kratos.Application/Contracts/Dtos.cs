using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Contracts;

// ---- Auth ----
public sealed record LoginRequest(string Email, string Password);
public sealed record UserDto(Guid Id, string Email, string DisplayName, Role Role, IReadOnlyList<Guid> GroupIds);
public sealed record LoginResponse(string Token, DateTime ExpiresAt, UserDto User);
public sealed record AdminUserDto(Guid Id, string Email, string DisplayName, Role Role, IReadOnlyList<Guid> GroupIds, bool IsActive);
public sealed record CreateUserRequest(string Email, string DisplayName, Role Role, string Password);
public sealed record UpdateUserRequest(string DisplayName, Role Role, bool IsActive);

// ---- Master data ----
public sealed record OfferingDto(Guid Id, string Name, string Category, bool IsActive);
public sealed record StrategyDto(Guid Id, string Name, string Description, bool IsActive);
public sealed record CriterionDto(Guid Id, string Name, BrickwallCategory Category, decimal Weight, bool IsActive);
public sealed record QuestionDto(Guid Id, string Text, ChecklistWeight Weight, bool IsActive);
public sealed record GroupDto(Guid Id, string Name, Guid LeadUserId, string LeadName);
public sealed record WeightDto(string Key, string Label, decimal Weight);
public sealed record MasterDataDto(
    IReadOnlyList<OfferingDto> Offerings, IReadOnlyList<StrategyDto> Strategies,
    IReadOnlyList<CriterionDto> BrickwallCriteria, IReadOnlyList<QuestionDto> ChecklistQuestions,
    IReadOnlyList<GroupDto> Groups, IReadOnlyList<WeightDto> ScoringWeights);
public sealed record UpdateWeightsRequest(IReadOnlyList<WeightUpdate> Weights);
public sealed record WeightUpdate(string Key, decimal Weight);
public sealed record GroupRequest(string Name, Guid LeadUserId);

// ---- Accounts ----
public sealed record ScoresDto(decimal Opportunity, decimal Brickwall, decimal Checklist, decimal Perception,
    decimal Completion, decimal Health, RiskLevel RiskLevel, IReadOnlyList<string> RiskReasons)
{
    public static ScoresDto From(Scores s) => new(s.Opportunity, s.Brickwall, s.Checklist, s.Perception, s.Completion, s.Health, s.RiskLevel, s.RiskReasons);
}

public sealed record AccountSummaryDto(Guid Id, string Name, string Industry, string Region, AccountType Type,
    Guid GroupId, string GroupName, Guid CaptainId, string CaptainName, decimal Health, RiskLevel RiskLevel,
    decimal Completion, int OverdueActions, int StaleSections, DateTime? LastReviewedAt, int CurrentVersion);

public sealed record CreateAccountRequest(string Name, string Industry, string Region, AccountType Type, Guid GroupId, Guid CaptainId);

public sealed record SectionDto(SectionKey Key, string Code, string Title, decimal Completion, DateTime? UpdatedAt, bool IsStale);
public sealed record ProfileDto(DateOnly? AccountSince, decimal? CurrentRunRate, string Currency, string CxoConnect, string Challenges,
    IReadOnlyList<Guid> CurrentOfferingIds, IReadOnlyList<Guid> AspirationalOfferingIds, int ReviewCadenceDays);
public sealed record TeamMemberDto(Guid UserId, string DisplayName, Raci Raci, string Responsibility);
public sealed record InfobaseDto(string Unknowns, string KnownUnconfirmed, string GrowthLevers);
public sealed record StakeholderDto(Guid Id, string Name, string Title, StakeholderRole Role, Importance Importance, string BuyingMotive,
    int? Perception, string PerceptionVsCompetitors, Knowledge Knowledge, string Notes);
public sealed record VisionDto(string ThreeYear, string OneYear, IReadOnlyList<string> Objectives);
public sealed record OpportunityDto(Guid Id, string Title, Guid OfferingId, string OfferingName, int Potential, int Effort, int Complexity,
    decimal? EstimatedValue, bool IsPriority, decimal Score);
public sealed record BrickwallDto(Guid CriterionId, int? Score, string Note);
public sealed record ChecklistAnswerDto(Guid QuestionId, ChecklistAnswer? Answer);
public sealed record TacticalDto(Guid OpportunityId, IReadOnlyList<ChecklistAnswerDto> Answers);
public sealed record ResourceDto(Guid Id, ResourceType Type, string Description, decimal? Amount);

public sealed record ActionDto(Guid Id, Guid AccountId, string AccountName, string Title, SectionKey SourceSection, Guid? OpportunityId,
    Guid OwnerId, string OwnerName, DateOnly DueDate, ActionStatus Status, bool IsOverdue, Guid? ParentId, ActionOrigin Origin, DateTime CreatedAt);

public sealed record AccountPlanDto(
    AccountSummaryDto Summary, string RowVersion, bool CanEdit, IReadOnlyList<SectionDto> Sections,
    ProfileDto Profile, IReadOnlyList<TeamMemberDto> Team, InfobaseDto Infobase, IReadOnlyList<StakeholderDto> Stakeholders,
    VisionDto Vision, IReadOnlyList<Guid> StrategyIds, IReadOnlyList<OpportunityDto> Opportunities,
    IReadOnlyList<BrickwallDto> Brickwall, IReadOnlyList<TacticalDto> Tactical, IReadOnlyList<ResourceDto> Resources,
    IReadOnlyList<ActionDto> Actions, ScoresDto Scores);

// Section writes carry the rowVersion for optimistic concurrency.
public sealed record UpdateProfileRequest(DateOnly? AccountSince, decimal? CurrentRunRate, string? CxoConnect, string? Challenges,
    IReadOnlyList<Guid>? CurrentOfferingIds, IReadOnlyList<Guid>? AspirationalOfferingIds, int? ReviewCadenceDays, string RowVersion);
public sealed record TeamMemberInput(Guid UserId, Raci Raci, string? Responsibility);
public sealed record UpdateTeamRequest(IReadOnlyList<TeamMemberInput> Members, string RowVersion);
public sealed record UpdateInfobaseRequest(string? Unknowns, string? KnownUnconfirmed, string? GrowthLevers, string RowVersion);
public sealed record UpdateVisionRequest(string? ThreeYear, string? OneYear, IReadOnlyList<string>? Objectives, string RowVersion);
public sealed record UpdateStrategiesRequest(IReadOnlyList<Guid> StrategyIds, string RowVersion);
public sealed record UpdateBrickwallRequest(IReadOnlyList<BrickwallDto> Ratings, string RowVersion);
public sealed record UpdateTacticalRequest(IReadOnlyList<TacticalDto> Items, string RowVersion);
public sealed record StakeholderInput(string Name, string? Title, StakeholderRole Role, Importance Importance, string? BuyingMotive,
    int? Perception, string? PerceptionVsCompetitors, Knowledge Knowledge, string? Notes);
public sealed record OpportunityInput(string Title, Guid OfferingId, int Potential, int Effort, int Complexity, decimal? EstimatedValue, bool IsPriority);
public sealed record ResourceInput(ResourceType Type, string Description, decimal? Amount);

// ---- Versions ----
public sealed record VersionDto(int Number, DateTime CreatedAt, string CreatedBy, string ChangeSummary, ScoresDto Scores);
public sealed record CreateVersionRequest(string? ChangeSummary);
public sealed record DiffChange(SectionKey Section, string Field, string Before, string After);
public sealed record DiffDto(IReadOnlyList<DiffChange> Changes);
public sealed record TrendPoint(int Version, DateOnly Date, decimal Health, decimal Opportunity, decimal Brickwall, decimal Checklist, decimal Perception);
public sealed record TrendDto(IReadOnlyList<TrendPoint> Points);

// ---- Actions ----
public sealed record CreateActionRequest(string Title, SectionKey SourceSection, Guid? OpportunityId, Guid OwnerId, DateOnly DueDate, Guid? ParentId);
public sealed record PatchActionRequest(ActionStatus? Status, DateOnly? DueDate, Guid? OwnerId, string? Title);

// ---- Views ----
public sealed record MacTotals(int Accounts, int AtRisk, int OverdueActions, decimal AvgHealth);
public sealed record GroupHealth(string GroupName, decimal AvgHealth);
public sealed record MacViewDto(MacTotals Totals, IReadOnlyList<AccountSummaryDto> Accounts, IReadOnlyList<GroupHealth> HealthByGroup);
public sealed record NbdAccountDto(AccountSummaryDto Account, decimal Readiness, IReadOnlyList<OpportunityDto> TopOpportunities);
public sealed record NbdViewDto(IReadOnlyList<NbdAccountDto> Accounts);
public sealed record EbdCell(Guid OfferingId, string State);
public sealed record EbdRow(Guid AccountId, string AccountName, decimal Relationship, IReadOnlyList<EbdCell> Cells);
public sealed record EbdViewDto(IReadOnlyList<IdName> Offerings, IReadOnlyList<EbdRow> Rows);
public sealed record IdName(Guid Id, string Name);

// ---- AI ----
public sealed record AiMeta(string Agent, string Provider, string Model, int InputTokens, int OutputTokens, int LatencyMs, bool FallbackUsed);
public sealed record HelperDto(string Name, string Type, string Why);
public sealed record RecommendationDto(Guid Id, Guid AccountId, DateTime CreatedAt, RecommendationStatus Status, string Action,
    IReadOnlyList<HelperDto> WhoseHelp, string Channel, string Rationale, IReadOnlyList<SectionKey> SourceSections,
    bool AtRisk, string? RiskReason, AiMeta Meta);
public sealed record AcceptRecommendationRequest(Guid OwnerId, DateOnly DueDate);
public sealed record DismissRecommendationRequest(string? Reason);
public sealed record CopilotRequest(SectionKey Section, string Instruction);
public sealed record CopilotResponse(string Suggestion, AiMeta Meta);
public sealed record RiskScanItem(Guid AccountId, string AccountName, RiskLevel RiskLevel, IReadOnlyList<string> Drivers, string Explanation);
public sealed record RiskScanDto(IReadOnlyList<RiskScanItem> Accounts, AiMeta? Meta);
public sealed record BriefSection(string Title, string Body, IReadOnlyList<Guid> AccountIds);
public sealed record ExecutiveBriefDto(DateTime GeneratedAt, string Headline, IReadOnlyList<BriefSection> Sections, AiMeta Meta);
public sealed record AgentUsage(string Agent, int Calls, long InputTokens, long OutputTokens, int Failures);
public sealed record AiUsageDto(IReadOnlyList<AgentUsage> ByAgent, long BudgetTokens, long UsedTokens);
public sealed record EvaluationDto(string Agent, decimal Score, bool Passed, string Notes, DateTime At);

// ---- Import / export ----
public sealed record ImportFinding(string Severity, string Sheet, string? Cell, string Message);
public sealed record MappedSection(SectionKey Section, int Fields, decimal Confidence);
public sealed record ImportReportDto(Guid ImportId, string FileName, IReadOnlyList<string> SheetsFound, string? AccountName,
    IReadOnlyList<ImportFinding> Findings, IReadOnlyList<MappedSection> Mapped, bool CanCommit, AiMeta? Meta);
public sealed record CommitImportRequest(Guid? AccountId, Guid? GroupId, AccountType? Type);
public sealed record FileResult(string FileName, byte[] Content);

// ---- Security ----
public sealed record FindingDto(Guid Id, DateTime At, Severity Severity, string Rule, string Detail, string? Explanation, FindingStatus Status);
public sealed record AuditDto(DateTime At, string UserEmail, string Action, string Resource, AuditOutcome Outcome, string Ip);
