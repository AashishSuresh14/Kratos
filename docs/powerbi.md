# Power BI and Databricks

## Source table

`dbo.AccountScoreSnapshots` has one row per account per day. It is written hourly by the `ReportingSnapshot` function (or on demand with `POST /api/v1/admin/reporting/refresh`) and is idempotent per day.

| Column | Meaning |
|---|---|
| SnapshotDate, AccountId, AccountName, AccountType (NBD/EBD), GroupName, CaptainName, Industry, Region | Dimensions |
| Health, Opportunity, Brickwall, Checklist, Perception, Completion | Scores 0–100 |
| RiskLevel | Low / Medium / High |
| OverdueActions, OpenActions, StaleSections | Hygiene |
| PipelineValue, CurrentRunRate, PlanVersion | Commercials |

## Power BI Desktop report (Executive portfolio)

1. Get data → Azure SQL database → server `<sql>.database.windows.net`, database `kratos` → Microsoft account (Entra) → table `AccountScoreSnapshots`.
2. Measures:
   - `Avg Health = AVERAGE(AccountScoreSnapshots[Health])`
   - `At Risk = CALCULATE(DISTINCTCOUNT(AccountScoreSnapshots[AccountId]), AccountScoreSnapshots[RiskLevel] = "High")`
   - `Latest = CALCULATE(MAX(AccountScoreSnapshots[SnapshotDate]), ALL(AccountScoreSnapshots))`
3. Pages: Portfolio (KPI cards, health by group, risk table filtered to `Latest`), Trends (health over SnapshotDate by account), NBD pipeline (PipelineValue by account, NBD filter), EBD (run rate against relationship score).
4. Save the file as `docs/Kratos-Portfolio.pbix` and commit it with the submission.

## Databricks (optional)

Ingest `AccountScoreSnapshots` over JDBC into a bronze table and build silver (deduplicated per day) and gold (weekly health change, accounts declining three weeks running). That gold table can feed the Risk Sentinel as an extra driver.
