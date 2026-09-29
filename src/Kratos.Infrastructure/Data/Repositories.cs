using Kratos.Application.Abstractions;
using Kratos.Domain;
using Microsoft.EntityFrameworkCore;

namespace Kratos.Infrastructure.Data;

public sealed class UnitOfWork(KratosDbContext db) : IUnitOfWork
{
    public async Task SaveChangesAsync(CancellationToken ct)
    {
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new Application.Common.ConflictException("Someone else changed this record at the same time. Reload and try again.");
        }
        catch (DbUpdateException ex) when (ex.InnerException?.Message.Contains("UNIQUE", StringComparison.OrdinalIgnoreCase) == true
                                           || ex.InnerException?.Message.Contains("duplicate", StringComparison.OrdinalIgnoreCase) == true)
        {
            throw new Application.Common.ConflictException("A record with the same name or key already exists.");
        }
    }
}

public sealed class AccountRepository(KratosDbContext db) : IAccountRepository
{
    private IQueryable<Account> Full => db.Accounts
        .Include(a => a.Team).Include(a => a.Stakeholders).Include(a => a.Opportunities).Include(a => a.Brickwall)
        .Include(a => a.Checklist).Include(a => a.Resources).Include(a => a.Actions)
        .AsSplitQuery();

    public Task<Account?> GetAsync(Guid id, CancellationToken ct) => Full.FirstOrDefaultAsync(a => a.Id == id, ct);

    public Task<List<Account>> ListAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct) =>
        ids.Count == 0 ? Task.FromResult(new List<Account>()) : Full.Where(a => ids.Contains(a.Id)).ToListAsync(ct);

    public async Task<List<AccountScopeRow>> ListScopeRowsAsync(CancellationToken ct)
    {
        var accounts = await db.Accounts.AsNoTracking().Select(a => new { a.Id, a.GroupId, a.CaptainId }).ToListAsync(ct);
        var team = await db.TeamMembers.AsNoTracking().Select(t => new { t.AccountId, t.UserId }).ToListAsync(ct);
        var byAccount = team.GroupBy(t => t.AccountId).ToDictionary(g => g.Key, g => (IReadOnlyList<Guid>)g.Select(x => x.UserId).ToList());
        return accounts.Select(a => new AccountScopeRow(a.Id, a.GroupId, a.CaptainId, byAccount.GetValueOrDefault(a.Id, []))).ToList();
    }

    public async Task<bool> NameExistsAsync(string name, Guid? exceptId, CancellationToken ct)
    {
        var lower = name.ToLower();
        return await db.Accounts.AnyAsync(a => a.Name.ToLower() == lower && (exceptId == null || a.Id != exceptId), ct);
    }

    public void Add(Account account) => db.Accounts.Add(account);
    public void Remove<T>(T child) where T : Entity => db.Remove(child);
    public void AddChild<T>(T child) where T : Entity => db.Add(child);
}

public sealed class UserRepository(KratosDbContext db) : IUserRepository
{
    public Task<AppUser?> GetAsync(Guid id, CancellationToken ct) => db.Users.FirstOrDefaultAsync(u => u.Id == id, ct);
    public Task<AppUser?> GetByEmailAsync(string email, CancellationToken ct) => db.Users.FirstOrDefaultAsync(u => u.Email == email.ToLower(), ct);
    public Task<List<AppUser>> ListAsync(CancellationToken ct) => db.Users.ToListAsync(ct);

    public async Task<Dictionary<Guid, string>> NamesAsync(IEnumerable<Guid> ids, CancellationToken ct)
    {
        var set = ids.Distinct().ToList();
        if (set.Count == 0) return [];
        return await db.Users.AsNoTracking().Where(u => set.Contains(u.Id)).ToDictionaryAsync(u => u.Id, u => u.DisplayName, ct);
    }

    public void Add(AppUser user) => db.Users.Add(user);
}

public sealed class MasterDataRepository(KratosDbContext db) : IMasterDataRepository
{
    public Task<List<Offering>> OfferingsAsync(CancellationToken ct) => db.Offerings.ToListAsync(ct);
    public Task<List<StrategyOption>> StrategiesAsync(CancellationToken ct) => db.Strategies.ToListAsync(ct);
    public Task<List<BrickwallCriterion>> CriteriaAsync(CancellationToken ct) => db.BrickwallCriteria.ToListAsync(ct);
    public Task<List<ChecklistQuestion>> QuestionsAsync(CancellationToken ct) => db.ChecklistQuestions.ToListAsync(ct);
    public Task<List<ScoringWeight>> WeightsAsync(CancellationToken ct) => db.ScoringWeights.ToListAsync(ct);
    public Task<List<AccountGroup>> GroupsAsync(CancellationToken ct) => db.Groups.ToListAsync(ct);
    public async Task<T?> FindAsync<T>(Guid id, CancellationToken ct) where T : Entity => await db.Set<T>().FindAsync([id], ct);
    public void Add<T>(T item) where T : Entity => db.Add(item);
}

public sealed class ActionRepository(KratosDbContext db) : IActionRepository
{
    public Task<ActionItem?> GetAsync(Guid id, CancellationToken ct) => db.Actions.FirstOrDefaultAsync(a => a.Id == id, ct);

    public Task<List<ActionItem>> ListAsync(ActionQuery q, CancellationToken ct)
    {
        if (q.AccountIds.Count == 0) return Task.FromResult(new List<ActionItem>());
        var query = db.Actions.AsNoTracking().Where(a => q.AccountIds.Contains(a.AccountId));
        if (q.Status is { } s) query = query.Where(a => a.Status == s);
        if (q.OwnerId is { } o) query = query.Where(a => a.OwnerId == o);
        if (q.OverdueOnly) query = query.Where(a => a.Status != ActionStatus.Done && a.DueDate < q.Today);
        return query.Take(1000).ToListAsync(ct);
    }

    public void Add(ActionItem item) => db.Actions.Add(item);
}

public sealed class VersionRepository(KratosDbContext db) : IVersionRepository
{
    public Task<List<PlanVersion>> ListAsync(Guid accountId, CancellationToken ct) =>
        db.Versions.AsNoTracking().Where(v => v.AccountId == accountId).OrderBy(v => v.Number).ToListAsync(ct);

    public Task<PlanVersion?> GetAsync(Guid accountId, int number, CancellationToken ct) =>
        db.Versions.AsNoTracking().FirstOrDefaultAsync(v => v.AccountId == accountId && v.Number == number, ct);

    public Task<PlanVersion?> LatestAsync(Guid accountId, CancellationToken ct) =>
        db.Versions.AsNoTracking().Where(v => v.AccountId == accountId).OrderByDescending(v => v.Number).FirstOrDefaultAsync(ct);

    public async Task<Dictionary<Guid, PlanVersion>> LatestForAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct)
    {
        if (ids.Count == 0) return [];
        // Only the scores are needed; skip the large snapshot column.
        var rows = await db.Versions.AsNoTracking().Where(v => ids.Contains(v.AccountId))
            .Select(v => new { v.AccountId, v.Number, v.ScoresJson, v.CreatedAt }).ToListAsync(ct);
        return rows.GroupBy(r => r.AccountId).ToDictionary(g => g.Key, g =>
        {
            var r = g.OrderByDescending(x => x.Number).First();
            return new PlanVersion { AccountId = r.AccountId, Number = r.Number, ScoresJson = r.ScoresJson, CreatedAt = r.CreatedAt };
        });
    }

    public void Add(PlanVersion version) => db.Versions.Add(version);
}

public sealed class AiRepository(KratosDbContext db) : IAiRepository
{
    public Task<AiRecommendation?> GetRecommendationAsync(Guid id, CancellationToken ct) => db.Recommendations.FirstOrDefaultAsync(r => r.Id == id, ct);
    public Task<List<AiRecommendation>> RecommendationsAsync(Guid accountId, CancellationToken ct) =>
        db.Recommendations.Where(r => r.AccountId == accountId).OrderByDescending(r => r.CreatedAt).Take(50).ToListAsync(ct);
    public void Add(AiRecommendation rec) => db.Recommendations.Add(rec);
    public void Log(AiCallLog log) => db.AiCallLogs.Add(log);
    public Task<List<AiCallLog>> CallLogsSinceAsync(DateTime sinceUtc, CancellationToken ct) => db.AiCallLogs.AsNoTracking().Where(l => l.At >= sinceUtc).ToListAsync(ct);
    public void Add(AiEvaluation eval) => db.AiEvaluations.Add(eval);
    public Task<List<AiEvaluation>> LatestEvaluationsAsync(CancellationToken ct) => db.AiEvaluations.AsNoTracking().OrderByDescending(e => e.At).Take(50).ToListAsync(ct);
}

public sealed class SecurityRepository(KratosDbContext db) : ISecurityRepository
{
    public void Add(AuditEvent e) => db.AuditEvents.Add(e);

    public Task<List<AuditEvent>> AuditAsync(DateTime sinceUtc, int take, CancellationToken ct) =>
        db.AuditEvents.AsNoTracking().Where(e => e.At >= sinceUtc).OrderByDescending(e => e.At).Take(take).ToListAsync(ct);

    public Task<List<SecurityFinding>> FindingsAsync(CancellationToken ct) => db.SecurityFindings.OrderByDescending(f => f.At).Take(200).ToListAsync(ct);
    public Task<SecurityFinding?> FindingAsync(Guid id, CancellationToken ct) => db.SecurityFindings.FirstOrDefaultAsync(f => f.Id == id, ct);
    public Task<bool> OpenFindingExistsAsync(string fingerprint, CancellationToken ct) => db.SecurityFindings.AnyAsync(f => f.Fingerprint == fingerprint, ct);
    public void Add(SecurityFinding f) => db.SecurityFindings.Add(f);

    public Task<int> RecentFailedLoginsAsync(string email, DateTime sinceUtc, CancellationToken ct) =>
        db.AuditEvents.CountAsync(e => e.UserEmail == email && e.Action == "auth.login" && e.Outcome == AuditOutcome.Failed && e.At >= sinceUtc, ct);
}

public sealed class ImportRepository(KratosDbContext db) : IImportRepository
{
    public Task<ImportSession?> GetAsync(Guid id, CancellationToken ct) => db.Imports.FirstOrDefaultAsync(i => i.Id == id, ct);
    public void Add(ImportSession session) => db.Imports.Add(session);
}

public sealed class ReportingRepository(KratosDbContext db) : Application.Services.IReportingRepository
{
    public async Task ReplaceSnapshotAsync(DateOnly date, IReadOnlyList<AccountScoreSnapshot> rows, CancellationToken ct)
    {
        // Idempotent per day: re-running replaces today's rows.
        var existing = await db.ScoreSnapshots.Where(s => s.SnapshotDate == date).ToListAsync(ct);
        db.ScoreSnapshots.RemoveRange(existing);
        db.ScoreSnapshots.AddRange(rows);
        await db.SaveChangesAsync(ct);
    }
}
