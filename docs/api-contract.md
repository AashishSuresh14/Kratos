# Kratos Digital KAM — API contract v1

Base URL: `/api/v1`. JSON is camelCase. Dates are ISO-8601 (`2026-09-29`), timestamps UTC (`2026-09-29T10:15:00Z`).
Auth: `Authorization: Bearer <jwt>` on every endpoint except `POST /auth/login` and `GET /health`.
Errors use RFC 7807 problem details: `{ "type", "title", "status", "detail", "errors"?: { field: [msg] } }`.
`401` = not signed in, `403` = signed in but outside your access scope, `404` = not found **or** not visible to you (no existence leaks), `409` = concurrency/version conflict, `422` = validation failed.

## Roles (least privilege)

| Role | Sees | Can change |
|---|---|---|
| `AccountManager` | Accounts where they are captain or on the account team | Plan content, stakeholders, opportunities, actions on those accounts; AI suggestions for them |
| `GroupLead` | All accounts in groups they lead | Same as AccountManager for those accounts; BD export pack for their groups |
| `Executive` | All accounts (read only) | Nothing in plans. Executive export pack, executive brief, risk scan |
| `Admin` | Account list metadata only (name, group, captain) — not plan content | Master data, users, groups, accounts (create/assign), security findings and audit log |

The JWT carries `sub` (user id), `name`, `email`, `role`. Frontend hides what the role cannot do; the API enforces it regardless.

## Enums

- `role`: `Admin | Executive | GroupLead | AccountManager`
- `accountType`: `NBD | EBD`
- `raci`: `R | A | C | I`
- `stakeholderRole`: `DecisionMaker | Influencer | User | Gatekeeper`
- `importance`: `A | B | C`
- `knowledge`: `Unknown | KnownUnconfirmed | Confirmed`
- `sectionKey` — mirrors the existing KAM workbook tabs, in this order:

  | code | key | workbook tab | title shown in UI |
  |---|---|---|---|
  | S1 | `profile` | KYC | Know your customer |
  | S2 | `infobase` | S2 Info Base | Information base |
  | S3–S4 | `vision` | S3 3 year vision · S4 objectives | Vision & objectives |
  | S5 | `strategy` | S5 Strategic Direction | Strategic direction |
  | S6 | `opportunities` | S6 Opportunity Matrix | Opportunity matrix |
  | S7 | `stakeholders` | S7 Mapping the account | Mapping the account |
  | S8 | `brickwall` | S8 Brickwall | Brickwall |
  | S9 | `tactical` | S9 Tactical Checklist | Tactical checklist |
  | S10 | `priorityActions` | S10 Priority actions | Priority actions |
  | S11 | `actionPlan` | S11 Time bound action plan | Time-bound action plan |
  | S12 | `resources` | S12 Resources Needed | Resources needed |

  S10 = top-level actions tied to a priority opportunity; S11 = the dated plan including sub-actions (`parentId`). Both are backed by the Actions resource.
- `actionStatus`: `Open | InProgress | Done | Blocked`
- `checklistAnswer`: `Yes | Partial | No`
- `brickwallCategory`: `Strategic | Behavioural | Operational`
- `checklistWeight`: `Essential | Desirable | Useful`
- `resourceType`: `Money | Expertise | ManagementTime | Travel`
- `riskLevel`: `Low | Medium | High`
- `recommendationStatus`: `New | Accepted | Dismissed`

## Auth

`POST /auth/login` `{ email, password }` → `200 { token, expiresAt, user: User }` · `401` on bad credentials (same message for unknown email and wrong password; 5 failures in 15 min → `429`).
`GET /auth/me` → `User`

```ts
User = { id: string; email: string; displayName: string; role: Role; groupIds: string[] }
```

## Master data (read: any signed-in user · write: Admin)

`GET /master` →
```ts
{ offerings: {id,name,category,isActive}[];
  strategies: {id,name,description,isActive}[];
  brickwallCriteria: {id,name,category:BrickwallCategory,weight:number,isActive}[];
  checklistQuestions: {id,text,weight:ChecklistWeight,isActive}[];
  groups: {id,name,leadUserId,leadName}[];
  scoringWeights: {key:string,label:string,weight:number}[] }
```
`PUT /admin/master/{kind}/{id}` and `POST /admin/master/{kind}` — kind ∈ `offerings|strategies|brickwallCriteria|checklistQuestions`, body = item without id.
`PUT /admin/scoring-weights` `{ weights: {key,weight}[] }` → recalculates all scores.
`GET /admin/users` → `User[] & {isActive}`, `POST /admin/users` `{email,displayName,role,password}`, `PUT /admin/users/{id}` `{displayName,role,isActive}`.
`POST /admin/groups` `{name,leadUserId}` · `PUT /admin/groups/{id}`.

## Accounts

`GET /accounts?type=NBD|EBD&groupId=&search=` → `AccountSummary[]` (scoped)
```ts
AccountSummary = { id; name; industry; region; type: AccountType; groupId; groupName;
  captainId; captainName; health: number; riskLevel: RiskLevel; completion: number;
  overdueActions: number; staleSections: number; lastReviewedAt: string|null; currentVersion: number }
```
`POST /accounts` (Admin, GroupLead for own group) `{ name, industry, region, type, groupId, captainId }` → `AccountSummary`

`GET /accounts/{id}` → full plan
```ts
AccountPlan = {
  summary: AccountSummary;
  rowVersion: string;                       // send back on PUTs for optimistic concurrency
  canEdit: boolean;
  sections: { key: SectionKey; code: string; title: string; completion: number; updatedAt: string|null; isStale: boolean }[];   // always 11, in S1→S12 order
  profile: { accountSince: string|null; currentRunRate: number|null; currency: "USD";
             cxoConnect: string; challenges: string;
             currentOfferingIds: string[]; aspirationalOfferingIds: string[];
             reviewCadenceDays: number };
  team: { userId; displayName; raci: Raci; responsibility: string }[];
  infobase: { unknowns: string; knownUnconfirmed: string; growthLevers: string };
  stakeholders: Stakeholder[];
  vision: { threeYear: string; oneYear: string; objectives: string[] };
  strategyIds: string[];
  opportunities: Opportunity[];
  brickwall: { criterionId: string; score: 1|2|3|4|5|null; note: string }[];
  tactical: { opportunityId: string; answers: { questionId: string; answer: ChecklistAnswer|null }[] }[];
  resources: { id; type: ResourceType; description: string; amount: number|null }[];
  actions: Action[];                        // feeds S10 and S11
  scores: Scores;
}
Stakeholder = { id; name; title; role: StakeholderRole; importance: Importance; buyingMotive: string;
  perception: 1|2|3|4|5|null; perceptionVsCompetitors: string; knowledge: Knowledge; notes: string }
Opportunity = { id; title; offeringId; offeringName; potential: 1-5; effort: 1-5; complexity: 1-5;
  estimatedValue: number|null; isPriority: boolean; score: number }
Scores = { opportunity: number; brickwall: number; checklist: number; perception: number;
  completion: number; health: number; riskLevel: RiskLevel; riskReasons: string[] }  // all 0–100
```

Section writes (AccountManager/GroupLead in scope). Body includes `rowVersion`; response is the updated `AccountPlan`.
- `PUT /accounts/{id}/profile` · `PUT /accounts/{id}/team` `{ members: [...], rowVersion }`
- `PUT /accounts/{id}/infobase` · `PUT /accounts/{id}/vision` · `PUT /accounts/{id}/strategies` `{ strategyIds, rowVersion }`
- `PUT /accounts/{id}/brickwall` `{ ratings: [...], rowVersion }` · `PUT /accounts/{id}/tactical` `{ items: [...], rowVersion }`
- `POST|PUT|DELETE /accounts/{id}/stakeholders[/{sid}]` · `POST|PUT|DELETE /accounts/{id}/opportunities[/{oid}]` · `POST|PUT|DELETE /accounts/{id}/resources[/{rid}]`

## Versions and trends (AC 3)

`POST /accounts/{id}/versions` `{ changeSummary }` → `Version` — snapshots the plan and scores; marks the account reviewed.
`GET /accounts/{id}/versions` → `Version[]` newest first
`GET /accounts/{id}/versions/{number}/diff?against={number}` → `{ changes: { section: SectionKey; field: string; before: string; after: string }[] }`
```ts
Version = { number: number; createdAt: string; createdBy: string; changeSummary: string; scores: Scores }
```

## Actions (AC 4)

`GET /actions?accountId=&status=&mine=true&overdue=true` → `Action[]` (scoped)
`POST /accounts/{id}/actions` `{ title, sourceSection, opportunityId?, ownerId, dueDate, parentId? }` → `Action`
`PATCH /actions/{id}` `{ status?, dueDate?, ownerId?, title? }` → `Action`
```ts
Action = { id; accountId; accountName; title; sourceSection: SectionKey; opportunityId: string|null;
  ownerId; ownerName; dueDate: string; status: ActionStatus; isOverdue: boolean; parentId: string|null;
  origin: "Manual"|"AiNextBestAction"; createdAt: string }
```

## Views (AC 7)

`GET /views/mac` → `{ totals: { accounts, atRisk, overdueActions, avgHealth }, accounts: AccountSummary[], healthByGroup: {groupName, avgHealth}[] }`
`GET /views/nbd` → `{ accounts: { account: AccountSummary; readiness: number; topOpportunities: Opportunity[] }[] }`
`GET /views/ebd` → `{ offerings: {id,name}[]; rows: { accountId; accountName; relationship: number; cells: { offeringId; state: "Current"|"Aspirational"|"Opportunity"|"None" }[] }[] }`
`GET /accounts/{id}/scores/trend` → `{ points: { version: number; date: string; health; opportunity; brickwall; checklist; perception }[] }`

## AI (AC 8) — every response includes `meta: { agent, provider, model, inputTokens, outputTokens, latencyMs, fallbackUsed: boolean }`

`POST /accounts/{id}/ai/next-best-action` → `Recommendation`
`GET /accounts/{id}/ai/recommendations` → `Recommendation[]`
`POST /ai/recommendations/{rid}/accept` `{ ownerId, dueDate }` → `Action` (creates a tracked action linked to the section)
`POST /ai/recommendations/{rid}/dismiss` `{ reason }` → `204`
```ts
Recommendation = { id; accountId; createdAt; status: RecommendationStatus;
  action: string; whoseHelp: { name: string; type: "Internal"|"CustomerStakeholder"; why: string }[];
  channel: "Meeting"|"Email"|"ExecutiveConnect"|"Event"|"Call"|"Workshop";
  rationale: string; sourceSections: SectionKey[]; atRisk: boolean; riskReason: string|null;
  meta: AiMeta }
```
`POST /accounts/{id}/ai/copilot` `{ section: SectionKey, instruction: string }` → `{ suggestion: string, meta }` (draft only, never saved automatically)
`POST /ai/risk-scan` (Executive, GroupLead) → `{ accounts: { accountId, accountName, riskLevel, drivers: string[], explanation: string }[], meta }`
`GET /ai/executive-brief` (Executive) → `{ generatedAt, headline, sections: { title, body, accountIds: string[] }[], meta }`
`GET /ai/usage` (Admin, Executive) → `{ byAgent: { agent, calls, inputTokens, outputTokens, failures }[], budgetTokens, usedTokens }`
`GET /ai/evaluations` (Admin) → latest agent evaluation results `{ agent, score, passed, notes, at }[]`
`POST /ai/evaluations/run` (Admin) → runs the evaluator on the latest recommendations, same shape
`POST /admin/reporting/refresh` (Admin) → `{ rows }`, rewrites today's `AccountScoreSnapshots`

## Import / export (AC 5, AC 6)

`POST /imports` multipart `file` (.xlsx, ≤ 10 MB) → `ImportReport`
`POST /imports/{importId}/commit` `{ accountId: string|null, groupId: string|null, type: AccountType|null }` → `AccountPlan` (creates the account if `accountId` omitted)
```ts
ImportReport = { importId; fileName; sheetsFound: string[]; accountName: string|null;
  findings: { severity: "Error"|"Warning"|"Info"; sheet: string; cell: string|null; message: string }[];
  mapped: { section: SectionKey; fields: number; confidence: number }[]; canCommit: boolean; meta: AiMeta|null }
```
`GET /accounts/{id}/export` → `.xlsx` in the original workbook structure
`GET /exports/bd-pack` (AccountManager, GroupLead, Executive) → `.xlsx` (opportunities, stakeholders, actions — scoped)
`GET /exports/executive-pack` → `.xlsx` (portfolio summary, account health, risks — Executive)

## Security (Admin)

`GET /security/findings` → `{ id; at; severity: "Low"|"Medium"|"High"|"Critical"; rule; detail; explanation: string|null; status: "Open"|"Acknowledged" }[]`
`POST /security/scan` → runs the Security Sentinel now, returns the new findings
`POST /security/findings/{id}/acknowledge` → `204`
`GET /security/audit?take=100` → `{ at; userEmail; action; resource; outcome: "Success"|"Denied"|"Failed"; ip }[]`

## Health

`GET /health` → `{ status: "ok", version, db: "ok", ai: { claude: "configured"|"missing", gemini: ..., groq: ..., ollama: ... } }`
