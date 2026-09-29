# Kratos — Digital KAM

pSpark 2026 · Use case 5. A digital Key Account Management platform for Psiog. Account plans move out of static Excel workbooks and become living, scored, versioned plans, with AI recommending the next best action for every account.

The plan mirrors the existing KAM workbook tab for tab, so account teams recognise it: S1 KYC → S12 Resources Needed.

## What's in the box

| Component | Tech | Folder |
|---|---|---|
| Web portal (Account, MAC, NBD, EBD, Actions, Import, Exports, Brief, Admin) | React 18 + TypeScript + Vite, ECharts | [web/](web/) |
| REST API with OpenAPI docs | ASP.NET Core 10, minimal APIs | [src/Kratos.Api](src/Kratos.Api) |
| Business rules, scoring, AI agents | .NET class library (no framework dependencies) | [src/Kratos.Application](src/Kratos.Application), [src/Kratos.Domain](src/Kratos.Domain) |
| Data access layer, AI provider adapters, Excel | EF Core (Azure SQL / SQLite), Anthropic SDK, ClosedXML | [src/Kratos.Infrastructure](src/Kratos.Infrastructure) |
| Scheduled jobs (security scan, BI snapshot, agent evaluation) | Azure Functions (isolated worker) | [src/Kratos.Functions](src/Kratos.Functions) |
| Tests: unit, integration, end-to-end smoke | xUnit, WebApplicationFactory, Python | [tests/](tests/) |
| CI and OIDC deploy | GitHub Actions | [.github/workflows](.github/workflows) |
| Azure provisioning | Azure CLI script | [scripts/provision-azure.sh](scripts/provision-azure.sh) |

Read next: [architecture](docs/architecture.md) · [decisions](docs/decisions.md) · [security and risks](docs/security.md) · [API contract](docs/api-contract.md) · [Power BI](docs/powerbi.md)

## Run it locally (no cloud needed)

Prerequisites: .NET 10 SDK, Node 24.

```bash
# 1. Optional: AI keys. Without them every non-AI feature works and AI shows "not available".
cp .env.example .env            # then fill ANTHROPIC_API_KEY / GEMINI_API_KEY

# 2. API on http://localhost:5080 (SQLite, seeded with fictional demo data)
dotnet run --project src/Kratos.Api --launch-profile http
#    Swagger UI: http://localhost:5080/swagger

# 3. Web on http://localhost:5173
cd web && npm install && npm run dev
```

Demo sign-ins (development seed only; the password is `Seed:DemoPassword` in `appsettings.Development.json`):

| Email | Role | Sees |
|---|---|---|
| priya.am@kratos.demo | Account manager | Own accounts only |
| nbd.lead@kratos.demo | Group lead (NBD) | NBD group |
| ebd.lead@kratos.demo | Group lead (EBD) | EBD group |
| exec@kratos.demo | Executive | Everything, read-only, plus executive brief and pack |
| admin@kratos.demo | Admin | Configuration, users, security. No plan content |

With Podman instead: `podman build -f src/Kratos.Api/Dockerfile -t kratos-api . && podman run -p 8080:8080 --env-file .env -e Seed__DemoPassword=<choose> kratos-api`

## Before a demo

The smoke test and Postman run write test records such as "Smoke Offering". Reset to clean demo data by stopping the API, deleting `src/Kratos.Api/kratos.db*` and starting it again. It reseeds automatically.

## Test

```bash
dotnet test                                   # unit + integration
python tests/smoke/smoke_test.py              # 43 end-to-end checks against a running API
python tests/smoke/smoke_test.py --ai         # also exercises every AI agent (spends tokens)
npx newman run tests/postman/Kratos.postman_collection.json \
  --env-var baseUrl=http://localhost:5080 --env-var password=<demo password>   # 30 requests, one folder per acceptance criterion
cd web && npm test && npm run lint
```

## Deploy to Azure

1. `az login`, then `RG=<your pSpark resource group> ./scripts/provision-azure.sh`. It creates Key Vault, Azure SQL, App Service, Functions, Storage and Static Web Apps, and prompts for the AI keys straight into Key Vault.
2. Set the repository variables listed at the top of [deploy.yml](.github/workflows/deploy.yml) and run the workflow. GitHub signs in to Azure with OIDC, so no Azure secrets are stored in GitHub.

## Acceptance criteria → where it is built

| # | Criterion | Where |
|---|---|---|
| 1 | Digitised account plan, completion per section | S1–S12 section editors; `ScoringEngine.Sections` |
| 2 | Automatic, configurable scoring | `Domain/Scoring/ScoringEngine.cs`; weights in Admin → Scoring |
| 3 | Continuous planning: versions, cadence, stale/overdue, trends | `VersionService`, staleness per section, trend chart, Functions timers |
| 4 | Action tracking linked to source section | `ActionService`; S10 priority actions, S11 time-bound plan with sub-actions |
| 5 | Excel import with validation report, export in same structure | `ImportExportService` + Workbook Interpreter agent; round-trip tested |
| 6 | Documented REST API, BD and Executive packs | `/swagger`, `/api/v1/exports/*` |
| 7 | Account, MAC, NBD, EBD views | `ViewService`, web portal |
| 8 | AI next best action, accounts at risk | Next Best Action, Risk Sentinel agents |
| 9 | Configurable master data | Admin → Master data (offerings, strategies, criteria, questions, groups, weights) |
| 10 | Account / group / executive access | `AccessScope` (single policy point), JWT roles, 404 for out-of-scope |
