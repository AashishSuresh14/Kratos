// Types mirroring docs/api-contract.md (v1). Keep in sync with the contract, not with the UI.

// ---------- Enums ----------
export const ROLES = ['Admin', 'Executive', 'GroupLead', 'AccountManager'] as const;
export type Role = (typeof ROLES)[number];

export type AccountType = 'NBD' | 'EBD';
export type Raci = 'R' | 'A' | 'C' | 'I';
export type StakeholderRole = 'DecisionMaker' | 'Influencer' | 'User' | 'Gatekeeper';
export type Importance = 'A' | 'B' | 'C';
export type Knowledge = 'Unknown' | 'KnownUnconfirmed' | 'Confirmed';

export const SECTION_KEYS = [
  'profile',
  'infobase',
  'vision',
  'strategy',
  'opportunities',
  'stakeholders',
  'brickwall',
  'tactical',
  'priorityActions',
  'actionPlan',
  'resources',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const ACTION_STATUSES = ['Open', 'InProgress', 'Done', 'Blocked'] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export type ChecklistAnswer = 'Yes' | 'Partial' | 'No';
export type BrickwallCategory = 'Strategic' | 'Behavioural' | 'Operational';
export type ChecklistWeight = 'Essential' | 'Desirable' | 'Useful';
export type ResourceType = 'Money' | 'Expertise' | 'ManagementTime' | 'Travel';
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type RecommendationStatus = 'New' | 'Accepted' | 'Dismissed';
export type Rating = 1 | 2 | 3 | 4 | 5;

// ---------- Errors (RFC 7807) ----------
export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
}

// ---------- Auth ----------
export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  groupIds: string[];
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface LoginResponse {
  token: string;
  expiresAt: string;
  user: User;
}

// ---------- Master data ----------
export interface Offering {
  id: string;
  name: string;
  category: string;
  isActive: boolean;
}
export interface Strategy {
  id: string;
  name: string;
  description: string;
  isActive: boolean;
}
export interface BrickwallCriterion {
  id: string;
  name: string;
  category: BrickwallCategory;
  weight: number;
  isActive: boolean;
}
export interface ChecklistQuestion {
  id: string;
  text: string;
  weight: ChecklistWeight;
  isActive: boolean;
}
export interface Group {
  id: string;
  name: string;
  leadUserId: string;
  leadName: string;
}
export interface ScoringWeight {
  key: string;
  label: string;
  weight: number;
}
export interface MasterData {
  offerings: Offering[];
  strategies: Strategy[];
  brickwallCriteria: BrickwallCriterion[];
  checklistQuestions: ChecklistQuestion[];
  groups: Group[];
  scoringWeights: ScoringWeight[];
}
export type MasterKind = 'offerings' | 'strategies' | 'brickwallCriteria' | 'checklistQuestions';
export interface MasterItemByKind {
  offerings: Offering;
  strategies: Strategy;
  brickwallCriteria: BrickwallCriterion;
  checklistQuestions: ChecklistQuestion;
}
export type MasterItemInput<K extends MasterKind> = Omit<MasterItemByKind[K], 'id'>;

export interface AdminUser extends User {
  isActive: boolean;
}
export interface CreateUserRequest {
  email: string;
  displayName: string;
  role: Role;
  password: string;
}
export interface UpdateUserRequest {
  displayName: string;
  role: Role;
  isActive: boolean;
}
export interface GroupInput {
  name: string;
  leadUserId: string;
}

// ---------- Accounts ----------
export interface AccountSummary {
  id: string;
  name: string;
  industry: string;
  region: string;
  type: AccountType;
  groupId: string;
  groupName: string;
  captainId: string;
  captainName: string;
  health: number;
  riskLevel: RiskLevel;
  completion: number;
  overdueActions: number;
  staleSections: number;
  lastReviewedAt: string | null;
  currentVersion: number;
}
export interface CreateAccountRequest {
  name: string;
  industry: string;
  region: string;
  type: AccountType;
  groupId: string;
  captainId: string;
}
export interface AccountQuery {
  type?: AccountType;
  groupId?: string;
  search?: string;
}

export interface SectionState {
  key: SectionKey;
  code: string;
  title: string;
  completion: number;
  updatedAt: string | null;
  isStale: boolean;
}
export interface Profile {
  accountSince: string | null;
  currentRunRate: number | null;
  currency: 'USD';
  cxoConnect: string;
  challenges: string;
  currentOfferingIds: string[];
  aspirationalOfferingIds: string[];
  reviewCadenceDays: number;
}
export interface TeamMember {
  userId: string;
  displayName: string;
  raci: Raci;
  responsibility: string;
}
export interface Infobase {
  unknowns: string;
  knownUnconfirmed: string;
  growthLevers: string;
}
export interface Stakeholder {
  id: string;
  name: string;
  title: string;
  role: StakeholderRole;
  importance: Importance;
  buyingMotive: string;
  perception: Rating | null;
  perceptionVsCompetitors: string;
  knowledge: Knowledge;
  notes: string;
}
export interface Vision {
  threeYear: string;
  oneYear: string;
  objectives: string[];
}
export interface Opportunity {
  id: string;
  title: string;
  offeringId: string;
  offeringName: string;
  potential: Rating;
  effort: Rating;
  complexity: Rating;
  estimatedValue: number | null;
  isPriority: boolean;
  score: number;
}
export interface BrickwallRating {
  criterionId: string;
  score: Rating | null;
  note: string;
}
export interface TacticalItem {
  opportunityId: string;
  answers: { questionId: string; answer: ChecklistAnswer | null }[];
}
export interface Resource {
  id: string;
  type: ResourceType;
  description: string;
  amount: number | null;
}
export interface Scores {
  opportunity: number;
  brickwall: number;
  checklist: number;
  perception: number;
  completion: number;
  health: number;
  riskLevel: RiskLevel;
  riskReasons: string[];
}
export interface AccountPlan {
  summary: AccountSummary;
  rowVersion: string;
  canEdit: boolean;
  sections: SectionState[];
  profile: Profile;
  team: TeamMember[];
  infobase: Infobase;
  stakeholders: Stakeholder[];
  vision: Vision;
  strategyIds: string[];
  opportunities: Opportunity[];
  brickwall: BrickwallRating[];
  tactical: TacticalItem[];
  resources: Resource[];
  actions: Action[];
  scores: Scores;
}

export type StakeholderInput = Omit<Stakeholder, 'id'>;
export type OpportunityInput = Omit<Opportunity, 'id' | 'offeringName' | 'score'>;
export type ResourceInput = Omit<Resource, 'id'>;
export type TeamMemberInput = Omit<TeamMember, 'displayName'>;

// ---------- Versions ----------
export interface Version {
  number: number;
  createdAt: string;
  createdBy: string;
  changeSummary: string;
  scores: Scores;
}
export interface VersionDiff {
  changes: { section: SectionKey; field: string; before: string; after: string }[];
}
export interface ScoreTrend {
  points: {
    version: number;
    date: string;
    health: number;
    opportunity: number;
    brickwall: number;
    checklist: number;
    perception: number;
  }[];
}

// ---------- Actions ----------
export interface Action {
  id: string;
  accountId: string;
  accountName: string;
  title: string;
  sourceSection: SectionKey;
  opportunityId: string | null;
  ownerId: string;
  ownerName: string;
  dueDate: string;
  status: ActionStatus;
  isOverdue: boolean;
  parentId: string | null;
  origin: 'Manual' | 'AiNextBestAction';
  createdAt: string;
}
export interface ActionQuery {
  accountId?: string;
  status?: ActionStatus;
  mine?: boolean;
  overdue?: boolean;
}
export interface CreateActionRequest {
  title: string;
  sourceSection: SectionKey;
  opportunityId?: string;
  ownerId: string;
  dueDate: string;
  parentId?: string;
}
export interface UpdateActionRequest {
  status?: ActionStatus;
  dueDate?: string;
  ownerId?: string;
  title?: string;
}

// ---------- Views ----------
export interface MacView {
  totals: { accounts: number; atRisk: number; overdueActions: number; avgHealth: number };
  accounts: AccountSummary[];
  healthByGroup: { groupName: string; avgHealth: number }[];
}
export interface NbdAccount extends AccountSummary {
  readiness: number;
  topOpportunities: Opportunity[];
}
export interface NbdView {
  accounts: NbdAccount[];
}
export type CrossSellState = 'Current' | 'Aspirational' | 'Opportunity' | 'None';
export interface EbdView {
  offerings: { id: string; name: string }[];
  rows: {
    accountId: string;
    accountName: string;
    relationship: number;
    cells: { offeringId: string; state: CrossSellState }[];
  }[];
}

// ---------- AI ----------
export interface AiMeta {
  agent: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  fallbackUsed: boolean;
}
export type Channel = 'Meeting' | 'Email' | 'ExecutiveConnect' | 'Event' | 'Call' | 'Workshop';
export interface Recommendation {
  id: string;
  accountId: string;
  createdAt: string;
  status: RecommendationStatus;
  action: string;
  whoseHelp: { name: string; type: 'Internal' | 'CustomerStakeholder'; why: string }[];
  channel: Channel;
  rationale: string;
  sourceSections: SectionKey[];
  atRisk: boolean;
  riskReason: string | null;
  meta: AiMeta;
}
export interface CopilotRequest {
  section: SectionKey;
  instruction: string;
}
export interface CopilotResponse {
  suggestion: string;
  meta: AiMeta;
}
export interface RiskScan {
  accounts: {
    accountId: string;
    accountName: string;
    riskLevel: RiskLevel;
    drivers: string[];
    explanation: string;
  }[];
  meta: AiMeta;
}
export interface ExecutiveBrief {
  generatedAt: string;
  headline: string;
  sections: { title: string; body: string; accountIds: string[] }[];
  meta: AiMeta;
}
export interface AiUsage {
  byAgent: { agent: string; calls: number; inputTokens: number; outputTokens: number; failures: number }[];
  budgetTokens: number;
  usedTokens: number;
}
export interface AiEvaluation {
  agent: string;
  score: number;
  passed: boolean;
  notes: string;
  at: string;
}

// ---------- Import ----------
export type FindingSeverity = 'Error' | 'Warning' | 'Info';
export interface ImportReport {
  importId: string;
  fileName: string;
  sheetsFound: string[];
  accountName: string | null;
  findings: { severity: FindingSeverity; sheet: string; cell: string | null; message: string }[];
  mapped: { section: SectionKey; fields: number; confidence: number }[];
  canCommit: boolean;
  meta?: AiMeta | null;
}
export interface CommitImportRequest {
  accountId?: string;
  groupId?: string;
  type?: AccountType;
}

// ---------- Security ----------
export type SecuritySeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export interface SecurityFinding {
  id: string;
  at: string;
  severity: SecuritySeverity;
  rule: string;
  detail: string;
  explanation: string | null;
  status: 'Open' | 'Acknowledged';
}
export interface AuditEntry {
  at: string;
  userEmail: string;
  action: string;
  resource: string;
  outcome: 'Success' | 'Denied' | 'Failed';
  ip: string;
}

// ---------- Health ----------
export interface HealthStatus {
  status: 'ok';
  version: string;
  db: 'ok';
  ai: Record<string, 'configured' | 'missing'>;
}
