using Kratos.Application.Abstractions;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Services;

public interface IReportingRepository
{
    Task ReplaceSnapshotAsync(DateOnly date, IReadOnlyList<AccountScoreSnapshot> rows, CancellationToken ct);
}

/// <summary>
/// Writes one denormalised score row per account per day (table AccountScoreSnapshots).
/// Power BI connects to Azure SQL directly on this table; Databricks can ingest it for longer-term trend analytics.
/// Runs as a system job, so it reads all accounts regardless of user scope; BI access is controlled at the database.
/// </summary>
public sealed class ReportingService(
    IAccountRepository accounts, IMasterDataRepository master, IUserRepository users, IVersionRepository versions,
    IReportingRepository reporting, ScoringService scoring, IClock clock)
{
    public async Task<int> RefreshAsync(CancellationToken ct)
    {
        var ids = (await accounts.ListScopeRowsAsync(ct)).Select(r => r.Id).ToList();
        var list = await accounts.ListAsync(ids, ct);
        var groups = (await master.GroupsAsync(ct)).ToDictionary(g => g.Id, g => g.Name);
        var names = await users.NamesAsync(list.Select(a => a.CaptainId), ct);
        var latest = await versions.LatestForAsync(ids, ct);
        var today = DateOnly.FromDateTime(clock.UtcNow);
        var rows = new List<AccountScoreSnapshot>();
        foreach (var a in list)
        {
            var ctx = await scoring.ContextAsync(ct, ScoringService.PreviousHealth(latest.GetValueOrDefault(a.Id)));
            var s = ScoringEngine.Calculate(a, ctx);
            rows.Add(new AccountScoreSnapshot
            {
                SnapshotDate = today, AccountId = a.Id, AccountName = a.Name, AccountType = a.Type.ToString(),
                GroupName = groups.GetValueOrDefault(a.GroupId, ""), CaptainName = names.GetValueOrDefault(a.CaptainId, ""),
                Industry = a.Industry, Region = a.Region, Health = s.Health, Opportunity = s.Opportunity, Brickwall = s.Brickwall,
                Checklist = s.Checklist, Perception = s.Perception, Completion = s.Completion, RiskLevel = s.RiskLevel.ToString(),
                OverdueActions = a.Actions.Count(x => x.IsOverdue(today)), OpenActions = a.Actions.Count(x => x.Status != ActionStatus.Done),
                StaleSections = ScoringEngine.Sections(a, ctx).Count(x => x.IsStale),
                PipelineValue = a.Opportunities.Sum(o => o.EstimatedValue ?? 0), CurrentRunRate = a.CurrentRunRate, PlanVersion = a.CurrentVersion,
            });
        }
        await reporting.ReplaceSnapshotAsync(today, rows, ct);
        return rows.Count;
    }
}
