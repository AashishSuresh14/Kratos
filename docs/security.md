# Security controls and risk register

## Access layers (least privilege)

| Role | Sees | Can change |
|---|---|---|
| AccountManager | Accounts where captain or team member | Those plans and actions |
| GroupLead | Accounts in groups they lead | Those plans and actions; BD pack |
| Executive | All accounts, read-only | Nothing in plans; executive brief, risk scan, executive pack |
| Admin | Account metadata only | Master data, users, groups, weights, security findings |

Every endpoint requires sign-in (fallback authorization policy). `AccessScope` is the single place that decides visibility and edit rights. It is covered by unit, integration and smoke tests. Unknown role claims fall back to the lowest role.

## Controls in place

| Area | Control |
|---|---|
| Authentication | PBKDF2-SHA256 (210k iterations, salted, constant-time compare); generic sign-in error; same timing for unknown users; account lockout after 5 failures in 15 min; per-IP rate limit on sign-in |
| Tokens | HS256 JWT, 8 h lifetime, issuer/audience/lifetime validated, 1 min clock skew; the app refuses to start in Production with the development key |
| Authorization | Fallback policy = authenticated; Admin policy for admin/security; resource-level scope checks in Application |
| Input | Length and range validation on every field; enums validated; referenced IDs checked against master data; 422 problem details |
| Concurrency | `rowVersion` checks plus a database concurrency token |
| Uploads | .xlsx only, ≤ 10 MB, zip-bomb guard (≤ 100 MB expanded, ≤ 2000 entries), macro-enabled files rejected, hidden sheets skipped, formulas never evaluated |
| Exports | Formula-injection protection (text starting with `= + - @` stored as quoted text) |
| AI | Keys only server-side; tools are read-only and scoped to one account; prompts mark user and file data as untrusted (prompt-injection defence); structured output validated; free text capped; AI never writes to a plan without user acceptance; daily token budget; every call logged |
| Transport and headers | HTTPS redirect and HSTS outside dev; nosniff, frame DENY, no-referrer, CSP `default-src 'none'` on API responses; strict CORS allow-list; SWA headers for the SPA |
| Abuse | Global per-user rate limit (600/min), AI 20/min, sign-in 20/min/IP; body size limit 11 MB |
| Secrets | Key Vault via managed identity in Azure; `.env` (git-ignored) locally; nothing in source |
| Errors | Problem details without stack traces or provider messages |
| Audit | Sign-ins, denials, plan edits, exports, role changes and AI calls recorded |

## Security Sentinel (monitoring agent)

Runs every 15 minutes (hosted service locally, Azure Function in the cloud) and on demand from Admin → Security. Deterministic rules raise findings; Claude Haiku writes a two-sentence explanation and next step. High findings are posted to Teams when a webhook is configured.

| Rule | Trigger | Severity |
|---|---|---|
| Brute-force sign-in | ≥ 5 failed sign-ins for one email in 15 min | High |
| Credential stuffing | Failed sign-ins for ≥ 4 emails from one IP | High |
| Access probing | ≥ 5 denials for one user in 10 min | Medium |
| Bulk export | ≥ 6 exports by one user in an hour | Medium |
| Unusual AI usage | ≥ 40 AI calls by one user in an hour | Medium |
| Role changed | Any role change | Low |
| Demo password in production | Seed password configured in Production | Critical |
| Development signing key | Dev JWT key in Production | Critical |
| Secrets outside Key Vault | Key Vault not configured in Production | High |

## Risk register

| # | Risk | Likelihood | Impact | Mitigation / status |
|---|---|---|---|---|
| R1 | Real customer data entered into free-tier AI | Medium | High | Synthetic seed data; untrusted-data prompts. **Open:** confirm which AI tiers are approved for real KAM data before go-live |
| R2 | Prompt injection via workbook or plan text | Medium | Medium | Data tagged as untrusted, read-only tools, schema validation, human acceptance |
| R3 | JWT in browser sessionStorage can be read by XSS | Low | High | No `dangerouslySetInnerHTML`, CSP on SWA. **Planned:** Entra ID with HttpOnly cookies via SWA auth |
| R4 | Local demo passwords | High (demo) | Medium | Sentinel flags it in production; replace with Entra ID |
| R5 | `EnsureCreated` schema without migrations | Medium | Medium | **Planned:** EF migrations before production |
| R6 | AI cost overrun on the shared credit | Medium | Low | Daily token budget, cheap models for bulk, usage page |
| R7 | Heuristic Excel mapping misreads a workbook | Medium | Medium | Validation report before commit; AI confidence shown; merge never overwrites existing text |
| R8 | Single-region, Basic-tier SQL | Low | Medium | Acceptable for the pilot; scale the tier for production |
