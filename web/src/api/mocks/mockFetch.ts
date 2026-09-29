// A fake `fetch` that implements docs/api-contract.md against the in-memory mock DB.
// Only loaded when VITE_USE_MOCKS=true (or --mode mock); never part of a real build's startup path.
import { API_BASE } from '../../lib/env';
import type {
  AccountPlan,
  ActionStatus,
  AiEvaluation,
  CreateAccountRequest,
  CreateActionRequest,
  CrossSellState,
  ImportReport,
  MasterKind,
  Recommendation,
  Role,
  SectionKey,
  UpdateActionRequest,
} from '../types';
import { ROLES } from '../types';
import {
  actionView,
  aiMeta,
  buildDb,
  computeScores,
  flatten,
  opportunityScore,
  planOf,
  sectionMeta,
  summaryOf,
  today,
  userName,
  type AccountRecord,
  type MockDb,
} from './db';
import { daysAgo, type MockUser } from './seed';

let db: MockDb | null = null;
const getDb = () => (db ??= buildDb());
export function resetMockDb(): void {
  db = null;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: Record<string, string[]>,
  ) {
    super(title);
  }
}

interface Ctx {
  method: string;
  path: string;
  params: string[];
  query: URLSearchParams;
  body: Record<string, unknown>;
  form: FormData | null;
  user: MockUser | null;
}
type Result = { status?: number; json?: unknown; blob?: { data: string; type: string; fileName: string } } | undefined;
type Handler = (c: Ctx) => Result | Promise<Result>;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo: number, hi: number) => lo + Math.random() * (hi - lo);
const ok = (json: unknown): Result => ({ status: 200, json });
const noContent: Result = { status: 204 };
const nextId = (prefix: string) => `${prefix}-${(++getDb().seq).toString(36)}`;

function requireUser(c: Ctx, ...roles: Role[]): MockUser {
  if (!c.user) throw new HttpError(401, 'Not signed in');
  if (roles.length && !roles.includes(c.user.role)) {
    throw new HttpError(403, 'Forbidden', `The ${c.user.role} role cannot do this.`);
  }
  return c.user;
}

function inScope(u: MockUser, rec: AccountRecord): boolean {
  switch (u.role) {
    case 'Admin':
    case 'Executive':
      return true;
    case 'GroupLead':
      return u.groupIds.includes(rec.groupId);
    case 'AccountManager':
      return rec.captainId === u.id || rec.team.some((t) => t.userId === u.id);
  }
}
const canEdit = (u: MockUser, rec: AccountRecord) =>
  (u.role === 'AccountManager' || u.role === 'GroupLead') && inScope(u, rec);

function visibleAccounts(u: MockUser) {
  return getDb().accounts.filter((a) => inScope(u, a));
}

/** Plan content: Admin gets 403, out-of-scope gets 404 (no existence leaks). */
function planAccount(c: Ctx, id: string): AccountRecord {
  const u = requireUser(c, 'Executive', 'GroupLead', 'AccountManager');
  const rec = getDb().accounts.find((a) => a.id === id);
  if (!rec || !inScope(u, rec)) throw new HttpError(404, 'Not found', 'No account with that id is visible to you.');
  return rec;
}

function editableAccount(c: Ctx, id: string, rowVersion?: unknown): AccountRecord {
  const rec = planAccount(c, id);
  if (!canEdit(c.user as MockUser, rec)) throw new HttpError(403, 'Forbidden', 'You can view this plan but not change it.');
  if (rowVersion !== undefined) {
    if (typeof rowVersion !== 'string' || !rowVersion)
      throw new HttpError(422, 'Validation failed', undefined, { rowVersion: ['rowVersion is required.'] });
    if (rowVersion !== `rv-${rec.id}-${rec.rowVersion}`)
      throw new HttpError(409, 'Conflict', 'This plan was changed by someone else since you opened it. Reload to see the latest version.');
  }
  return rec;
}

function touch(rec: AccountRecord, ...keys: SectionKey[]) {
  const now = new Date().toISOString();
  keys.forEach((k) => (rec.touched[k] = now));
  rec.rowVersion++;
}

const planResult = (c: Ctx, rec: AccountRecord) => ok(planOf(getDb(), rec, canEdit(c.user as MockUser, rec)));

function str(v: unknown, field: string, errors: Record<string, string[]>, required = true): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) errors[field] = [`${field} is required.`];
  return s;
}
function rating(v: unknown, field: string, errors: Record<string, string[]>) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) errors[field] = ['Must be a whole number from 1 to 5.'];
  return Math.max(1, Math.min(5, Math.round(n) || 1)) as 1 | 2 | 3 | 4 | 5;
}
function assertValid(errors: Record<string, string[]>) {
  if (Object.keys(errors).length) throw new HttpError(422, 'Validation failed', 'Some fields need attention.', errors);
}

// ---------- Routes ----------
const routes: [string, RegExp, Handler][] = [];
const route = (method: string, pattern: string, h: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:[a-zA-Z]+/g, '([^/]+)')}$`), h]);

const loginFailures = new Map<string, number[]>();

route('POST', '/auth/login', (c) => {
  const email = String(c.body.email ?? '').trim().toLowerCase();
  const password = String(c.body.password ?? '');
  const now = Date.now();
  const recent = (loginFailures.get(email) ?? []).filter((t) => now - t < 15 * 60_000);
  if (recent.length >= 5) throw new HttpError(429, 'Too many attempts', 'Too many failed sign-ins. Try again in 15 minutes.');
  const u = getDb().users.find((x) => x.email === email && x.isActive);
  // Mock mode accepts any non-empty password for the seeded users.
  if (!u || !password) {
    loginFailures.set(email, [...recent, now]);
    throw new HttpError(401, 'Sign-in failed', 'Email or password is incorrect.');
  }
  loginFailures.delete(email);
  const token = `mock.${btoa(u.id)}.${now.toString(36)}`;
  return ok({
    token,
    expiresAt: new Date(now + 8 * 3_600_000).toISOString(),
    user: { id: u.id, email: u.email, displayName: u.displayName, role: u.role, groupIds: u.groupIds },
  });
});

route('GET', '/auth/me', (c) => {
  const u = requireUser(c);
  return ok({ id: u.id, email: u.email, displayName: u.displayName, role: u.role, groupIds: u.groupIds });
});

route('GET', '/health', () =>
  ok({ status: 'ok', version: 'mock', db: 'ok', ai: { claude: 'missing', gemini: 'missing', groq: 'missing', ollama: 'missing' } }),
);

// ----- Master data -----
route('GET', '/master', (c) => {
  requireUser(c);
  const d = getDb();
  return ok({
    offerings: d.offerings,
    strategies: d.strategies,
    brickwallCriteria: d.brickwallCriteria,
    checklistQuestions: d.checklistQuestions,
    groups: d.groups.map((g) => ({ ...g, leadName: userName(d, g.leadUserId) })),
    scoringWeights: d.scoringWeights,
  });
});

const MASTER_KINDS: MasterKind[] = ['offerings', 'strategies', 'brickwallCriteria', 'checklistQuestions'];
function masterList(kind: string): { id: string }[] {
  if (!MASTER_KINDS.includes(kind as MasterKind)) throw new HttpError(404, 'Not found', `Unknown master data kind "${kind}".`);
  return getDb()[kind as MasterKind] as { id: string }[];
}
route('POST', '/admin/master/:kind', (c) => {
  requireUser(c, 'Admin');
  const list = masterList(c.params[0]);
  const errors: Record<string, string[]> = {};
  const label = c.params[0] === 'checklistQuestions' ? 'text' : 'name';
  str(c.body[label], label, errors);
  assertValid(errors);
  const item = { ...c.body, id: nextId(c.params[0].slice(0, 3)), isActive: c.body.isActive ?? true };
  list.push(item);
  return { status: 201, json: item };
});
route('PUT', '/admin/master/:kind/:id', (c) => {
  requireUser(c, 'Admin');
  const list = masterList(c.params[0]);
  const i = list.findIndex((x) => x.id === c.params[1]);
  if (i < 0) throw new HttpError(404, 'Not found');
  list[i] = { ...list[i], ...c.body, id: c.params[1] };
  return ok(list[i]);
});
route('PUT', '/admin/scoring-weights', (c) => {
  requireUser(c, 'Admin');
  const weights = (c.body.weights as { key: string; weight: number }[]) ?? [];
  const d = getDb();
  for (const w of weights) {
    const target = d.scoringWeights.find((x) => x.key === w.key);
    if (!target) throw new HttpError(422, 'Validation failed', `Unknown weight "${w.key}".`);
    if (!(w.weight >= 0 && w.weight <= 100)) throw new HttpError(422, 'Validation failed', 'Weights must be 0–100.');
    target.weight = w.weight;
  }
  return noContent;
});
route('GET', '/admin/users', (c) => {
  requireUser(c, 'Admin');
  return ok(getDb().users.map(({ title: _t, ...u }) => u));
});
route('POST', '/admin/users', (c) => {
  requireUser(c, 'Admin');
  const errors: Record<string, string[]> = {};
  const email = str(c.body.email, 'email', errors).toLowerCase();
  const displayName = str(c.body.displayName, 'displayName', errors);
  str(c.body.password, 'password', errors);
  const role = c.body.role as Role;
  if (!ROLES.includes(role)) errors.role = ['Choose a role.'];
  if (email && getDb().users.some((u) => u.email === email)) errors.email = ['A user with this email already exists.'];
  assertValid(errors);
  const u: MockUser = { id: nextId('u'), email, displayName, role, groupIds: [], isActive: true, title: '' };
  getDb().users.push(u);
  const { title: _t, ...out } = u;
  return { status: 201, json: out };
});
route('PUT', '/admin/users/:id', (c) => {
  const me = requireUser(c, 'Admin');
  const u = getDb().users.find((x) => x.id === c.params[0]);
  if (!u) throw new HttpError(404, 'Not found');
  if (u.id === me.id && c.body.isActive === false) throw new HttpError(422, 'Validation failed', 'You cannot deactivate yourself.');
  if (typeof c.body.displayName === 'string') u.displayName = c.body.displayName;
  if (ROLES.includes(c.body.role as Role)) u.role = c.body.role as Role;
  if (typeof c.body.isActive === 'boolean') u.isActive = c.body.isActive;
  const { title: _t, ...out } = u;
  return ok(out);
});
route('POST', '/admin/groups', (c) => {
  requireUser(c, 'Admin');
  const errors: Record<string, string[]> = {};
  const name = str(c.body.name, 'name', errors);
  const leadUserId = str(c.body.leadUserId, 'leadUserId', errors);
  assertValid(errors);
  const g = { id: nextId('g'), name, leadUserId, leadName: userName(getDb(), leadUserId) };
  getDb().groups.push(g);
  return { status: 201, json: g };
});
route('PUT', '/admin/groups/:id', (c) => {
  requireUser(c, 'Admin');
  const g = getDb().groups.find((x) => x.id === c.params[0]);
  if (!g) throw new HttpError(404, 'Not found');
  if (typeof c.body.name === 'string') g.name = c.body.name;
  if (typeof c.body.leadUserId === 'string') {
    g.leadUserId = c.body.leadUserId;
    g.leadName = userName(getDb(), g.leadUserId);
  }
  return ok(g);
});

// ----- Accounts -----
route('GET', '/accounts', (c) => {
  const u = requireUser(c);
  const type = c.query.get('type');
  const groupId = c.query.get('groupId');
  const search = (c.query.get('search') ?? '').toLowerCase();
  return ok(
    visibleAccounts(u)
      .filter((a) => (!type || a.type === type) && (!groupId || a.groupId === groupId))
      .filter((a) => !search || a.name.toLowerCase().includes(search) || a.industry.toLowerCase().includes(search))
      .map((a) => summaryOf(getDb(), a)),
  );
});

route('POST', '/accounts', (c) => {
  const u = requireUser(c, 'Admin', 'GroupLead');
  const b = c.body as unknown as CreateAccountRequest;
  const errors: Record<string, string[]> = {};
  str(b.name, 'name', errors);
  str(b.industry, 'industry', errors);
  str(b.region, 'region', errors);
  if (b.type !== 'NBD' && b.type !== 'EBD') errors.type = ['Choose NBD or EBD.'];
  if (!getDb().groups.some((g) => g.id === b.groupId)) errors.groupId = ['Choose a group.'];
  if (!getDb().users.some((x) => x.id === b.captainId)) errors.captainId = ['Choose a captain.'];
  assertValid(errors);
  if (u.role === 'GroupLead' && !u.groupIds.includes(b.groupId))
    throw new HttpError(403, 'Forbidden', 'Group leads can only create accounts in their own group.');
  const rec = blankAccount(b);
  getDb().accounts.push(rec);
  return { status: 201, json: summaryOf(getDb(), rec) };
});

function blankAccount(b: CreateAccountRequest, id = nextId('acc')): AccountRecord {
  const d = getDb();
  return {
    id,
    name: b.name.trim(),
    industry: b.industry.trim(),
    region: b.region.trim(),
    type: b.type,
    groupId: b.groupId,
    captainId: b.captainId,
    profile: {
      accountSince: null,
      currentRunRate: null,
      currency: 'USD',
      cxoConnect: '',
      challenges: '',
      currentOfferingIds: [],
      aspirationalOfferingIds: [],
      reviewCadenceDays: 30,
    },
    team: [{ userId: b.captainId, raci: 'A', responsibility: 'Account captain' }],
    infobase: { unknowns: '', knownUnconfirmed: '', growthLevers: '' },
    stakeholders: [],
    vision: { threeYear: '', oneYear: '', objectives: [] },
    strategyIds: [],
    opportunities: [],
    brickwall: d.brickwallCriteria.map((cr) => ({ criterionId: cr.id, score: null, note: '' })),
    tactical: [],
    resources: [],
    touched: Object.fromEntries(
      ['profile', 'infobase', 'vision', 'strategy', 'opportunities', 'stakeholders', 'brickwall', 'tactical', 'priorityActions', 'actionPlan', 'resources'].map((k) => [k, null]),
    ) as AccountRecord['touched'],
    reviewedAt: null,
    rowVersion: 1,
    versions: [],
  };
}

route('GET', '/accounts/:id', (c) => planResult(c, planAccount(c, c.params[0])));

route('PUT', '/accounts/:id/profile', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  const { rowVersion: _rv, ...p } = c.body;
  const cadence = Number(p.reviewCadenceDays);
  if (!(cadence >= 7 && cadence <= 180))
    throw new HttpError(422, 'Validation failed', undefined, { reviewCadenceDays: ['Review cadence must be 7–180 days.'] });
  rec.profile = { ...rec.profile, ...(p as Partial<AccountRecord['profile']>), currency: 'USD' };
  touch(rec, 'profile');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/team', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  const members = (c.body.members as AccountRecord['team']) ?? [];
  if (!members.some((m) => m.raci === 'A'))
    throw new HttpError(422, 'Validation failed', undefined, { members: ['At least one member must be Accountable (A).'] });
  rec.team = members.map((m) => ({ userId: m.userId, raci: m.raci, responsibility: m.responsibility ?? '' }));
  touch(rec, 'profile');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/infobase', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  rec.infobase = {
    unknowns: String(c.body.unknowns ?? ''),
    knownUnconfirmed: String(c.body.knownUnconfirmed ?? ''),
    growthLevers: String(c.body.growthLevers ?? ''),
  };
  touch(rec, 'infobase');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/vision', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  rec.vision = {
    threeYear: String(c.body.threeYear ?? ''),
    oneYear: String(c.body.oneYear ?? ''),
    objectives: ((c.body.objectives as string[]) ?? []).map((o) => o.trim()).filter(Boolean),
  };
  touch(rec, 'vision');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/strategies', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  rec.strategyIds = (c.body.strategyIds as string[]) ?? [];
  touch(rec, 'strategy');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/brickwall', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  rec.brickwall = (c.body.ratings as AccountRecord['brickwall']) ?? [];
  touch(rec, 'brickwall');
  return planResult(c, rec);
});
route('PUT', '/accounts/:id/tactical', (c) => {
  const rec = editableAccount(c, c.params[0], c.body.rowVersion);
  rec.tactical = (c.body.items as AccountRecord['tactical']) ?? [];
  touch(rec, 'tactical');
  return planResult(c, rec);
});

// Collections: stakeholders, opportunities, resources
function stakeholderFrom(body: Record<string, unknown>) {
  const errors: Record<string, string[]> = {};
  const name = str(body.name, 'name', errors);
  assertValid(errors);
  return {
    name,
    title: String(body.title ?? ''),
    role: (body.role as AccountRecord['stakeholders'][number]['role']) ?? 'Influencer',
    importance: (body.importance as 'A' | 'B' | 'C') ?? 'B',
    buyingMotive: String(body.buyingMotive ?? ''),
    perception: body.perception === null || body.perception === undefined ? null : rating(body.perception, 'perception', errors),
    perceptionVsCompetitors: String(body.perceptionVsCompetitors ?? ''),
    knowledge: (body.knowledge as 'Unknown' | 'KnownUnconfirmed' | 'Confirmed') ?? 'Unknown',
    notes: String(body.notes ?? ''),
  };
}
function opportunityFrom(body: Record<string, unknown>) {
  const errors: Record<string, string[]> = {};
  const title = str(body.title, 'title', errors);
  const offeringId = str(body.offeringId, 'offeringId', errors);
  const potential = rating(body.potential, 'potential', errors);
  const effort = rating(body.effort, 'effort', errors);
  const complexity = rating(body.complexity, 'complexity', errors);
  assertValid(errors);
  const value = body.estimatedValue === null || body.estimatedValue === '' || body.estimatedValue === undefined ? null : Number(body.estimatedValue);
  return { title, offeringId, potential, effort, complexity, estimatedValue: Number.isFinite(value) ? value : null, isPriority: !!body.isPriority };
}
function resourceFrom(body: Record<string, unknown>) {
  const errors: Record<string, string[]> = {};
  const description = str(body.description, 'description', errors);
  assertValid(errors);
  const amount = body.amount === null || body.amount === '' || body.amount === undefined ? null : Number(body.amount);
  return { type: (body.type as AccountRecord['resources'][number]['type']) ?? 'Expertise', description, amount: Number.isFinite(amount) ? amount : null };
}

const collections = {
  stakeholders: { section: 'stakeholders' as SectionKey, prefix: 'sh', from: stakeholderFrom },
  opportunities: { section: 'opportunities' as SectionKey, prefix: 'op', from: opportunityFrom },
  resources: { section: 'resources' as SectionKey, prefix: 'rs', from: resourceFrom },
};
for (const [name, cfg] of Object.entries(collections) as [keyof typeof collections, (typeof collections)[keyof typeof collections]][]) {
  route('POST', `/accounts/:id/${name}`, (c) => {
    const rec = editableAccount(c, c.params[0], c.body.rowVersion);
    const item = { id: nextId(cfg.prefix), ...cfg.from(c.body) };
    (rec[name] as { id: string }[]).push(item);
    if (name === 'opportunities' && (item as { isPriority?: boolean }).isPriority) syncTactical(rec);
    touch(rec, cfg.section);
    return planResult(c, rec);
  });
  route('PUT', `/accounts/:id/${name}/:sid`, (c) => {
    const rec = editableAccount(c, c.params[0], c.body.rowVersion);
    const list = rec[name] as { id: string }[];
    const i = list.findIndex((x) => x.id === c.params[1]);
    if (i < 0) throw new HttpError(404, 'Not found');
    list[i] = { id: c.params[1], ...cfg.from(c.body) };
    if (name === 'opportunities') syncTactical(rec);
    touch(rec, cfg.section);
    return planResult(c, rec);
  });
  route('DELETE', `/accounts/:id/${name}/:sid`, (c) => {
    const rec = editableAccount(c, c.params[0], c.query.get('rowVersion') ?? undefined);
    const list = rec[name] as { id: string }[];
    const i = list.findIndex((x) => x.id === c.params[1]);
    if (i < 0) throw new HttpError(404, 'Not found');
    list.splice(i, 1);
    if (name === 'opportunities') syncTactical(rec);
    touch(rec, cfg.section);
    return planResult(c, rec);
  });
}

/** Keep one tactical checklist per priority opportunity. */
function syncTactical(rec: AccountRecord) {
  const d = getDb();
  rec.tactical = rec.opportunities
    .filter((o) => o.isPriority)
    .map(
      (o) =>
        rec.tactical.find((t) => t.opportunityId === o.id) ?? {
          opportunityId: o.id,
          answers: d.checklistQuestions.map((q) => ({ questionId: q.id, answer: null })),
        },
    );
}

// ----- Versions -----
route('POST', '/accounts/:id/versions', (c) => {
  const rec = editableAccount(c, c.params[0]);
  const summary = String(c.body.changeSummary ?? '').trim();
  if (!summary) throw new HttpError(422, 'Validation failed', undefined, { changeSummary: ['Describe what changed.'] });
  const d = getDb();
  const flat = flatten(d, rec);
  const v = {
    number: (rec.versions[0]?.number ?? 0) + 1,
    createdAt: new Date().toISOString(),
    createdBy: (c.user as MockUser).displayName,
    changeSummary: summary.slice(0, 500),
    scores: computeScores(d, rec),
    snapshot: flat.values,
    sectionOf: flat.sections,
  };
  rec.versions.unshift(v);
  rec.reviewedAt = v.createdAt;
  rec.rowVersion++;
  return { status: 201, json: { number: v.number, createdAt: v.createdAt, createdBy: v.createdBy, changeSummary: v.changeSummary, scores: v.scores } };
});
route('GET', '/accounts/:id/versions', (c) => {
  const rec = planAccount(c, c.params[0]);
  return ok(rec.versions.map(({ snapshot: _s, sectionOf: _o, ...v }) => v));
});
route('GET', '/accounts/:id/versions/:n/diff', (c) => {
  const rec = planAccount(c, c.params[0]);
  const a = rec.versions.find((v) => v.number === Number(c.params[1]));
  const b = rec.versions.find((v) => v.number === Number(c.query.get('against')));
  if (!a || !b) throw new HttpError(404, 'Not found', 'Version not found.');
  const keys = new Set([...Object.keys(a.snapshot), ...Object.keys(b.snapshot)]);
  const changes = [...keys]
    .filter((k) => (a.snapshot[k] ?? '') !== (b.snapshot[k] ?? ''))
    .map((k) => ({
      section: a.sectionOf[k] ?? b.sectionOf[k],
      field: k.split('::')[1],
      before: b.snapshot[k] ?? '',
      after: a.snapshot[k] ?? '',
    }));
  return ok({ changes });
});
route('GET', '/accounts/:id/scores/trend', (c) => {
  const rec = planAccount(c, c.params[0]);
  return ok({
    points: [...rec.versions]
      .sort((x, y) => x.number - y.number)
      .map((v) => ({
        version: v.number,
        date: v.createdAt.slice(0, 10),
        health: v.scores.health,
        opportunity: v.scores.opportunity,
        brickwall: v.scores.brickwall,
        checklist: v.scores.checklist,
        perception: v.scores.perception,
      })),
  });
});

// ----- Actions -----
route('GET', '/actions', (c) => {
  const u = requireUser(c, 'Executive', 'GroupLead', 'AccountManager');
  const d = getDb();
  const scope = new Set(visibleAccounts(u).map((a) => a.id));
  const accountId = c.query.get('accountId');
  const status = c.query.get('status');
  const mine = c.query.get('mine') === 'true';
  const overdue = c.query.get('overdue') === 'true';
  return ok(
    d.actions
      .filter((a) => scope.has(a.accountId))
      .filter((a) => !accountId || a.accountId === accountId)
      .filter((a) => !status || a.status === status)
      .filter((a) => !mine || a.ownerId === u.id)
      .map((a) => actionView(d, a))
      .filter((a) => !overdue || a.isOverdue)
      .sort((x, y) => x.dueDate.localeCompare(y.dueDate)),
  );
});
route('POST', '/accounts/:id/actions', (c) => {
  const rec = editableAccount(c, c.params[0]);
  const b = c.body as unknown as CreateActionRequest;
  const errors: Record<string, string[]> = {};
  str(b.title, 'title', errors);
  if (!b.dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) errors.dueDate = ['Pick a due date.'];
  if (!getDb().users.some((u) => u.id === b.ownerId)) errors.ownerId = ['Pick an owner.'];
  assertValid(errors);
  const d = getDb();
  if (b.parentId && !d.actions.some((a) => a.id === b.parentId && a.accountId === rec.id))
    throw new HttpError(422, 'Validation failed', 'Parent action not found on this account.');
  const a = {
    id: nextId('act'),
    accountId: rec.id,
    title: b.title.trim(),
    sourceSection: b.sourceSection ?? 'actionPlan',
    opportunityId: b.opportunityId ?? null,
    ownerId: b.ownerId,
    dueDate: b.dueDate,
    status: 'Open' as ActionStatus,
    parentId: b.parentId ?? null,
    origin: 'Manual' as const,
    createdAt: new Date().toISOString(),
  };
  d.actions.push(a);
  touch(rec, a.parentId ? 'actionPlan' : 'priorityActions');
  return { status: 201, json: actionView(d, a) };
});
route('PATCH', '/actions/:id', (c) => {
  const d = getDb();
  const a = d.actions.find((x) => x.id === c.params[0]);
  if (!a) throw new HttpError(404, 'Not found');
  const rec = editableAccount(c, a.accountId);
  const b = c.body as UpdateActionRequest;
  if (b.status) a.status = b.status;
  if (b.dueDate) a.dueDate = b.dueDate;
  if (b.ownerId) a.ownerId = b.ownerId;
  if (b.title?.trim()) a.title = b.title.trim();
  touch(rec, 'actionPlan');
  return ok(actionView(d, a));
});

// ----- Views -----
route('GET', '/views/mac', (c) => {
  const u = requireUser(c, 'Executive', 'GroupLead', 'AccountManager');
  const d = getDb();
  const accounts = visibleAccounts(u).map((a) => summaryOf(d, a));
  const byGroup = new Map<string, number[]>();
  accounts.forEach((a) => byGroup.set(a.groupName, [...(byGroup.get(a.groupName) ?? []), a.health]));
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : 0);
  return ok({
    totals: {
      accounts: accounts.length,
      atRisk: accounts.filter((a) => a.riskLevel === 'High').length,
      overdueActions: accounts.reduce((n, a) => n + a.overdueActions, 0),
      avgHealth: avg(accounts.map((a) => a.health)),
    },
    accounts,
    healthByGroup: [...byGroup.entries()].map(([groupName, hs]) => ({ groupName, avgHealth: avg(hs) })),
  });
});
route('GET', '/views/nbd', (c) => {
  const u = requireUser(c, 'Executive', 'GroupLead', 'AccountManager');
  const d = getDb();
  return ok({
    accounts: visibleAccounts(u)
      .filter((a) => a.type === 'NBD')
      .map((a) => {
        const plan = planOf(d, a, false);
        const s = plan.scores;
        return {
          ...plan.summary,
          readiness: Math.round(s.checklist * 0.45 + s.brickwall * 0.35 + s.completion * 0.2),
          topOpportunities: [...plan.opportunities].sort((x, y) => y.score - x.score).slice(0, 3),
        };
      }),
  });
});
route('GET', '/views/ebd', (c) => {
  const u = requireUser(c, 'Executive', 'GroupLead', 'AccountManager');
  const d = getDb();
  const offerings = d.offerings.filter((o) => o.isActive).map(({ id, name }) => ({ id, name }));
  return ok({
    offerings,
    rows: visibleAccounts(u)
      .filter((a) => a.type === 'EBD')
      .map((a) => ({
        accountId: a.id,
        accountName: a.name,
        relationship: computeScores(d, a).perception,
        cells: offerings.map((o) => {
          let state: CrossSellState = 'None';
          if (a.profile.currentOfferingIds.includes(o.id)) state = 'Current';
          else if (a.opportunities.some((op) => op.offeringId === o.id)) state = 'Opportunity';
          else if (a.profile.aspirationalOfferingIds.includes(o.id)) state = 'Aspirational';
          return { offeringId: o.id, state };
        }),
      })),
  });
});

// ----- AI -----
function trackAi(agent: string, inp: number, out: number) {
  const d = getDb();
  const row = (d.aiCalls[agent] ??= { calls: 0, inputTokens: 0, outputTokens: 0, failures: 0 });
  row.calls++;
  row.inputTokens += inp;
  row.outputTokens += out;
}

route('POST', '/accounts/:id/ai/next-best-action', async (c) => {
  const rec = editableAccount(c, c.params[0]);
  const started = Date.now();
  await wait(jitter(2600, 4200));
  const d = getDb();
  const plan = planOf(d, rec, true);
  const s = plan.scores;
  const prev = d.recommendations.filter((r) => r.accountId === rec.id).length;
  const priority = plan.opportunities.filter((o) => o.isPriority).sort((a, b) => b.score - a.score);
  const topOpp = priority[0] ?? plan.opportunities[0];
  const dms = plan.stakeholders.filter((x) => x.role === 'DecisionMaker').sort((a, b) => (a.perception ?? 0) - (b.perception ?? 0));
  const weakDm = dms[0];
  const champion = [...plan.stakeholders].sort((a, b) => (b.perception ?? 0) - (a.perception ?? 0))[0];
  const internal = plan.team.find((t) => t.userId !== rec.captainId) ?? plan.team[0];
  const overdue = plan.actions.filter((a) => a.isOverdue);
  const weakBw = plan.brickwall
    .filter((b) => b.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const weakBwName = d.brickwallCriteria.find((x) => x.id === weakBw?.criterionId)?.name.toLowerCase();

  type Draft = Pick<Recommendation, 'action' | 'channel' | 'rationale' | 'sourceSections' | 'whoseHelp'>;
  const candidates: [number, Draft][] = [];
  if (weakDm)
    candidates.push([
      100 - s.perception,
      {
        action: `Set up an executive connect between ${weakDm.name} (${weakDm.title}) and a Psiog leader to test the value case for ${topOpp?.title ?? 'the priority opportunity'}.`,
        channel: 'ExecutiveConnect',
        rationale: `${weakDm.name} is a decision maker with ${weakDm.perception === null ? 'no recorded perception' : `a perception of ${weakDm.perception}/5`}. Stakeholder perception is ${s.perception}/100, the weakest input to health right now.`,
        sourceSections: ['stakeholders', 'opportunities'],
        whoseHelp: [
          ...(champion && champion.id !== weakDm.id ? [{ name: champion.name, type: 'CustomerStakeholder' as const, why: `Rates us ${champion.perception ?? '–'}/5 and can broker the introduction` }] : []),
          ...(internal ? [{ name: internal.displayName, type: 'Internal' as const, why: internal.responsibility || 'On the account team' }] : []),
        ],
      },
    ]);
  if (topOpp)
    candidates.push([
      100 - s.checklist,
      {
        action: `Run a qualification workshop on "${topOpp.title}" to close the open Essential checklist questions (budget, decision process).`,
        channel: 'Workshop',
        rationale: `Tactical readiness is ${s.checklist}/100 on priority opportunities. "${topOpp.title}" carries the highest opportunity score (${topOpp.score}) but its Essential questions are not all answered Yes.`,
        sourceSections: ['tactical', 'opportunities'],
        whoseHelp: [
          ...(champion ? [{ name: champion.name, type: 'CustomerStakeholder' as const, why: 'Most positive stakeholder; can confirm the decision process' }] : []),
          ...(internal ? [{ name: internal.displayName, type: 'Internal' as const, why: 'Can shape the solution scope in the room' }] : []),
        ],
      },
    ]);
  if (weakBw && weakBwName)
    candidates.push([
      100 - s.brickwall,
      {
        action: `Address the brickwall on ${weakBwName}: agree a mitigation with the account team and take it to the customer in a short meeting.`,
        channel: 'Meeting',
        rationale: `Brickwall strength is ${s.brickwall}/100 and "${weakBwName}" is rated ${weakBw.score}/5, the lowest criterion.`,
        sourceSections: ['brickwall', 'strategy'],
        whoseHelp: internal ? [{ name: internal.displayName, type: 'Internal', why: 'Owns delivery credibility with the customer' }] : [],
      },
    ]);
  if (overdue.length)
    candidates.push([
      60 + overdue.length * 10,
      {
        action: `Call the owners of the ${overdue.length} overdue action${overdue.length > 1 ? 's' : ''} and re-commit dates, starting with "${overdue[0].title}".`,
        channel: 'Call',
        rationale: `${overdue.length} action${overdue.length > 1 ? 's are' : ' is'} past due. Overdue actions lower confidence in the plan and feed the risk score.`,
        sourceSections: ['actionPlan', 'priorityActions'],
        whoseHelp: [{ name: overdue[0].ownerName, type: 'Internal', why: 'Owner of the oldest overdue action' }],
      },
    ]);
  if (!candidates.length)
    candidates.push([
      1,
      {
        action: 'Complete the stakeholder map and opportunity matrix so the plan has enough signal for a recommendation.',
        channel: 'Meeting',
        rationale: `Plan completeness is ${s.completion}%. There is not enough detail yet to recommend a sharper action.`,
        sourceSections: ['stakeholders', 'opportunities'],
        whoseHelp: [],
      },
    ]);
  candidates.sort((a, b) => b[0] - a[0]);
  const pick = candidates[prev % candidates.length][1];
  const inp = 3200 + Math.round(Math.random() * 900);
  const out = 380 + Math.round(Math.random() * 160);
  trackAi('NextBestActionAgent', inp, out);
  const rec2: Recommendation = {
    id: nextId('rec'),
    accountId: rec.id,
    createdAt: new Date().toISOString(),
    status: 'New',
    ...pick,
    atRisk: s.riskLevel === 'High',
    riskReason: s.riskLevel === 'High' ? s.riskReasons[0] ?? null : null,
    meta: aiMeta('NextBestActionAgent', inp, out, Date.now() - started),
  };
  d.recommendations.unshift(rec2);
  return ok(rec2);
});
route('GET', '/accounts/:id/ai/recommendations', (c) => {
  const rec = planAccount(c, c.params[0]);
  return ok(getDb().recommendations.filter((r) => r.accountId === rec.id));
});
route('POST', '/ai/recommendations/:rid/accept', (c) => {
  const d = getDb();
  const r = d.recommendations.find((x) => x.id === c.params[0]);
  if (!r) throw new HttpError(404, 'Not found');
  const rec = editableAccount(c, r.accountId);
  if (r.status !== 'New') throw new HttpError(409, 'Conflict', 'This recommendation was already handled.');
  const errors: Record<string, string[]> = {};
  const ownerId = str(c.body.ownerId, 'ownerId', errors);
  const dueDate = str(c.body.dueDate, 'dueDate', errors);
  assertValid(errors);
  r.status = 'Accepted';
  const a = {
    id: nextId('act'),
    accountId: rec.id,
    title: r.action,
    sourceSection: r.sourceSections[0] ?? 'priorityActions',
    opportunityId: null,
    ownerId,
    dueDate,
    status: 'Open' as ActionStatus,
    parentId: null,
    origin: 'AiNextBestAction' as const,
    createdAt: new Date().toISOString(),
  };
  d.actions.push(a);
  touch(rec, 'priorityActions');
  return { status: 201, json: actionView(d, a) };
});
route('POST', '/ai/recommendations/:rid/dismiss', (c) => {
  const r = getDb().recommendations.find((x) => x.id === c.params[0]);
  if (!r) throw new HttpError(404, 'Not found');
  editableAccount(c, r.accountId);
  if (!String(c.body.reason ?? '').trim()) throw new HttpError(422, 'Validation failed', undefined, { reason: ['Give a reason.'] });
  r.status = 'Dismissed';
  return noContent;
});

route('POST', '/accounts/:id/ai/copilot', async (c) => {
  const rec = editableAccount(c, c.params[0]);
  const started = Date.now();
  await wait(jitter(1500, 2600));
  const section = c.body.section as SectionKey;
  const instruction = String(c.body.instruction ?? '').trim();
  const d = getDb();
  const plan = planOf(d, rec, true);
  const topOpp = [...plan.opportunities].sort((a, b) => b.score - a.score)[0];
  const dm = plan.stakeholders.find((s) => s.role === 'DecisionMaker');
  const off = (ids: string[]) => ids.map((id) => d.offerings.find((o) => o.id === id)?.name).filter(Boolean).join(', ');
  const lines: Record<string, string> = {
    vision: `Within three years, ${rec.name} relies on Psiog as its partner for ${off(rec.profile.aspirationalOfferingIds) || 'its digital roadmap'}, with a run-rate that reflects a strategic relationship rather than project work.\n\nIn the next 12 months we will prove it by delivering ${topOpp ? `"${topOpp.title}"` : 'a first priority engagement'} with a measurable business outcome${dm ? ` that ${dm.name} can present to the board` : ''}.`,
    infobase: `Unknowns to close next:\n- Who owns the budget for ${topOpp?.title ?? 'the priority opportunity'}\n- How ${dm?.name ?? 'the decision makers'} will judge success\n- Which competitors are already briefed\n\nKnown but unconfirmed, to verify in the next meeting:\n- Timelines mentioned informally by the account team`,
    profile: `Key challenges in the customer's words:\n- ${rec.profile.challenges.split('\n')[0] || 'Growth targets outpacing internal delivery capacity'}\n- Pressure to show results within the fiscal year\n\nWhat this means for us: lead with a short, outcome-based engagement, not a capability pitch.`,
  };
  const suggestion =
    (lines[section] ?? `Draft for ${sectionMeta(section).title}:\n- Summarise the current position in two sentences\n- List the two decisions needed from the customer\n- Name one action for this month`) +
    (instruction ? `\n\n(Drafted for: "${instruction.slice(0, 120)}")` : '');
  const inp = 1900 + Math.round(Math.random() * 600);
  const out = 220 + Math.round(Math.random() * 120);
  trackAi('CopilotAgent', inp, out);
  return ok({ suggestion, meta: aiMeta('CopilotAgent', inp, out, Date.now() - started) });
});

route('POST', '/ai/risk-scan', async (c) => {
  const u = requireUser(c, 'Executive', 'GroupLead');
  const started = Date.now();
  await wait(jitter(1800, 2800));
  const d = getDb();
  const accounts = visibleAccounts(u)
    .map((a) => ({ a, s: computeScores(d, a) }))
    .sort((x, y) => x.s.health - y.s.health)
    .map(({ a, s }) => ({
      accountId: a.id,
      accountName: a.name,
      riskLevel: s.riskLevel,
      drivers: s.riskReasons.slice(0, 3),
      explanation:
        s.riskLevel === 'Low'
          ? `Healthy at ${s.health}. Keep the review cadence and watch perception.`
          : `Health ${s.health}. ${s.riskReasons[0] ?? 'Signals are mixed'}. Focus the next review on ${s.perception < s.checklist ? 'decision-maker relationships' : 'qualifying priority opportunities'}.`,
    }));
  trackAi('RiskScanAgent', 5400, 820);
  return ok({ accounts, meta: aiMeta('RiskScanAgent', 5400, 820, Date.now() - started) });
});

route('GET', '/ai/executive-brief', async (c) => {
  requireUser(c, 'Executive');
  const started = Date.now();
  await wait(jitter(1400, 2200));
  const d = getDb();
  const all = d.accounts.map((a) => ({ a, sum: summaryOf(d, a), s: computeScores(d, a) }));
  const high = all.filter((x) => x.s.riskLevel === 'High');
  const strong = [...all].sort((x, y) => y.s.health - x.s.health).slice(0, 2);
  const pipeline = d.accounts.flatMap((a) => a.opportunities.filter((o) => o.isPriority).map((o) => ({ a, o })));
  const value = pipeline.reduce((n, x) => n + (x.o.estimatedValue ?? 0), 0);
  const overdue = all.reduce((n, x) => n + x.sum.overdueActions, 0);
  trackAi('ExecutiveBriefAgent', 7800, 1250);
  return ok({
    generatedAt: new Date().toISOString(),
    headline: `${high.length} of ${all.length} key accounts are at high risk; priority pipeline stands at USD ${(value / 1e6).toFixed(1)}M.`,
    sections: [
      {
        title: 'Accounts needing leadership attention',
        body: high.length
          ? high.map((x) => `${x.a.name}: health ${x.s.health}. ${x.s.riskReasons[0] ?? ''}`).join('\n')
          : 'No account is at high risk this week.',
        accountIds: high.map((x) => x.a.id),
      },
      {
        title: 'Where momentum is strongest',
        body: strong.map((x) => `${x.a.name} leads the portfolio at health ${x.s.health}, with stakeholder perception at ${x.s.perception}.`).join('\n'),
        accountIds: strong.map((x) => x.a.id),
      },
      {
        title: 'Priority pipeline',
        body: `${pipeline.length} priority opportunities worth USD ${(value / 1e6).toFixed(1)}M. The largest is "${[...pipeline].sort((x, y) => (y.o.estimatedValue ?? 0) - (x.o.estimatedValue ?? 0))[0]?.o.title ?? '–'}".`,
        accountIds: [...new Set(pipeline.map((x) => x.a.id))].slice(0, 4),
      },
      {
        title: 'Execution discipline',
        body: `${overdue} actions are overdue across the portfolio. ${all.filter((x) => x.sum.staleSections >= 3).length} plans have three or more stale sections; ask captains to review before the next pipeline call.`,
        accountIds: all.filter((x) => x.sum.overdueActions >= 2).map((x) => x.a.id),
      },
    ],
    meta: aiMeta('ExecutiveBriefAgent', 7800, 1250, Date.now() - started),
  });
});

route('GET', '/ai/usage', (c) => {
  requireUser(c, 'Admin', 'Executive');
  const d = getDb();
  const byAgent = Object.entries(d.aiCalls).map(([agent, v]) => ({ agent, ...v }));
  return ok({ byAgent, budgetTokens: 2_000_000, usedTokens: byAgent.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0) });
});
const evaluationRows = (): AiEvaluation[] => [
    { agent: 'NextBestActionAgent', score: 0.86, passed: true, notes: '24/28 golden cases grounded in the cited sections.', at: daysAgo(1) },
    { agent: 'CopilotAgent', score: 0.91, passed: true, notes: 'No fabricated names across 40 prompts.', at: daysAgo(1) },
    { agent: 'ImportMapperAgent', score: 0.74, passed: false, notes: 'Misses merged-cell headers in S8; below the 0.80 bar.', at: daysAgo(2) },
    { agent: 'RiskScanAgent', score: 0.88, passed: true, notes: 'Agrees with the rule-based risk level on 22/25 accounts.', at: daysAgo(3) },
    { agent: 'SecuritySentinel', score: 0.95, passed: true, notes: 'Flagged all 12 seeded injection strings.', at: daysAgo(3) },
];
route('GET', '/ai/evaluations', (c) => {
  requireUser(c, 'Admin');
  return ok(evaluationRows());
});
route('POST', '/ai/evaluations/run', async (c) => {
  requireUser(c, 'Admin');
  await wait(jitter(1500, 2500));
  const now = new Date().toISOString();
  return ok(evaluationRows().map((r) => ({ ...r, at: now })));
});

// ----- Import / export -----
route('POST', '/imports', async (c) => {
  const u = requireUser(c, 'GroupLead', 'AccountManager');
  const file = c.form?.get('file');
  if (!(file instanceof File)) throw new HttpError(422, 'Validation failed', undefined, { file: ['Attach an .xlsx file.'] });
  if (!/\.xlsx$/i.test(file.name)) throw new HttpError(422, 'Validation failed', undefined, { file: ['Only .xlsx files are accepted.'] });
  if (file.size > 10 * 1024 * 1024) throw new HttpError(413, 'File too large', 'The limit is 10 MB.');
  const started = Date.now();
  await wait(jitter(1800, 3000));
  const base = file.name.replace(/\.xlsx$/i, '').replace(/[_-]+/g, ' ').replace(/\b(kam|plan|workbook|v\d+)\b/gi, '').trim();
  const accountName = base ? base.replace(/\b\w/g, (m) => m.toUpperCase()) : null;
  const broken = /invalid|broken|bad/i.test(file.name);
  const importId = nextId('imp');
  getDb().imports.set(importId, { fileName: file.name, accountName });
  const report: ImportReport = {
    importId,
    fileName: file.name,
    sheetsFound: ['KYC', 'S2 Info Base', 'S3 3 year vision', 'S4 objectives', 'S5 Strategic Direction', 'S6 Opportunity Matrix', 'S7 Mapping the account', 'S8 Brickwall', 'S9 Tactical Checklist', 'S10 Priority actions', 'S11 Time bound action plan', ...(broken ? [] : ['S12 Resources Needed'])],
    accountName,
    findings: [
      ...(broken
        ? [
            { severity: 'Error' as const, sheet: 'KYC', cell: 'B3', message: 'Account name is empty.' },
            { severity: 'Error' as const, sheet: 'S12 Resources Needed', cell: null, message: 'Sheet is missing.' },
          ]
        : []),
      { severity: 'Warning', sheet: 'S6 Opportunity Matrix', cell: 'E9', message: 'Effort value "6" is outside 1–5; clamped to 5.' },
      { severity: 'Warning', sheet: 'S7 Mapping the account', cell: 'D12', message: 'Stakeholder role "Sponsor" mapped to DecisionMaker.' },
      { severity: 'Info', sheet: 'S8 Brickwall', cell: null, message: '2 criteria not in master data were skipped.' },
      { severity: 'Info', sheet: 'S11 Time bound action plan', cell: null, message: '4 sub-actions linked to their parent by row indentation.' },
    ],
    mapped: [
      { section: 'profile', fields: 9, confidence: 0.96 },
      { section: 'infobase', fields: 3, confidence: 0.91 },
      { section: 'vision', fields: 5, confidence: 0.88 },
      { section: 'strategy', fields: 3, confidence: 0.82 },
      { section: 'opportunities', fields: 12, confidence: 0.93 },
      { section: 'stakeholders', fields: 18, confidence: 0.79 },
      { section: 'brickwall', fields: 7, confidence: 0.71 },
      { section: 'tactical', fields: 16, confidence: 0.86 },
      { section: 'priorityActions', fields: 4, confidence: 0.9 },
      { section: 'actionPlan', fields: 9, confidence: 0.77 },
      ...(broken ? [] : [{ section: 'resources' as SectionKey, fields: 4, confidence: 0.94 }]),
    ],
    canCommit: !broken && u.groupIds.length > 0,
    meta: aiMeta('ImportMapperAgent', 6100, 940, Date.now() - started),
  };
  trackAi('ImportMapperAgent', 6100, 940);
  return ok(report);
});
route('POST', '/imports/:id/commit', (c) => {
  const u = requireUser(c, 'GroupLead', 'AccountManager');
  const imp = getDb().imports.get(c.params[0]);
  if (!imp) throw new HttpError(404, 'Not found', 'Import not found or expired.');
  const accountId = c.body.accountId as string | undefined;
  let rec: AccountRecord;
  if (accountId) {
    rec = editableAccount(c, accountId);
    touch(rec, 'profile', 'infobase', 'opportunities');
  } else {
    const groupId = u.groupIds[0] ?? getDb().groups[0].id;
    rec = blankAccount({ name: imp.accountName ?? 'Imported account', industry: 'To be confirmed', region: 'To be confirmed', type: 'NBD', groupId, captainId: u.id });
    rec.profile.cxoConnect = 'Imported from workbook: confirm with the account team.';
    rec.profile.challenges = 'Imported from workbook.';
    rec.infobase = { unknowns: 'Imported: review.', knownUnconfirmed: '', growthLevers: '' };
    rec.opportunities = [{ id: nextId('op'), title: 'Imported opportunity', offeringId: getDb().offerings[0].id, potential: 3, effort: 3, complexity: 3, estimatedValue: null, isPriority: true }];
    syncTactical(rec);
    touch(rec, 'profile', 'infobase', 'opportunities');
    getDb().accounts.push(rec);
  }
  getDb().imports.delete(c.params[0]);
  return ok(planOf(getDb(), rec, true) satisfies AccountPlan);
});

const csv = (rows: (string | number | null)[][]) =>
  rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

route('GET', '/accounts/:id/export', (c) => {
  const rec = planAccount(c, c.params[0]);
  const plan = planOf(getDb(), rec, false);
  const rows: (string | number | null)[][] = [
    ['Section', 'Field', 'Value'],
    ['KYC', 'Account', rec.name],
    ['KYC', 'Challenges', rec.profile.challenges],
    ...plan.opportunities.map((o) => ['S6 Opportunity Matrix', o.title, `P${o.potential} E${o.effort} C${o.complexity} score ${o.score}`]),
    ...plan.stakeholders.map((s) => ['S7 Mapping the account', s.name, `${s.title}; ${s.role}; ${s.importance}`]),
    ...plan.actions.map((a) => ['S11 Time bound action plan', a.title, `${a.ownerName}; ${a.dueDate}; ${a.status}`]),
  ];
  return { blob: { data: csv(rows), type: 'text/csv', fileName: `${rec.name.replace(/\W+/g, '_')}-mock-export.csv` } };
});
route('GET', '/exports/bd-pack', (c) => {
  const u = requireUser(c, 'GroupLead');
  const d = getDb();
  const rows: (string | number | null)[][] = [['Account', 'Opportunity', 'Offering', 'Score', 'Value (USD)', 'Priority']];
  visibleAccounts(u).forEach((a) =>
    a.opportunities.forEach((o) =>
      rows.push([a.name, o.title, d.offerings.find((f) => f.id === o.offeringId)?.name ?? '', opportunityScore(o), o.estimatedValue, o.isPriority ? 'Yes' : 'No']),
    ),
  );
  return { blob: { data: csv(rows), type: 'text/csv', fileName: 'kratos-bd-pack-mock.csv' } };
});
route('GET', '/exports/executive-pack', (c) => {
  requireUser(c, 'Executive');
  const d = getDb();
  const rows: (string | number | null)[][] = [['Account', 'Type', 'Group', 'Health', 'Risk', 'Completion', 'Overdue actions']];
  d.accounts.forEach((a) => {
    const s = summaryOf(d, a);
    rows.push([s.name, s.type, s.groupName, s.health, s.riskLevel, s.completion, s.overdueActions]);
  });
  return { blob: { data: csv(rows), type: 'text/csv', fileName: 'kratos-executive-pack-mock.csv' } };
});

// ----- Security -----
route('GET', '/security/findings', (c) => {
  requireUser(c, 'Admin');
  return ok([...getDb().findings].sort((a, b) => b.at.localeCompare(a.at)));
});
route('POST', '/security/scan', async (c) => {
  requireUser(c, 'Admin');
  await wait(jitter(1500, 2400));
  const d = getDb();
  const denied = d.audit.filter((e) => e.outcome === 'Denied').length;
  const f = {
    id: nextId('sf'),
    at: new Date().toISOString(),
    severity: denied > 3 ? ('Medium' as const) : ('Low' as const),
    rule: 'SCOPE-PROBE',
    detail: `${denied} denied requests in the audit log since the last scan.`,
    explanation: denied > 3 ? 'More denials than usual. Check whether a user lost access after a reassignment.' : 'Denials are within the normal range.',
    status: 'Open' as const,
  };
  d.findings.unshift(f);
  trackAi('SecuritySentinel', 2100, 310);
  return ok([f]);
});
route('POST', '/security/findings/:id/acknowledge', (c) => {
  requireUser(c, 'Admin');
  const f = getDb().findings.find((x) => x.id === c.params[0]);
  if (!f) throw new HttpError(404, 'Not found');
  f.status = 'Acknowledged';
  return noContent;
});
route('GET', '/security/audit', (c) => {
  requireUser(c, 'Admin');
  const take = Math.min(500, Number(c.query.get('take') ?? 100) || 100);
  return ok([...getDb().audit].sort((a, b) => b.at.localeCompare(a.at)).slice(0, take));
});

// ---------- Dispatcher ----------
function userFromHeaders(headers: Headers): MockUser | null {
  const auth = headers.get('authorization') ?? '';
  const m = /^Bearer mock\.([^.]+)\./.exec(auth);
  if (!m) return null;
  try {
    const id = atob(m[1]);
    return getDb().users.find((u) => u.id === id && u.isActive) ?? null;
  } catch {
    return null;
  }
}

function auditName(method: string, path: string): string {
  if (path.startsWith('/auth/login')) return 'Auth.Login';
  if (path.includes('/ai/')) return 'Ai.' + (path.split('/').pop() ?? 'call');
  if (path.startsWith('/admin')) return 'Admin.' + (method === 'POST' ? 'Create' : 'Update');
  if (path.startsWith('/imports')) return path.endsWith('commit') ? 'Import.Commit' : 'Import.Upload';
  if (path.startsWith('/exports') || path.endsWith('/export')) return 'Export.Download';
  if (path.startsWith('/security')) return 'Security.' + (path.split('/').pop() ?? 'call');
  if (path.includes('/versions')) return 'Version.Create';
  if (path.includes('actions')) return 'Action.' + (method === 'POST' ? 'Create' : 'Update');
  return method === 'GET' ? 'Account.Read' : 'Plan.Update';
}

function problemResponse(status: number, title: string, detail?: string, errors?: Record<string, string[]>) {
  return new Response(JSON.stringify({ type: `https://httpstatuses.io/${status}`, title, status, detail, errors }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export async function mockFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const url = new URL(input, 'http://mock.local');
  const method = (init.method ?? 'GET').toUpperCase();
  const basePath = new URL(API_BASE, 'http://mock.local').pathname.replace(/\/+$/, '');
  const path = url.pathname.startsWith(basePath) ? url.pathname.slice(basePath.length) || '/' : url.pathname;
  const headers = new Headers(init.headers);

  await wait(jitter(160, 420));
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  let body: Record<string, unknown> = {};
  let form: FormData | null = null;
  if (init.body instanceof FormData) form = init.body;
  else if (typeof init.body === 'string' && init.body) {
    try {
      body = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return problemResponse(400, 'Malformed JSON');
    }
  }

  const user = userFromHeaders(headers);
  const logAudit = (outcome: 'Success' | 'Denied' | 'Failed') => {
    if (method === 'GET' && outcome === 'Success' && !path.includes('export')) return;
    getDb().audit.unshift({
      at: new Date().toISOString(),
      userEmail: user?.email ?? String(body.email ?? 'anonymous'),
      action: auditName(method, path),
      resource: path.replace(/^\//, ''),
      outcome,
      ip: '127.0.0.1',
    });
  };

  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = re.exec(path);
    if (!match) continue;
    const params = match.slice(1).map(decodeURIComponent);
    try {
      if (!user && path !== '/auth/login' && path !== '/health') throw new HttpError(401, 'Not signed in', 'Sign in to continue.');
      const res = await handler({ method, path, params, query: url.searchParams, body, form, user });
      logAudit('Success');
      if (res?.blob) {
        return new Response(new Blob([res.blob.data], { type: res.blob.type }), {
          status: 200,
          headers: {
            'Content-Type': res.blob.type,
            'Content-Disposition': `attachment; filename="${res.blob.fileName}"`,
          },
        });
      }
      const status = res?.status ?? 200;
      if (status === 204 || res?.json === undefined) return new Response(null, { status: 204 });
      return new Response(JSON.stringify(res.json), { status, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      if (e instanceof HttpError) {
        logAudit(e.status === 403 || e.status === 404 ? 'Denied' : 'Failed');
        return problemResponse(e.status, e.title, e.detail, e.errors);
      }
      console.error('[mock api]', e);
      return problemResponse(500, 'Mock server error', e instanceof Error ? e.message : String(e));
    }
  }
  return problemResponse(404, 'Not found', `No mock route for ${method} ${path}`);
}

/** Exposed for the dev console: `window.__kratosMock.reset()`. */
if (typeof window !== 'undefined') {
  (window as unknown as { __kratosMock: unknown }).__kratosMock = { reset: resetMockDb, today };
}
