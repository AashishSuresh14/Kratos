// Fictional seed data for mock mode. All companies and people are invented.
import type {
  Action,
  AdminUser,
  AuditEntry,
  BrickwallCriterion,
  ChecklistAnswer,
  ChecklistQuestion,
  Group,
  Importance,
  Knowledge,
  Offering,
  Rating,
  Raci,
  Recommendation,
  ResourceType,
  ScoringWeight,
  SectionKey,
  SecurityFinding,
  StakeholderRole,
  Strategy,
} from '../types';

export const DAY = 86_400_000;
export const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();
export const dateIn = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------- People ----------
export interface MockUser extends AdminUser {
  title: string;
}
export const users: MockUser[] = [
  { id: 'u-admin', email: 'admin@kratos.demo', displayName: 'Neha Kapoor', role: 'Admin', groupIds: [], isActive: true, title: 'Platform administrator' },
  { id: 'u-exec', email: 'exec@kratos.demo', displayName: 'Vikram Rao', role: 'Executive', groupIds: [], isActive: true, title: 'Chief Revenue Officer' },
  { id: 'u-nbd', email: 'nbd.lead@kratos.demo', displayName: 'Meera Nair', role: 'GroupLead', groupIds: ['g-nbd'], isActive: true, title: 'Head of New Business' },
  { id: 'u-ebd', email: 'ebd.lead@kratos.demo', displayName: 'Rahul Menon', role: 'GroupLead', groupIds: ['g-ebd'], isActive: true, title: 'Head of Existing Business' },
  { id: 'u-priya', email: 'priya.am@kratos.demo', displayName: 'Priya Sharma', role: 'AccountManager', groupIds: ['g-nbd', 'g-ebd'], isActive: true, title: 'Account manager' },
  { id: 'u-arjun', email: 'arjun.am@kratos.demo', displayName: 'Arjun Das', role: 'AccountManager', groupIds: ['g-nbd', 'g-ebd'], isActive: true, title: 'Account manager' },
  { id: 'u-sanjay', email: 'sanjay.pillai@kratos.demo', displayName: 'Sanjay Pillai', role: 'AccountManager', groupIds: ['g-ebd'], isActive: true, title: 'Solutions architect' },
  { id: 'u-divya', email: 'divya.k@kratos.demo', displayName: 'Divya Krishnan', role: 'AccountManager', groupIds: ['g-nbd'], isActive: true, title: 'Delivery head' },
];

export const groups: Group[] = [
  { id: 'g-nbd', name: 'New Business (NBD)', leadUserId: 'u-nbd', leadName: 'Meera Nair' },
  { id: 'g-ebd', name: 'Existing Business (EBD)', leadUserId: 'u-ebd', leadName: 'Rahul Menon' },
];

// ---------- Master data ----------
export const offerings: Offering[] = [
  { id: 'of-cloud', name: 'Cloud migration', category: 'Cloud', isActive: true },
  { id: 'of-data', name: 'Data & analytics', category: 'Data', isActive: true },
  { id: 'of-prod', name: 'Product engineering', category: 'Engineering', isActive: true },
  { id: 'of-qe', name: 'Quality engineering', category: 'Quality', isActive: true },
  { id: 'of-ams', name: 'Managed app services', category: 'Managed services', isActive: true },
  { id: 'of-ai', name: 'AI & automation', category: 'AI', isActive: true },
  { id: 'of-crm', name: 'CRM implementation', category: 'Enterprise apps', isActive: true },
  { id: 'of-sec', name: 'Cybersecurity', category: 'Security', isActive: true },
  { id: 'of-devops', name: 'Platform & DevOps', category: 'Engineering', isActive: true },
];

export const strategies: Strategy[] = [
  { id: 'st-land', name: 'Land and expand via pilot', description: 'Win a tightly scoped pilot, prove value in 90 days, then widen scope.', isActive: true },
  { id: 'st-exec', name: 'Executive sponsorship programme', description: 'Pair each CXO with a named Psiog executive and a quarterly business review.', isActive: true },
  { id: 'st-colab', name: 'Co-innovation lab', description: 'Joint lab with the customer to prototype on their real data and backlog.', isActive: true },
  { id: 'st-consol', name: 'Vendor consolidation play', description: 'Position Psiog to absorb scope from under-performing incumbent vendors.', isActive: true },
  { id: 'st-outcome', name: 'Outcome-based commercials', description: 'Move from time-and-materials to outcome-linked pricing on mature streams.', isActive: true },
  { id: 'st-coe', name: 'Centre of excellence build-out', description: 'Stand up a dedicated CoE that becomes the default partner for a capability.', isActive: true },
];

export const brickwallCriteria: BrickwallCriterion[] = [
  { id: 'bw-align', name: 'Alignment with customer priorities', category: 'Strategic', weight: 3, isActive: true },
  { id: 'bw-sponsor', name: 'Access to an executive sponsor', category: 'Strategic', weight: 3, isActive: true },
  { id: 'bw-compete', name: 'Position against competitors', category: 'Strategic', weight: 2, isActive: true },
  { id: 'bw-trust', name: 'Trust with decision makers', category: 'Behavioural', weight: 3, isActive: true },
  { id: 'bw-respond', name: 'Responsiveness to our proposals', category: 'Behavioural', weight: 2, isActive: true },
  { id: 'bw-open', name: 'Openness to new vendors', category: 'Behavioural', weight: 1, isActive: true },
  { id: 'bw-procure', name: 'Procurement readiness', category: 'Operational', weight: 2, isActive: true },
  { id: 'bw-delivery', name: 'Delivery track record with the account', category: 'Operational', weight: 2, isActive: true },
  { id: 'bw-terms', name: 'Commercial terms fit', category: 'Operational', weight: 1, isActive: true },
];

export const checklistQuestions: ChecklistQuestion[] = [
  { id: 'cq-budget', text: 'Budget validated with the economic buyer?', weight: 'Essential', isActive: true },
  { id: 'cq-criteria', text: 'Decision criteria and process known?', weight: 'Essential', isActive: true },
  { id: 'cq-pain', text: 'Confirmed business pain this addresses?', weight: 'Essential', isActive: true },
  { id: 'cq-champion', text: 'Customer-side champion identified?', weight: 'Desirable', isActive: true },
  { id: 'cq-ref', text: 'Reference case in the same industry?', weight: 'Desirable', isActive: true },
  { id: 'cq-scope', text: 'Scope agreed with technical stakeholders?', weight: 'Desirable', isActive: true },
  { id: 'cq-comp', text: 'Competitor presence mapped?', weight: 'Useful', isActive: true },
  { id: 'cq-close', text: 'Mutual close plan with dates?', weight: 'Useful', isActive: true },
];

export const scoringWeights: ScoringWeight[] = [
  { key: 'opportunity', label: 'Opportunity quality', weight: 25 },
  { key: 'brickwall', label: 'Brickwall strength', weight: 20 },
  { key: 'checklist', label: 'Tactical readiness', weight: 20 },
  { key: 'perception', label: 'Stakeholder perception', weight: 20 },
  { key: 'completion', label: 'Plan completeness', weight: 15 },
];

// ---------- Accounts ----------
export interface StakeholderSpec {
  name: string;
  title: string;
  role: StakeholderRole;
  importance: Importance;
  perception: Rating | null;
  knowledge: Knowledge;
  motive: string;
  vsComp: string;
}
export interface OppSpec {
  title: string;
  offeringId: string;
  p: Rating;
  e: Rating;
  c: Rating;
  value: number | null;
  priority: boolean;
}
export interface ActionSpec {
  title: string;
  section: SectionKey;
  opp?: number;
  owner: string;
  due: number;
  status: Action['status'];
  children?: { title: string; owner: string; due: number; status: Action['status'] }[];
  origin?: Action['origin'];
}
export interface AccountSpec {
  id: string;
  name: string;
  industry: string;
  region: string;
  type: 'NBD' | 'EBD';
  groupId: string;
  captainId: string;
  team: { userId: string; raci: Raci; responsibility: string }[];
  accountSince: string | null;
  runRate: number | null;
  cxo: string;
  challenges: string;
  current: string[];
  aspirational: string[];
  cadence: number;
  infobase: { unknowns: string; knownUnconfirmed: string; growthLevers: string };
  stakeholders: StakeholderSpec[];
  threeYear: string;
  oneYear: string;
  objectives: string[];
  strategyIds: string[];
  opportunities: OppSpec[];
  /** 0..1, drives brickwall and checklist ratings */
  strength: number;
  resources: { type: ResourceType; description: string; amount: number | null }[];
  actions: ActionSpec[];
  /** Days since each section was last touched; null = never. */
  touched: Partial<Record<SectionKey, number | null>>;
  reviewedDaysAgo: number | null;
  versions: number;
}

export const accountSpecs: AccountSpec[] = [
  {
    id: 'acc-halvorsen',
    name: 'Halvorsen Maritime Group',
    industry: 'Shipping & logistics',
    region: 'Northern Europe',
    type: 'NBD',
    groupId: 'g-nbd',
    captainId: 'u-priya',
    team: [
      { userId: 'u-priya', raci: 'A', responsibility: 'Account captain, owns the plan' },
      { userId: 'u-divya', raci: 'R', responsibility: 'Pilot delivery lead' },
      { userId: 'u-nbd', raci: 'C', responsibility: 'Executive sponsor on the Psiog side' },
    ],
    accountSince: null,
    runRate: null,
    cxo: 'CIO met twice (Oslo, June). CFO not yet engaged.',
    challenges:
      'Fleet telemetry sits in three legacy platforms and no one trusts the fuel-efficiency numbers.\nIncumbent integrator holds a five-year run contract until 2027.',
    current: [],
    aspirational: ['of-data', 'of-cloud', 'of-ai'],
    cadence: 30,
    infobase: {
      unknowns: 'Budget owner for the telemetry programme. Whether the CFO sees this as cost or growth.',
      knownUnconfirmed: 'A board mandate to cut fuel spend 8% by 2028 (heard from the CIO, not in writing).',
      growthLevers: 'Emissions reporting deadlines; new vessel orders in 2027 need a digital twin baseline.',
    },
    stakeholders: [
      { name: 'Ingrid Solberg', title: 'Chief Information Officer', role: 'DecisionMaker', importance: 'A', perception: 4, knowledge: 'Confirmed', motive: 'A single trusted fleet data platform before the 2027 vessel orders', vsComp: 'Sees us as more hands-on than the incumbent' },
      { name: 'Lars Vik', title: 'Chief Financial Officer', role: 'DecisionMaker', importance: 'A', perception: null, knowledge: 'Unknown', motive: 'Unclear — likely cost of run', vsComp: 'No view yet' },
      { name: 'Maren Holm', title: 'Head of Fleet Operations', role: 'Influencer', importance: 'B', perception: 3, knowledge: 'KnownUnconfirmed', motive: 'Fewer manual fuel reports', vsComp: 'Neutral' },
      { name: 'Erik Dahl', title: 'Procurement Manager', role: 'Gatekeeper', importance: 'C', perception: 2, knowledge: 'KnownUnconfirmed', motive: 'Keep vendor count down', vsComp: 'Prefers the incumbent' },
    ],
    threeYear: 'Be Halvorsen\'s data and AI partner of record for fleet performance, with a running managed platform across all 42 vessels.',
    oneYear: 'Win and deliver a 12-week telemetry pilot on six vessels that proves a reliable fuel-efficiency baseline.',
    objectives: ['Signed pilot SOW by end of Q4', 'CFO meeting with our CRO within 60 days', 'Reference-ready pilot results by Q2'],
    strategyIds: ['st-land', 'st-exec'],
    opportunities: [
      { title: 'Fleet telemetry pilot (6 vessels)', offeringId: 'of-data', p: 4, e: 2, c: 3, value: 180_000, priority: true },
      { title: 'Emissions reporting automation', offeringId: 'of-ai', p: 4, e: 3, c: 3, value: 240_000, priority: true },
      { title: 'Legacy platform cloud move', offeringId: 'of-cloud', p: 5, e: 4, c: 5, value: 900_000, priority: false },
    ],
    strength: 0.55,
    resources: [
      { type: 'Expertise', description: 'Maritime data SME for pilot design (2 weeks)', amount: null },
      { type: 'Travel', description: 'Two onsite workshops in Oslo', amount: 9_000 },
      { type: 'ManagementTime', description: 'CRO time for the CFO meeting', amount: null },
    ],
    actions: [
      { title: 'Draft pilot proposal with a fuel-baseline success metric', section: 'priorityActions', opp: 0, owner: 'u-priya', due: 6, status: 'InProgress', children: [
        { title: 'Collect sample telemetry exports from two vessels', owner: 'u-divya', due: 3, status: 'Done' },
        { title: 'Review pricing with the NBD lead', owner: 'u-nbd', due: 5, status: 'Open' },
      ] },
      { title: 'Secure CFO introduction through the CIO', section: 'stakeholders', owner: 'u-priya', due: -4, status: 'Open' },
      { title: 'Map the incumbent contract exit terms', section: 'brickwall', owner: 'u-divya', due: 14, status: 'Open' },
    ],
    touched: { profile: 12, infobase: 20, vision: 18, strategy: 18, opportunities: 5, stakeholders: 9, brickwall: 40, tactical: 22, priorityActions: 3, actionPlan: 3, resources: 35 },
    reviewedDaysAgo: 18,
    versions: 4,
  },
  {
    id: 'acc-quillfeather',
    name: 'Quillfeather Insurance',
    industry: 'Insurance',
    region: 'UK & Ireland',
    type: 'NBD',
    groupId: 'g-nbd',
    captainId: 'u-arjun',
    team: [
      { userId: 'u-arjun', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-divya', raci: 'C', responsibility: 'Solution shaping for claims' },
    ],
    accountSince: null,
    runRate: null,
    cxo: 'No CXO contact yet. Working through the Head of Claims Transformation.',
    challenges: 'Claims cycle time is 40% above market. A core platform replacement is stalled after a failed first vendor.',
    current: [],
    aspirational: ['of-qe', 'of-crm', 'of-ai'],
    cadence: 30,
    infobase: {
      unknowns: 'Who owns the stalled platform budget now. Timeline for the re-tender.',
      knownUnconfirmed: 'Re-tender expected in Q1; two global SIs shortlisted.',
      growthLevers: 'Regulator attention on claims handling times.',
    },
    stakeholders: [
      { name: 'Oliver Grant', title: 'Head of Claims Transformation', role: 'Influencer', importance: 'A', perception: 3, knowledge: 'Confirmed', motive: 'Rescue the platform programme and his credibility', vsComp: 'Wary of big SIs after the first failure' },
      { name: 'Hannah Reid', title: 'Chief Operating Officer', role: 'DecisionMaker', importance: 'A', perception: null, knowledge: 'Unknown', motive: 'Not known', vsComp: 'Not known' },
      { name: 'Tom Ellis', title: 'QA Manager', role: 'User', importance: 'C', perception: 4, knowledge: 'KnownUnconfirmed', motive: 'Test automation to stop regression escapes', vsComp: 'Liked our test-automation demo' },
    ],
    threeYear: 'Become the specialist quality and claims-automation partner alongside whichever SI wins the platform.',
    oneYear: 'Land a test-automation engagement on the claims platform rescue.',
    objectives: ['Meet the COO before the re-tender', 'Submit a quality-engineering proposal'],
    strategyIds: ['st-land'],
    opportunities: [
      { title: 'Claims platform test automation', offeringId: 'of-qe', p: 4, e: 2, c: 2, value: 150_000, priority: true },
      { title: 'Claims triage with AI', offeringId: 'of-ai', p: 3, e: 4, c: 4, value: 300_000, priority: false },
    ],
    strength: 0.3,
    resources: [{ type: 'Expertise', description: 'Insurance QE practice lead for the proposal', amount: null }],
    actions: [
      { title: 'Ask Oliver Grant for a COO briefing slot', section: 'stakeholders', owner: 'u-arjun', due: -9, status: 'Open' },
      { title: 'Build a claims regression-suite demo', section: 'priorityActions', opp: 0, owner: 'u-divya', due: -2, status: 'Blocked' },
      { title: 'Qualify the re-tender timeline', section: 'tactical', owner: 'u-arjun', due: -1, status: 'Open' },
    ],
    touched: { profile: 50, infobase: 48, vision: 55, strategy: 55, opportunities: 44, stakeholders: 38, brickwall: null, tactical: null, priorityActions: 30, actionPlan: 30, resources: null },
    reviewedDaysAgo: 52,
    versions: 2,
  },
  {
    id: 'acc-tavira',
    name: 'Tavira Energy Partners',
    industry: 'Renewable energy',
    region: 'Iberia',
    type: 'NBD',
    groupId: 'g-nbd',
    captainId: 'u-priya',
    team: [
      { userId: 'u-priya', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-nbd', raci: 'I', responsibility: 'Kept informed on commercials' },
    ],
    accountSince: null,
    runRate: null,
    cxo: 'CTO sponsor confirmed; quarterly call agreed.',
    challenges: 'Forecasting for wind output uses spreadsheets. Grid penalties for forecast error rose sharply this year.',
    current: [],
    aspirational: ['of-data', 'of-ai', 'of-devops'],
    cadence: 45,
    infobase: {
      unknowns: 'In-house data team capacity after the reorganisation.',
      knownUnconfirmed: 'Grid penalty cost is roughly EUR 2M a year.',
      growthLevers: 'Portfolio doubling by 2028; every new site needs forecasting.',
    },
    stakeholders: [
      { name: 'Beatriz Lobo', title: 'Chief Technology Officer', role: 'DecisionMaker', importance: 'A', perception: 4, knowledge: 'Confirmed', motive: 'Cut grid penalties and look good to the board', vsComp: 'Prefers a specialist over a large SI' },
      { name: 'Nuno Faria', title: 'Head of Energy Trading', role: 'Influencer', importance: 'A', perception: 4, knowledge: 'Confirmed', motive: 'Better day-ahead forecasts', vsComp: 'Our forecasting POC impressed him' },
      { name: 'Clara Mendes', title: 'IT Procurement', role: 'Gatekeeper', importance: 'B', perception: 3, knowledge: 'KnownUnconfirmed', motive: 'Clear commercial terms', vsComp: 'Neutral' },
    ],
    threeYear: 'Run Tavira\'s forecasting and data platform for the whole portfolio as a managed service.',
    oneYear: 'Production forecasting for the four largest wind sites with measurable penalty reduction.',
    objectives: ['Win the forecasting build', 'Penalty reduction case study by month 9', 'Agree a platform roadmap with the CTO'],
    strategyIds: ['st-land', 'st-colab', 'st-outcome'],
    opportunities: [
      { title: 'Wind output forecasting build', offeringId: 'of-ai', p: 5, e: 2, c: 3, value: 420_000, priority: true },
      { title: 'Energy data platform', offeringId: 'of-data', p: 4, e: 3, c: 3, value: 380_000, priority: true },
      { title: 'MLOps pipeline', offeringId: 'of-devops', p: 3, e: 2, c: 2, value: 90_000, priority: false },
    ],
    strength: 0.8,
    resources: [
      { type: 'Expertise', description: 'Two data scientists for the forecasting build', amount: null },
      { type: 'Money', description: 'Pre-sales POC investment', amount: 25_000 },
    ],
    actions: [
      { title: 'Present POC results to the CTO and trading head', section: 'priorityActions', opp: 0, owner: 'u-priya', due: 8, status: 'Open', children: [
        { title: 'Back-test the model on last winter', owner: 'u-priya', due: 4, status: 'InProgress' },
      ] },
      { title: 'Share outcome-based pricing options', section: 'strategy', owner: 'u-nbd', due: 15, status: 'Open' },
    ],
    touched: { profile: 4, infobase: 6, vision: 6, strategy: 10, opportunities: 3, stakeholders: 5, brickwall: 8, tactical: 7, priorityActions: 2, actionPlan: 2, resources: 12 },
    reviewedDaysAgo: 6,
    versions: 5,
  },
  {
    id: 'acc-kestrel',
    name: 'Kestrel Aerocomponents',
    industry: 'Aerospace manufacturing',
    region: 'North America',
    type: 'NBD',
    groupId: 'g-nbd',
    captainId: 'u-divya',
    team: [
      { userId: 'u-divya', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-arjun', raci: 'R', responsibility: 'Proposal and pricing' },
    ],
    accountSince: null,
    runRate: null,
    cxo: 'VP Engineering engaged; CIO attended one workshop.',
    challenges: 'Engineering change orders take 30 days to reach the shop floor. Two ERPs after an acquisition.',
    current: [],
    aspirational: ['of-prod', 'of-devops', 'of-sec'],
    cadence: 30,
    infobase: {
      unknowns: 'Whether ITAR constraints rule out offshore delivery.',
      knownUnconfirmed: 'ERP consolidation budget approved for next fiscal year.',
      growthLevers: 'A new plant in 2027 needs its MES integration built from scratch.',
    },
    stakeholders: [
      { name: 'Dana Whitfield', title: 'VP Engineering', role: 'DecisionMaker', importance: 'A', perception: 3, knowledge: 'Confirmed', motive: 'Faster change-order flow', vsComp: 'Comparing us with two local firms' },
      { name: 'Marcus Lee', title: 'Chief Information Officer', role: 'DecisionMaker', importance: 'A', perception: 2, knowledge: 'KnownUnconfirmed', motive: 'Security and compliance first', vsComp: 'Concerned about offshore delivery' },
      { name: 'Priscilla Ong', title: 'Manufacturing Systems Lead', role: 'User', importance: 'B', perception: 4, knowledge: 'Confirmed', motive: 'Fewer manual ECO steps', vsComp: 'Champion for us' },
    ],
    threeYear: 'Engineering-to-shop-floor digital thread partner across both plants.',
    oneYear: 'Deliver an ECO workflow product for one plant with an onshore-compliant model.',
    objectives: ['Resolve the ITAR delivery question', 'Win the ECO workflow build'],
    strategyIds: ['st-land', 'st-coe'],
    opportunities: [
      { title: 'ECO workflow product', offeringId: 'of-prod', p: 4, e: 3, c: 3, value: 350_000, priority: true },
      { title: 'OT security assessment', offeringId: 'of-sec', p: 3, e: 2, c: 2, value: 70_000, priority: false },
    ],
    strength: 0.45,
    resources: [{ type: 'Expertise', description: 'US-based compliance advisor', amount: 15_000 }],
    actions: [
      { title: 'Propose an onshore/offshore delivery model for ITAR', section: 'brickwall', owner: 'u-divya', due: -6, status: 'InProgress' },
      { title: 'Arrange a security deep-dive with the CIO', section: 'stakeholders', owner: 'u-arjun', due: 10, status: 'Open' },
    ],
    touched: { profile: 25, infobase: 25, vision: 31, strategy: 31, opportunities: 20, stakeholders: 16, brickwall: 33, tactical: 40, priorityActions: 12, actionPlan: 12, resources: 45 },
    reviewedDaysAgo: 34,
    versions: 3,
  },
  {
    id: 'acc-brightwater',
    name: 'Brightwater Health Systems',
    industry: 'Healthcare providers',
    region: 'North America',
    type: 'EBD',
    groupId: 'g-ebd',
    captainId: 'u-arjun',
    team: [
      { userId: 'u-arjun', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-sanjay', raci: 'R', responsibility: 'Architecture and delivery governance' },
      { userId: 'u-ebd', raci: 'C', responsibility: 'Executive sponsor' },
    ],
    accountSince: '2019-04-01',
    runRate: 2_400_000,
    cxo: 'Quarterly reviews with the CIO; CMIO relationship is new.',
    challenges: 'Patient portal delivery slipped twice this year. CIO is under pressure after a data-privacy audit finding.',
    current: ['of-prod', 'of-qe', 'of-ams'],
    aspirational: ['of-data', 'of-sec', 'of-ai'],
    cadence: 30,
    infobase: {
      unknowns: 'Whether the audit finding changes vendor strategy for FY27.',
      knownUnconfirmed: 'Data platform RFP planned for Q2; two competitors already briefed.',
      growthLevers: 'Security remediation after the audit; clinical analytics for value-based care contracts.',
    },
    stakeholders: [
      { name: 'Dr. Alan Brooks', title: 'Chief Information Officer', role: 'DecisionMaker', importance: 'A', perception: 3, knowledge: 'Confirmed', motive: 'Close the audit finding and restore delivery trust', vsComp: 'Frustrated by the portal slip' },
      { name: 'Rachel Kim', title: 'Chief Medical Information Officer', role: 'Influencer', importance: 'A', perception: 4, knowledge: 'KnownUnconfirmed', motive: 'Clinical analytics for value-based care', vsComp: 'Open to us' },
      { name: 'Greg Patel', title: 'Director, Application Delivery', role: 'User', importance: 'B', perception: 2, knowledge: 'Confirmed', motive: 'Predictable releases', vsComp: 'Compares us unfavourably with a competitor on the billing stream' },
      { name: 'Sofia Alvarez', title: 'Vendor Management Lead', role: 'Gatekeeper', importance: 'B', perception: 3, knowledge: 'Confirmed', motive: 'Vendor consolidation targets', vsComp: 'Neutral' },
    ],
    threeYear: 'Grow from an engineering vendor to Brightwater\'s strategic digital partner, including data, security and managed services, at USD 5M a year.',
    oneYear: 'Recover delivery trust on the patient portal and win the data platform RFP.',
    objectives: ['Portal back on plan by next quarter', 'Win the data platform RFP', 'Security remediation SOW', 'CMIO sponsorship for clinical analytics'],
    strategyIds: ['st-exec', 'st-consol', 'st-coe'],
    opportunities: [
      { title: 'Clinical data platform RFP', offeringId: 'of-data', p: 5, e: 4, c: 4, value: 1_200_000, priority: true },
      { title: 'Audit remediation: security', offeringId: 'of-sec', p: 4, e: 2, c: 3, value: 300_000, priority: true },
      { title: 'Portal test automation uplift', offeringId: 'of-qe', p: 3, e: 1, c: 2, value: 120_000, priority: false },
      { title: 'Readmission risk model', offeringId: 'of-ai', p: 4, e: 4, c: 4, value: 450_000, priority: false },
    ],
    strength: 0.45,
    resources: [
      { type: 'ManagementTime', description: 'EBD lead weekly portal steering', amount: null },
      { type: 'Expertise', description: 'Healthcare data architect for the RFP', amount: null },
      { type: 'Money', description: 'Delivery recovery credits', amount: 60_000 },
    ],
    actions: [
      { title: 'Portal recovery plan signed off by the CIO', section: 'priorityActions', opp: 1, owner: 'u-sanjay', due: -3, status: 'InProgress', children: [
        { title: 'Re-baseline the portal release plan', owner: 'u-sanjay', due: -8, status: 'Done' },
        { title: 'Add a second QA squad', owner: 'u-arjun', due: -1, status: 'Open' },
      ] },
      { title: 'RFP response team and win themes', section: 'priorityActions', opp: 0, owner: 'u-arjun', due: 20, status: 'Open' },
      { title: 'CMIO clinical analytics workshop', section: 'stakeholders', owner: 'u-arjun', due: -12, status: 'Open' },
      { title: 'Win back Greg Patel with release metrics', section: 'stakeholders', owner: 'u-sanjay', due: 7, status: 'Open' },
    ],
    touched: { profile: 8, infobase: 14, vision: 60, strategy: 60, opportunities: 9, stakeholders: 11, brickwall: 50, tactical: 12, priorityActions: 2, actionPlan: 2, resources: 20 },
    reviewedDaysAgo: 41,
    versions: 5,
  },
  {
    id: 'acc-solenne',
    name: 'Solenne Retail Co.',
    industry: 'Retail',
    region: 'Western Europe',
    type: 'EBD',
    groupId: 'g-ebd',
    captainId: 'u-priya',
    team: [
      { userId: 'u-priya', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-sanjay', raci: 'R', responsibility: 'Platform architecture' },
    ],
    accountSince: '2021-09-15',
    runRate: 1_100_000,
    cxo: 'Strong CDO relationship; CEO attended our retail summit.',
    challenges: 'Store-level stock accuracy at 82%. E-commerce peak outages last November.',
    current: ['of-cloud', 'of-devops'],
    aspirational: ['of-data', 'of-ams', 'of-ai'],
    cadence: 30,
    infobase: {
      unknowns: 'Budget split between e-commerce and stores for next year.',
      knownUnconfirmed: 'CDO wants a single demand-forecasting vendor.',
      growthLevers: 'Peak readiness; stock accuracy; loyalty programme relaunch.',
    },
    stakeholders: [
      { name: 'Camille Laurent', title: 'Chief Digital Officer', role: 'DecisionMaker', importance: 'A', perception: 5, knowledge: 'Confirmed', motive: 'Zero peak outages and better stock accuracy', vsComp: 'Our strongest advocate' },
      { name: 'Hugo Moreau', title: 'Head of Store Operations', role: 'Influencer', importance: 'B', perception: 4, knowledge: 'Confirmed', motive: 'Accurate shelf availability', vsComp: 'Positive' },
      { name: 'Élise Martin', title: 'Group Procurement', role: 'Gatekeeper', importance: 'B', perception: 3, knowledge: 'Confirmed', motive: 'Rate-card discipline', vsComp: 'Neutral' },
    ],
    threeYear: 'Solenne\'s platform and data partner, running e-commerce operations and demand forecasting.',
    oneYear: 'Peak-ready platform with zero severity-1 outages and a live demand-forecasting pilot.',
    objectives: ['Peak readiness programme', 'Forecasting pilot in 40 stores', 'Move run support to managed services'],
    strategyIds: ['st-exec', 'st-outcome', 'st-coe'],
    opportunities: [
      { title: 'Demand forecasting pilot', offeringId: 'of-ai', p: 5, e: 3, c: 3, value: 520_000, priority: true },
      { title: 'Managed e-commerce operations', offeringId: 'of-ams', p: 4, e: 2, c: 2, value: 700_000, priority: true },
      { title: 'Retail data lakehouse', offeringId: 'of-data', p: 4, e: 3, c: 4, value: 600_000, priority: false },
    ],
    strength: 0.85,
    resources: [
      { type: 'Expertise', description: 'Retail forecasting specialist', amount: null },
      { type: 'Travel', description: 'Peak war-room onsite in Lyon', amount: 12_000 },
    ],
    actions: [
      { title: 'Peak readiness load test', section: 'priorityActions', opp: 1, owner: 'u-sanjay', due: 12, status: 'InProgress', children: [
        { title: 'Load test at 3x last peak', owner: 'u-sanjay', due: 9, status: 'Open' },
        { title: 'Runbook review with store ops', owner: 'u-priya', due: 11, status: 'Open' },
      ] },
      { title: 'Forecasting pilot store shortlist', section: 'priorityActions', opp: 0, owner: 'u-priya', due: 5, status: 'Done' },
    ],
    touched: { profile: 3, infobase: 7, vision: 9, strategy: 9, opportunities: 4, stakeholders: 6, brickwall: 10, tactical: 5, priorityActions: 1, actionPlan: 1, resources: 14 },
    reviewedDaysAgo: 3,
    versions: 6,
  },
  {
    id: 'acc-orchard',
    name: 'Orchard Lane Foods',
    industry: 'Food & beverage',
    region: 'India',
    type: 'EBD',
    groupId: 'g-ebd',
    captainId: 'u-arjun',
    team: [{ userId: 'u-arjun', raci: 'A', responsibility: 'Account captain' }],
    accountSince: '2022-02-01',
    runRate: 450_000,
    cxo: 'No CXO connect since the CIO left in March.',
    challenges: 'New CIO is reviewing all vendors. Our sponsor left. Distributor app adoption is low.',
    current: ['of-crm', 'of-ams'],
    aspirational: ['of-data', 'of-cloud'],
    cadence: 30,
    infobase: {
      unknowns: 'New CIO\'s priorities and preferred vendors.',
      knownUnconfirmed: 'A vendor rationalisation exercise may cut the panel from eight to three.',
      growthLevers: 'Distributor analytics; cloud move of the ERP.',
    },
    stakeholders: [
      { name: 'Ravi Subramanian', title: 'Chief Information Officer (new)', role: 'DecisionMaker', importance: 'A', perception: 2, knowledge: 'KnownUnconfirmed', motive: 'Rationalise vendors, show quick wins', vsComp: 'Brought his previous vendor in for a briefing' },
      { name: 'Anita Joshi', title: 'Head of Sales Operations', role: 'User', importance: 'B', perception: 3, knowledge: 'Confirmed', motive: 'Distributor app adoption', vsComp: 'Neutral' },
    ],
    threeYear: 'Stay on the three-vendor panel and expand into data and cloud.',
    oneYear: 'Survive the rationalisation with a CIO-endorsed improvement plan.',
    objectives: ['Meet the new CIO', 'Distributor app adoption plan'],
    strategyIds: ['st-exec'],
    opportunities: [
      { title: 'Distributor analytics', offeringId: 'of-data', p: 3, e: 3, c: 3, value: 140_000, priority: true },
      { title: 'ERP cloud move', offeringId: 'of-cloud', p: 4, e: 5, c: 4, value: 500_000, priority: false },
    ],
    strength: 0.25,
    resources: [{ type: 'ManagementTime', description: 'EBD lead to meet the new CIO', amount: null }],
    actions: [
      { title: 'Introductory meeting with the new CIO', section: 'stakeholders', owner: 'u-arjun', due: -15, status: 'Open' },
      { title: 'Distributor app adoption analysis', section: 'priorityActions', opp: 0, owner: 'u-arjun', due: -7, status: 'Open' },
      { title: 'Refresh the account infobase after the CIO change', section: 'infobase', owner: 'u-arjun', due: -20, status: 'Open' },
    ],
    touched: { profile: 70, infobase: 90, vision: 95, strategy: 95, opportunities: 64, stakeholders: 58, brickwall: 88, tactical: null, priorityActions: 40, actionPlan: 40, resources: 80 },
    reviewedDaysAgo: 96,
    versions: 3,
  },
  {
    id: 'acc-veridian',
    name: 'Veridian Civic Bank',
    industry: 'Banking',
    region: 'Middle East',
    type: 'EBD',
    groupId: 'g-ebd',
    captainId: 'u-sanjay',
    team: [
      { userId: 'u-sanjay', raci: 'A', responsibility: 'Account captain' },
      { userId: 'u-ebd', raci: 'C', responsibility: 'Executive sponsor' },
      { userId: 'u-priya', raci: 'R', responsibility: 'Digital channels opportunities' },
    ],
    accountSince: '2020-06-01',
    runRate: 1_800_000,
    cxo: 'CIO and CRO relationships healthy; annual executive summit in place.',
    challenges: 'Open-banking deadlines next year; mainframe skills shortage on their side.',
    current: ['of-qe', 'of-ams', 'of-sec'],
    aspirational: ['of-cloud', 'of-prod'],
    cadence: 45,
    infobase: {
      unknowns: 'Appetite for moving core workloads to cloud given the regulator stance.',
      knownUnconfirmed: 'Open-banking API budget approved.',
      growthLevers: 'Open-banking APIs; mainframe modernisation; fraud analytics.',
    },
    stakeholders: [
      { name: 'Faisal Rahman', title: 'Chief Information Officer', role: 'DecisionMaker', importance: 'A', perception: 4, knowledge: 'Confirmed', motive: 'Meet open-banking deadlines safely', vsComp: 'Values our security record' },
      { name: 'Layla Haddad', title: 'Chief Risk Officer', role: 'Influencer', importance: 'A', perception: 4, knowledge: 'Confirmed', motive: 'Regulatory compliance', vsComp: 'Positive' },
      { name: 'Omar Aziz', title: 'Head of Digital Channels', role: 'User', importance: 'B', perception: 3, knowledge: 'KnownUnconfirmed', motive: 'Faster feature releases', vsComp: 'Also talks to a fintech boutique' },
    ],
    threeYear: 'Veridian\'s modernisation partner for open banking and the mainframe exit.',
    oneYear: 'Deliver open-banking APIs on time and start a mainframe modernisation assessment.',
    objectives: ['Open-banking API build', 'Mainframe assessment SOW'],
    strategyIds: ['st-exec', 'st-coe'],
    opportunities: [
      { title: 'Open-banking API build', offeringId: 'of-prod', p: 5, e: 3, c: 4, value: 900_000, priority: true },
      { title: 'Mainframe modernisation assessment', offeringId: 'of-cloud', p: 4, e: 2, c: 3, value: 200_000, priority: true },
    ],
    strength: 0.7,
    resources: [
      { type: 'Expertise', description: 'Open-banking standards expert', amount: null },
      { type: 'Travel', description: 'Executive summit attendance', amount: 18_000 },
    ],
    actions: [
      { title: 'API design authority set-up', section: 'priorityActions', opp: 0, owner: 'u-sanjay', due: 9, status: 'InProgress' },
      { title: 'Assessment proposal to the CIO', section: 'priorityActions', opp: 1, owner: 'u-priya', due: 16, status: 'Open' },
    ],
    touched: { profile: 15, infobase: 22, vision: 30, strategy: 30, opportunities: 12, stakeholders: 18, brickwall: 26, tactical: 15, priorityActions: 6, actionPlan: 6, resources: 28 },
    reviewedDaysAgo: 20,
    versions: 4,
  },
];

// ---------- AI history ----------
export const seedRecommendations: Omit<Recommendation, 'meta'>[] = [
  {
    id: 'rec-seed-1',
    accountId: 'acc-brightwater',
    createdAt: daysAgo(9),
    status: 'Accepted',
    action: 'Run a clinical analytics discovery workshop with the CMIO before the data platform RFP is issued.',
    whoseHelp: [
      { name: 'Rachel Kim', type: 'CustomerStakeholder', why: 'Influencer with a clear motive for clinical analytics' },
      { name: 'Sanjay Pillai', type: 'Internal', why: 'Can shape the reference architecture live' },
    ],
    channel: 'Workshop',
    rationale: 'The RFP is the largest priority opportunity, but only one decision maker is engaged and the checklist shows no confirmed champion.',
    sourceSections: ['opportunities', 'stakeholders', 'tactical'],
    atRisk: true,
    riskReason: 'Delivery slips on the portal are eroding CIO trust.',
  },
];

export const seedFindings: SecurityFinding[] = [
  { id: 'sf-1', at: daysAgo(1), severity: 'High', rule: 'AUTH-BRUTE-FORCE', detail: '7 failed sign-ins for arjun.am@kratos.demo from 203.0.113.24 within 10 minutes.', explanation: 'Pattern matches a password-guessing attempt. The account was rate limited after the fifth failure; no successful sign-in followed.', status: 'Open' },
  { id: 'sf-2', at: daysAgo(2), severity: 'Medium', rule: 'SCOPE-PROBE', detail: '12 denied reads of accounts outside scope by one AccountManager in 5 minutes.', explanation: 'Could be a bookmarked link after a reassignment, or deliberate probing. Worth a quick check with the user.', status: 'Open' },
  { id: 'sf-3', at: daysAgo(4), severity: 'Low', rule: 'EXPORT-VOLUME', detail: 'Executive pack exported 6 times in one hour.', explanation: 'Likely preparation for a board meeting. Within policy.', status: 'Acknowledged' },
  { id: 'sf-4', at: daysAgo(6), severity: 'Critical', rule: 'PROMPT-INJECTION', detail: 'Imported workbook cell S2!C14 contained instructions aimed at the AI mapper.', explanation: 'The text tried to make the mapper ignore validation. The mapper treated it as data, and the import was flagged. Review the source file with the account team.', status: 'Open' },
];

export function seedAudit(): AuditEntry[] {
  const rows: [number, string, string, string, AuditEntry['outcome']][] = [
    [0.02, 'priya.am@kratos.demo', 'Plan.Update', 'accounts/acc-solenne/opportunities', 'Success'],
    [0.05, 'exec@kratos.demo', 'Export.ExecutivePack', 'exports/executive-pack', 'Success'],
    [0.1, 'arjun.am@kratos.demo', 'Account.Read', 'accounts/acc-veridian', 'Denied'],
    [0.2, 'nbd.lead@kratos.demo', 'Version.Create', 'accounts/acc-tavira/versions', 'Success'],
    [0.4, 'arjun.am@kratos.demo', 'Auth.Login', 'auth/login', 'Failed'],
    [0.6, 'admin@kratos.demo', 'Master.Update', 'admin/master/offerings/of-sec', 'Success'],
    [0.9, 'priya.am@kratos.demo', 'Ai.NextBestAction', 'accounts/acc-halvorsen/ai/next-best-action', 'Success'],
    [1.3, 'ebd.lead@kratos.demo', 'Ai.RiskScan', 'ai/risk-scan', 'Success'],
    [2.1, 'priya.am@kratos.demo', 'Import.Commit', 'imports/imp-7f2a/commit', 'Success'],
    [3.0, 'arjun.am@kratos.demo', 'Account.Read', 'accounts/acc-solenne', 'Denied'],
  ];
  return rows.map(([d, userEmail, action, resource, outcome], i) => ({
    at: daysAgo(d),
    userEmail,
    action,
    resource,
    outcome,
    ip: `10.20.${4 + (i % 3)}.${31 + i * 7}`,
  }));
}

export const answerCycle: ChecklistAnswer[] = ['Yes', 'Partial', 'No'];
