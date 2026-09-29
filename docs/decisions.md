# Decision log

| # | Decision | Why | Trade-off |
|---|---|---|---|
| 1 | ASP.NET Core on .NET 10 (LTS) | The team agreed on ASP.NET Core. .NET 10 is already installed and supported to Nov 2028; .NET 8 is not installed | The blueprint originally said FastAPI |
| 2 | Plan sections mirror the workbook tabs S1–S12 | Account teams already think in these tabs, and import/export become 1:1 | S10 and S11 are both backed by Actions |
| 3 | AI explains, deterministic code decides | Scores, risk flags and security findings must be auditable and repeatable | The AI cannot change a score; it can only recommend |
| 4 | One `IAiProvider` interface and a gateway with fallback routing | Swap models by configuration; survive rate limits; keep keys server-side | Gemini, Groq and Ollama get tool results inlined rather than native tool calls |
| 5 | Scoring = weighted averages, 0–100, weights in master data | Transparent; the admin can tune without code. Formula documented in `ScoringEngine` | Weights need business sign-off (open question) |
| 6 | Optimistic concurrency via `rowVersion` on every section write | Two people editing one plan must not silently overwrite each other | The user reloads on conflict |
| 7 | Versioning = explicit snapshot (JSON) plus scores per version | Portable across SQLite and Azure SQL; diffs per field | Snapshots grow with plan size (small in practice) |
| 8 | Out-of-scope accounts return 404, not 403 | Doesn't reveal which accounts exist | Harder to debug; audit log records the denial |
| 9 | Admin cannot read plan content | Least privilege: configuration is not the same as customer insight | Admin support needs an Executive to look at a plan |
| 10 | SQLite locally, Azure SQL in cloud, `EnsureCreated` schema | Anyone can run it with no cloud or IT approval (hackathon constraint) | Move to EF migrations before production |
| 11 | Power BI reads `AccountScoreSnapshots` in Azure SQL directly; Databricks optional | Data volumes are small; fewer moving parts | Databricks is used for longer-range trend analytics only if needed |
| 12 | ClosedXML (MIT) for Excel | EPPlus licence is non-commercial | — |
| 13 | JWT issued by the API; Entra ID sign-in is a drop-in later | No tenant app registration available during the hackathon | Demo users have local passwords (flagged by the Security Sentinel in production) |
