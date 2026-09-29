# Architecture

## Layers (Clean Architecture)

```
web (React SPA) ──HTTPS/JSON──▶ Kratos.Api ──▶ Kratos.Application ──▶ Kratos.Domain
                                    │                 ▲
                                    ▼                 │ interfaces (IAccountRepository, IAiProvider, IWorkbookReader …)
                              Kratos.Infrastructure ──┘
                              (EF Core DAL, AI adapters, ClosedXML, PBKDF2)
Kratos.Functions (timers) ──▶ Kratos.Application  (same rules as the API)
```

- **Domain**: entities and the scoring engine. Pure C#, no framework references, so every rule is unit-testable.
- **Application**: use cases (account plan, actions, versions, views, admin, import/export), the access-scope policy, and the AI agents. It depends only on interfaces.
- **Infrastructure**: the data access layer. It is the only code that touches the database (EF Core repositories and a unit of work), AI providers, Excel files or password hashing.
- **API**: HTTP concerns only: auth, rate limits, headers, problem details, endpoint mapping.
- **Functions**: timer triggers that call the same Application services.

## Data flow for the key paths

**Next best action.** SPA → `POST /accounts/{id}/ai/next-best-action` → `AccessScope` checks edit rights → `NextBestActionAgent` builds five read-only tools, each scoped to that one account (plan gaps, scores, stakeholder map, open actions, internal people) → `AiGateway` routes to Claude (tool use plus a JSON schema), falling back to Gemini with the tool results inlined → the output is schema-checked, capped and stored with model and token metadata → the user accepts it and it becomes a tracked action.

**Excel import.** Upload → size, extension, zip-bomb and macro checks → ClosedXML reads cell values (cached values only, formulas never evaluated) → sheets are recognised by the S-code in the tab name → deterministic label/value and table extraction → sheets the rules could not read go to the Workbook Interpreter agent (Gemini) → validation report → the user commits.

**Scores.** Computed on read from the plan and admin-configured weights (`ScoringEngine`). Snapshots are stored with each plan version for trends, and daily in `AccountScoreSnapshots` for Power BI.

## AI provider routing

| Agent | Primary | Fallback | Why |
|---|---|---|---|
| Next best action | Claude Sonnet 5 (tools + structured output) | Gemini | Best reasoning over tool results |
| Executive brief | Claude Sonnet 5 | Gemini | Writing quality for leadership |
| Risk sentinel, security sentinel | Claude Haiku 4.5 | Gemini, Ollama | Cheap, short explanations |
| Workbook interpreter | Gemini | Claude Haiku | Long context over whole workbooks |
| Plan copilot | Groq (Llama) | Gemini, Claude Haiku | Low latency while typing |
| Agent evaluator | Ollama (local) | Claude Haiku, Gemini | Private LLM-as-judge |

Routes and models are configuration (`Ai:Routes`), not code. A daily token budget (`Ai:DailyTokenBudget`) protects the shared credit.

## Azure deployment

| Service | Role |
|---|---|
| Static Web Apps | SPA hosting, security headers via `staticwebapp.config.json` |
| App Service (Linux, .NET 10) | API, system-assigned managed identity |
| Functions (isolated) | Security scan every 15 min, BI snapshot hourly, nightly agent evaluation |
| Azure SQL | System of record, Entra-only authentication via managed identity |
| Key Vault | JWT signing key, AI keys, seed password. Read via managed identity |
| Storage | Functions runtime |
| Container Apps (optional) | The same API image built with Podman, for scale-out or the AI orchestrator split |
