namespace Kratos.Domain;

public enum Role { Admin, Executive, GroupLead, AccountManager }

public enum AccountType { NBD, EBD }

public enum Raci { R, A, C, I }

public enum StakeholderRole { DecisionMaker, Influencer, User, Gatekeeper }

public enum Importance { A, B, C }

public enum Knowledge { Unknown, KnownUnconfirmed, Confirmed }

public enum SectionKey
{
    Profile, Infobase, Vision, Strategy, Opportunities, Stakeholders,
    Brickwall, Tactical, PriorityActions, ActionPlan, Resources,
}

public enum ActionStatus { Open, InProgress, Done, Blocked }

public enum ActionOrigin { Manual, AiNextBestAction }

public enum ChecklistAnswer { Yes, Partial, No }

public enum BrickwallCategory { Strategic, Behavioural, Operational }

public enum ChecklistWeight { Essential, Desirable, Useful }

public enum ResourceType { Money, Expertise, ManagementTime, Travel }

public enum RiskLevel { Low, Medium, High }

public enum RecommendationStatus { New, Accepted, Dismissed }

public enum AuditOutcome { Success, Denied, Failed }

public enum Severity { Low, Medium, High, Critical }

public enum FindingStatus { Open, Acknowledged }
