// In-memory database for mock mode. Derives scores, completion and staleness the
// way the backend is expected to, so the demo behaves consistently.
import type {
  AccountPlan,
  AccountSummary,
  Action,
  AuditEntry,
  BrickwallRating,
  Infobase,
  Opportunity,
  Profile,
  Rating,
  Recommendation,
  Resource,
  RiskLevel,
  Scores,
  SectionKey,
  SectionState,
  SecurityFinding,
  Stakeholder,
  TacticalItem,
  TeamMember,
  Vision,
} from '../types';
import { SECTION_KEYS } from '../types';
import * as seed from './seed';
import { DAY, daysAgo, dateIn, type MockUser } from './seed';

export interface VersionRecord {
  number: number;
  createdAt: string;
  createdBy: string;
  changeSummary: string;
  scores: Scores;
  snapshot: Record<string, string>;
  sectionOf: Record<string, SectionKey>;
}

export interface AccountRecord {
  id: string;
  name: string;
  industry: string;
  region: string;
  type: 'NBD' | 'EBD';
  groupId: string;
  captainId: string;
  profile: Profile;
  team: Omit<TeamMember, 'displayName'>[];
  infobase: Infobase;
  stakeholders: Stakeholder[];
  vision: Vision;
  strategyIds: string[];
  opportunities: Omit<Opportunity, 'offeringName' | 'score'>[];
  brickwall: BrickwallRating[];
  tactical: TacticalItem[];
  resources: Resource[];
  touched: Record<SectionKey, string | null>;
  reviewedAt: string | null;
  rowVersion: number;
  versions: VersionRecord[];
}

export type ActionRecord = Omit<Action, 'accountName' | 'ownerName' | 'isOverdue'>;

export interface MockDb {
  users: MockUser[];
  groups: typeof seed.groups;
  offerings: typeof seed.offerings;
  strategies: typeof seed.strategies;
  brickwallCriteria: typeof seed.brickwallCriteria;
  checklistQuestions: typeof seed.checklistQuestions;
  scoringWeights: typeof seed.scoringWeights;
  accounts: AccountRecord[];
  actions: ActionRecord[];
  recommendations: Recommendation[];
  findings: SecurityFinding[];
  audit: AuditEntry[];
  imports: Map<string, { fileName: string; accountName: string | null }>;
  aiCalls: Record<string, { calls: number; inputTokens: number; outputTokens: number; failures: number }>;
  seq: number;
}

const SECTION_TITLES: Record<SectionKey, [string, string]> = {
  profile: ['S1', 'Know your customer'],
  infobase: ['S2', 'Information base'],
  vision: ['S3–S4', 'Vision & objectives'],
  strategy: ['S5', 'Strategic direction'],
  opportunities: ['S6', 'Opportunity matrix'],
  stakeholders: ['S7', 'Mapping the account'],
  brickwall: ['S8', 'Brickwall'],
  tactical: ['S9', 'Tactical checklist'],
  priorityActions: ['S10', 'Priority actions'],
  actionPlan: ['S11', 'Time-bound action plan'],
  resources: ['S12', 'Resources needed'],
};

export const sectionMeta = (key: SectionKey) => ({ code: SECTION_TITLES[key][0], title: SECTION_TITLES[key][1] });

// Deterministic pseudo-random numbers so the seed looks the same on every load.
function rng(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const toRating = (n: number) => clamp(Math.round(n), 1, 5) as Rating;
const pct = (n: number) => clamp(Math.round(n), 0, 100);
export const today = () => new Date().toISOString().slice(0, 10);

export function opportunityScore(o: { potential: number; effort: number; complexity: number }): number {
  return pct(((o.potential * 0.5 + (6 - o.effort) * 0.3 + (6 - o.complexity) * 0.2) / 5) * 100);
}

// ---------- Build ----------
export function buildDb(): MockDb {
  const db: MockDb = {
    users: structuredClone(seed.users),
    groups: structuredClone(seed.groups),
    offerings: structuredClone(seed.offerings),
    strategies: structuredClone(seed.strategies),
    brickwallCriteria: structuredClone(seed.brickwallCriteria),
    checklistQuestions: structuredClone(seed.checklistQuestions),
    scoringWeights: structuredClone(seed.scoringWeights),
    accounts: [],
    actions: [],
    recommendations: [],
    findings: structuredClone(seed.seedFindings),
    audit: seed.seedAudit(),
    imports: new Map(),
    aiCalls: {
      NextBestActionAgent: { calls: 46, inputTokens: 212_400, outputTokens: 31_800, failures: 1 },
      CopilotAgent: { calls: 88, inputTokens: 140_900, outputTokens: 52_300, failures: 0 },
      ImportMapperAgent: { calls: 14, inputTokens: 96_200, outputTokens: 18_100, failures: 1 },
      RiskScanAgent: { calls: 9, inputTokens: 61_000, outputTokens: 9_400, failures: 0 },
      ExecutiveBriefAgent: { calls: 6, inputTokens: 48_700, outputTokens: 11_200, failures: 0 },
      SecuritySentinel: { calls: 21, inputTokens: 39_800, outputTokens: 6_900, failures: 0 },
    },
    seq: 1000,
  };

  for (const spec of seed.accountSpecs) {
    const r = rng(spec.id);
    const rec: AccountRecord = {
      id: spec.id,
      name: spec.name,
      industry: spec.industry,
      region: spec.region,
      type: spec.type,
      groupId: spec.groupId,
      captainId: spec.captainId,
      profile: {
        accountSince: spec.accountSince,
        currentRunRate: spec.runRate,
        currency: 'USD',
        cxoConnect: spec.cxo,
        challenges: spec.challenges,
        currentOfferingIds: spec.current,
        aspirationalOfferingIds: spec.aspirational,
        reviewCadenceDays: spec.cadence,
      },
      team: spec.team,
      infobase: spec.infobase,
      stakeholders: spec.stakeholders.map((s, i) => ({
        id: `${spec.id}-sh-${i + 1}`,
        name: s.name,
        title: s.title,
        role: s.role,
        importance: s.importance,
        buyingMotive: s.motive,
        perception: s.perception,
        perceptionVsCompetitors: s.vsComp,
        knowledge: s.knowledge,
        notes: '',
      })),
      vision: { threeYear: spec.threeYear, oneYear: spec.oneYear, objectives: spec.objectives },
      strategyIds: spec.strategyIds,
      opportunities: spec.opportunities.map((o, i) => ({
        id: `${spec.id}-op-${i + 1}`,
        title: o.title,
        offeringId: o.offeringId,
        potential: o.p,
        effort: o.e,
        complexity: o.c,
        estimatedValue: o.value,
        isPriority: o.priority,
      })),
      brickwall: db.brickwallCriteria.map((c) => ({
        criterionId: c.id,
        score: spec.touched.brickwall === null ? null : toRating(1 + spec.strength * 4 + (r() - 0.5) * 2),
        note: '',
      })),
      tactical: spec.opportunities
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => o.priority)
        .map(({ i }) => ({
          opportunityId: `${spec.id}-op-${i + 1}`,
          answers: db.checklistQuestions.map((q) => {
            if (spec.touched.tactical === null) return { questionId: q.id, answer: null };
            const x = r();
            return {
              questionId: q.id,
              answer: x < spec.strength ? 'Yes' : x < spec.strength + 0.22 ? 'Partial' : x < 0.92 ? 'No' : null,
            };
          }),
        })),
      resources: spec.resources.map((res, i) => ({ id: `${spec.id}-rs-${i + 1}`, ...res })),
      touched: Object.fromEntries(
        SECTION_KEYS.map((k) => {
          const d = spec.touched[k];
          return [k, d === null || d === undefined ? null : daysAgo(d)];
        }),
      ) as Record<SectionKey, string | null>,
      reviewedAt: spec.reviewedDaysAgo === null ? null : daysAgo(spec.reviewedDaysAgo),
      rowVersion: 1,
      versions: [],
    };
    // Brickwall notes on the weakest criteria make the section feel lived in.
    rec.brickwall.forEach((b) => {
      if (b.score !== null && b.score <= 2) b.note = 'Needs a plan: raise in the next account review.';
    });
    db.accounts.push(rec);

    spec.actions.forEach((a) => {
      const id = `act-${++db.seq}`;
      const opp = a.opp !== undefined ? rec.opportunities[a.opp]?.id ?? null : null;
      db.actions.push({
        id,
        accountId: rec.id,
        title: a.title,
        sourceSection: a.section,
        opportunityId: opp,
        ownerId: a.owner,
        dueDate: dateIn(a.due),
        status: a.status,
        parentId: null,
        origin: a.origin ?? 'Manual',
        createdAt: daysAgo(Math.max(10, 20 - a.due)),
      });
      a.children?.forEach((c) =>
        db.actions.push({
          id: `act-${++db.seq}`,
          accountId: rec.id,
          title: c.title,
          sourceSection: 'actionPlan',
          opportunityId: opp,
          ownerId: c.owner,
          dueDate: dateIn(c.due),
          status: c.status,
          parentId: id,
          origin: 'Manual',
          createdAt: daysAgo(Math.max(8, 16 - c.due)),
        }),
      );
    });

    // Version history: older snapshots are progressively thinner copies of today's plan.
    const lastReview = spec.reviewedDaysAgo ?? 30;
    for (let n = 1; n <= spec.versions; n++) {
      const back = spec.versions - n;
      const aged = ageRecord(rec, back);
      const createdAt = new Date(Date.now() - (lastReview + back * 21) * DAY).toISOString();
      const flat = flatten(db, aged);
      rec.versions.unshift({
        number: n,
        createdAt,
        createdBy: userName(db, n % 2 === 0 ? spec.captainId : spec.team[spec.team.length - 1]?.userId ?? spec.captainId),
        changeSummary: VERSION_NOTES[(n + spec.id.length) % VERSION_NOTES.length],
        scores: computeScores(db, aged),
        snapshot: flat.values,
        sectionOf: flat.sections,
      });
    }
    rec.versions.sort((a, b) => b.number - a.number);
  }

  db.recommendations = seed.seedRecommendations.map((r) => ({ ...r, meta: aiMeta('NextBestActionAgent', 1840, 412, 14_200) }));
  return db;
}

const VERSION_NOTES = [
  'Quarterly account review',
  'Updated stakeholder map after the CIO meeting',
  'Re-scored opportunities with the delivery team',
  'Brickwall refresh before the pipeline review',
  'Added the tactical checklist for priority deals',
  'Initial plan from the KAM workbook',
];

function ageRecord(rec: AccountRecord, steps: number): AccountRecord {
  const a = structuredClone(rec);
  for (let s = 0; s < steps; s++) {
    if (a.stakeholders.length > 2) a.stakeholders.pop();
    if (a.vision.objectives.length > 1) a.vision.objectives.pop();
    a.brickwall = a.brickwall.map((b, i) => ((i + s) % 3 === 0 && b.score ? { ...b, score: toRating(b.score - 1) } : b));
    a.opportunities = a.opportunities.map((o, i) => (i === s % Math.max(1, a.opportunities.length) ? { ...o, potential: toRating(o.potential - 1) } : o));
    a.stakeholders = a.stakeholders.map((sh, i) => (i === 0 && sh.perception ? { ...sh, perception: toRating(sh.perception - (s % 2)) } : sh));
    a.tactical = a.tactical.map((t) => ({
      ...t,
      answers: t.answers.map((an, i) => (i % 3 === s % 3 && an.answer === 'Yes' ? { ...an, answer: 'Partial' as const } : an)),
    }));
    if (s === 1) a.vision.oneYear = a.vision.oneYear.split(/,| with | and /)[0].replace(/\.$/, '') + '.';
    if (a.resources.length > 1 && s === 2) a.resources.pop();
  }
  return a;
}

// ---------- Derivations ----------
export function userName(db: MockDb, id: string): string {
  return db.users.find((u) => u.id === id)?.displayName ?? 'Unknown user';
}

export function actionView(db: MockDb, a: ActionRecord): Action {
  const acc = db.accounts.find((x) => x.id === a.accountId);
  return {
    ...a,
    accountName: acc?.name ?? '',
    ownerName: userName(db, a.ownerId),
    isOverdue: a.status !== 'Done' && a.dueDate < today(),
  };
}

function accountActions(db: MockDb, rec: AccountRecord) {
  return db.actions.filter((a) => a.accountId === rec.id);
}

export function sectionCompletion(db: MockDb, rec: AccountRecord): Record<SectionKey, number> {
  const p = rec.profile;
  const frac = (checks: boolean[]) => pct((checks.filter(Boolean).length / checks.length) * 100);
  const priority = rec.opportunities.filter((o) => o.isPriority);
  const acts = accountActions(db, rec);
  const top = acts.filter((a) => !a.parentId);
  const activeQ = db.checklistQuestions.filter((q) => q.isActive).map((q) => q.id);
  const tacticalCells = priority.length * activeQ.length;
  const tacticalAnswered = rec.tactical
    .filter((t) => priority.some((o) => o.id === t.opportunityId))
    .reduce((n, t) => n + t.answers.filter((a) => a.answer !== null && activeQ.includes(a.questionId)).length, 0);
  const activeCriteria = db.brickwallCriteria.filter((c) => c.isActive).map((c) => c.id);
  return {
    profile: frac([
      !!p.cxoConnect.trim(),
      !!p.challenges.trim(),
      p.currentOfferingIds.length + p.aspirationalOfferingIds.length > 0,
      rec.team.length > 0,
      rec.type === 'NBD' || (p.accountSince !== null && p.currentRunRate !== null),
    ]),
    infobase: frac([!!rec.infobase.unknowns.trim(), !!rec.infobase.knownUnconfirmed.trim(), !!rec.infobase.growthLevers.trim()]),
    vision: frac([!!rec.vision.threeYear.trim(), !!rec.vision.oneYear.trim(), rec.vision.objectives.length > 0, rec.vision.objectives.length > 2]),
    strategy: rec.strategyIds.length >= 2 ? 100 : rec.strategyIds.length === 1 ? 60 : 0,
    opportunities: frac([rec.opportunities.length > 0, rec.opportunities.length > 1, priority.length > 0, rec.opportunities.every((o) => o.estimatedValue !== null)]),
    stakeholders: frac([
      rec.stakeholders.length >= 3,
      rec.stakeholders.some((s) => s.role === 'DecisionMaker'),
      rec.stakeholders.length > 0 && rec.stakeholders.every((s) => s.perception !== null),
      rec.stakeholders.some((s) => s.knowledge === 'Confirmed'),
    ]),
    brickwall: activeCriteria.length
      ? pct((rec.brickwall.filter((b) => b.score !== null && activeCriteria.includes(b.criterionId)).length / activeCriteria.length) * 100)
      : 0,
    tactical: tacticalCells ? pct((tacticalAnswered / tacticalCells) * 100) : 0,
    priorityActions: priority.length
      ? pct((priority.filter((o) => top.some((a) => a.opportunityId === o.id)).length / priority.length) * 100)
      : 0,
    actionPlan: top.length === 0 ? 0 : acts.some((a) => a.parentId) ? 100 : 60,
    resources: rec.resources.length >= 2 ? 100 : rec.resources.length === 1 ? 60 : 0,
  };
}

export function sectionStates(db: MockDb, rec: AccountRecord): SectionState[] {
  const comp = sectionCompletion(db, rec);
  const cadence = rec.profile.reviewCadenceDays * DAY;
  return SECTION_KEYS.map((key) => {
    const updatedAt = rec.touched[key];
    return {
      key,
      ...sectionMeta(key),
      completion: comp[key],
      updatedAt,
      isStale: updatedAt !== null && Date.now() - Date.parse(updatedAt) > cadence,
    };
  });
}

export function computeScores(db: MockDb, rec: AccountRecord): Scores {
  const priority = rec.opportunities.filter((o) => o.isPriority);
  const pool = priority.length ? priority : rec.opportunities;
  const opportunity = pool.length ? pct(pool.reduce((n, o) => n + opportunityScore(o), 0) / pool.length) : 0;

  const crit = db.brickwallCriteria.filter((c) => c.isActive);
  const bwMax = crit.reduce((n, c) => n + c.weight * 5, 0);
  const bwGot = crit.reduce((n, c) => n + c.weight * (rec.brickwall.find((b) => b.criterionId === c.id)?.score ?? 0), 0);
  const brickwall = bwMax ? pct((bwGot / bwMax) * 100) : 0;

  const W = { Essential: 3, Desirable: 2, Useful: 1 } as const;
  const qs = db.checklistQuestions.filter((q) => q.isActive);
  let clMax = 0;
  let clGot = 0;
  for (const o of priority) {
    const item = rec.tactical.find((t) => t.opportunityId === o.id);
    for (const q of qs) {
      clMax += W[q.weight];
      const ans = item?.answers.find((a) => a.questionId === q.id)?.answer;
      clGot += W[q.weight] * (ans === 'Yes' ? 1 : ans === 'Partial' ? 0.5 : 0);
    }
  }
  const checklist = clMax ? pct((clGot / clMax) * 100) : 0;

  const IW = { A: 3, B: 2, C: 1 } as const;
  const rated = rec.stakeholders.filter((s) => s.perception !== null);
  const pw = rated.reduce((n, s) => n + IW[s.importance], 0);
  const perception = pw ? pct((rated.reduce((n, s) => n + IW[s.importance] * (s.perception as number), 0) / (pw * 5)) * 100) : 0;

  const comp = sectionCompletion(db, rec);
  const completion = pct(Object.values(comp).reduce((a, b) => a + b, 0) / SECTION_KEYS.length);

  const parts: Record<string, number> = { opportunity, brickwall, checklist, perception, completion };
  const wSum = db.scoringWeights.reduce((n, w) => n + w.weight, 0) || 1;
  const health = pct(db.scoringWeights.reduce((n, w) => n + (parts[w.key] ?? 0) * w.weight, 0) / wSum);

  const reasons: string[] = [];
  const overdue = accountActions(db, rec).filter((a) => a.status !== 'Done' && a.dueDate < today()).length;
  const stale = sectionStates(db, rec).filter((s) => s.isStale).length;
  if (health < 50) reasons.push(`Health score is ${health}, below the 50 threshold`);
  if (overdue >= 2) reasons.push(`${overdue} actions are overdue`);
  if (stale >= 3) reasons.push(`${stale} sections are older than the ${rec.profile.reviewCadenceDays}-day review cadence`);
  const dm = rec.stakeholders.filter((s) => s.role === 'DecisionMaker');
  if (!dm.some((s) => (s.perception ?? 0) >= 4)) reasons.push('No decision maker currently perceives us strongly (4+)');
  if (rec.reviewedAt && Date.now() - Date.parse(rec.reviewedAt) > rec.profile.reviewCadenceDays * 2 * DAY)
    reasons.push(`Plan not reviewed for ${Math.round((Date.now() - Date.parse(rec.reviewedAt)) / DAY)} days`);
  if (checklist < 40 && priority.length) reasons.push(`Tactical readiness is ${checklist}% on priority opportunities`);

  const riskLevel: RiskLevel = health < 50 || reasons.length >= 3 ? 'High' : reasons.length >= 1 || health < 65 ? 'Medium' : 'Low';
  return { opportunity, brickwall, checklist, perception, completion, health, riskLevel, riskReasons: reasons };
}

export function summaryOf(db: MockDb, rec: AccountRecord): AccountSummary {
  const scores = computeScores(db, rec);
  const group = db.groups.find((g) => g.id === rec.groupId);
  return {
    id: rec.id,
    name: rec.name,
    industry: rec.industry,
    region: rec.region,
    type: rec.type,
    groupId: rec.groupId,
    groupName: group?.name ?? '',
    captainId: rec.captainId,
    captainName: userName(db, rec.captainId),
    health: scores.health,
    riskLevel: scores.riskLevel,
    completion: scores.completion,
    overdueActions: accountActions(db, rec).filter((a) => a.status !== 'Done' && a.dueDate < today()).length,
    staleSections: sectionStates(db, rec).filter((s) => s.isStale).length,
    lastReviewedAt: rec.reviewedAt,
    currentVersion: rec.versions[0]?.number ?? 0,
  };
}

export function planOf(db: MockDb, rec: AccountRecord, canEdit: boolean): AccountPlan {
  return structuredClone({
    summary: summaryOf(db, rec),
    rowVersion: `rv-${rec.id}-${rec.rowVersion}`,
    canEdit,
    sections: sectionStates(db, rec),
    profile: rec.profile,
    team: rec.team.map((t) => ({ ...t, displayName: userName(db, t.userId) })),
    infobase: rec.infobase,
    stakeholders: rec.stakeholders,
    vision: rec.vision,
    strategyIds: rec.strategyIds,
    opportunities: rec.opportunities.map((o) => ({
      ...o,
      offeringName: db.offerings.find((f) => f.id === o.offeringId)?.name ?? 'Unknown offering',
      score: opportunityScore(o),
    })),
    brickwall: rec.brickwall,
    tactical: rec.tactical,
    resources: rec.resources,
    actions: accountActions(db, rec).map((a) => actionView(db, a)),
    scores: computeScores(db, rec),
  });
}

/** Field-level flat view of a plan, used to diff versions. */
export function flatten(db: MockDb, rec: AccountRecord): { values: Record<string, string>; sections: Record<string, SectionKey> } {
  const values: Record<string, string> = {};
  const sections: Record<string, SectionKey> = {};
  const put = (section: SectionKey, field: string, v: unknown) => {
    const k = `${section}::${field}`;
    values[k] = v === null || v === undefined ? '' : String(v);
    sections[k] = section;
  };
  const off = (id: string) => db.offerings.find((o) => o.id === id)?.name ?? id;
  put('profile', 'CXO connect', rec.profile.cxoConnect);
  put('profile', 'Challenges', rec.profile.challenges);
  put('profile', 'Current offerings', rec.profile.currentOfferingIds.map(off).join(', '));
  put('profile', 'Aspirational offerings', rec.profile.aspirationalOfferingIds.map(off).join(', '));
  put('profile', 'Run rate (USD)', rec.profile.currentRunRate);
  put('infobase', 'Unknowns', rec.infobase.unknowns);
  put('infobase', 'Known but unconfirmed', rec.infobase.knownUnconfirmed);
  put('infobase', 'Growth levers', rec.infobase.growthLevers);
  put('vision', '3-year vision', rec.vision.threeYear);
  put('vision', '1-year vision', rec.vision.oneYear);
  put('vision', 'Objectives', rec.vision.objectives.join('; '));
  put('strategy', 'Strategies', rec.strategyIds.map((id) => db.strategies.find((s) => s.id === id)?.name ?? id).join(', '));
  rec.opportunities.forEach((o) =>
    put('opportunities', o.title, `P${o.potential} E${o.effort} C${o.complexity}${o.isPriority ? ', priority' : ''}`),
  );
  rec.stakeholders.forEach((s) =>
    put('stakeholders', s.name, `${s.role}, importance ${s.importance}, perception ${s.perception ?? '–'}`),
  );
  rec.brickwall.forEach((b) =>
    put('brickwall', db.brickwallCriteria.find((c) => c.id === b.criterionId)?.name ?? b.criterionId, b.score ?? '–'),
  );
  rec.resources.forEach((r) => put('resources', r.description, `${r.type}${r.amount !== null ? `, ${r.amount}` : ''}`));
  return { values, sections };
}

export function aiMeta(agent: string, inputTokens: number, outputTokens: number, latencyMs: number) {
  return { agent, provider: 'mock', model: 'kratos-mock-1', inputTokens, outputTokens, latencyMs, fallbackUsed: false };
}
