using Kratos.Domain;

namespace Kratos.Application.Abstractions;

// ---------------- Cross-cutting ----------------

public interface IClock
{
    DateTime UtcNow { get; }
}

public interface ICurrentUser
{
    Guid Id { get; }
    string Email { get; }
    Role Role { get; }
    string Ip { get; }
    bool IsAuthenticated { get; }
}

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string hash, string password);
}

public interface ITokenIssuer
{
    (string Token, DateTime ExpiresAt) Issue(AppUser user);
}

// ---------------- Data access layer (implemented in Infrastructure) ----------------

public interface IUnitOfWork
{
    Task SaveChangesAsync(CancellationToken ct);
}

/// <summary>Minimal projection used for access-scope checks without loading plan content.</summary>
public sealed record AccountScopeRow(Guid Id, Guid GroupId, Guid CaptainId, IReadOnlyList<Guid> TeamUserIds);

public interface IAccountRepository
{
    Task<Account?> GetAsync(Guid id, CancellationToken ct);
    Task<List<Account>> ListAsync(IReadOnlyCollection<Guid> ids, CancellationToken ct);
    Task<List<AccountScopeRow>> ListScopeRowsAsync(CancellationToken ct);
    Task<bool> NameExistsAsync(string name, Guid? exceptId, CancellationToken ct);
    void Add(Account account);
    void Remove<T>(T child) where T : Entity;
    void AddChild<T>(T child) where T : Entity;
}

public interface IUserRepository
{
    Task<AppUser?> GetAsync(Guid id, CancellationToken ct);
    Task<AppUser?> GetByEmailAsync(string email, CancellationToken ct);
    Task<List<AppUser>> ListAsync(CancellationToken ct);
    Task<Dictionary<Guid, string>> NamesAsync(IEnumerable<Guid> ids, CancellationToken ct);
    void Add(AppUser user);
}

public interface IMasterDataRepository
{
    Task<List<Offering>> OfferingsAsync(CancellationToken ct);
    Task<List<StrategyOption>> StrategiesAsync(CancellationToken ct);
    Task<List<BrickwallCriterion>> CriteriaAsync(CancellationToken ct);
    Task<List<ChecklistQuestion>> QuestionsAsync(CancellationToken ct);
    Task<List<ScoringWeight>> WeightsAsync(CancellationToken ct);
    Task<List<AccountGroup>> GroupsAsync(CancellationToken ct);
    Task<T?> FindAsync<T>(Guid id, CancellationToken ct) where T : Entity;
    void Add<T>(T item) where T : Entity;
}

public sealed record ActionQuery(IReadOnlyCollection<Guid> AccountIds, ActionStatus? Status, Guid? OwnerId, bool OverdueOnly, DateOnly Today);

public interface IActionRepository
{
    Task<ActionItem?> GetAsync(Guid id, CancellationToken ct);
    Task<List<ActionItem>> ListAsync(ActionQuery query, CancellationToken ct);
    void Add(ActionItem item);
}

public interface IVersionRepository
{
    Task<List<PlanVersion>> ListAsync(Guid accountId, CancellationToken ct);
    Task<PlanVersion?> GetAsync(Guid accountId, int number, CancellationToken ct);
    Task<PlanVersion?> LatestAsync(Guid accountId, CancellationToken ct);
    Task<Dictionary<Guid, PlanVersion>> LatestForAsync(IReadOnlyCollection<Guid> accountIds, CancellationToken ct);
    void Add(PlanVersion version);
}

public interface IAiRepository
{
    Task<AiRecommendation?> GetRecommendationAsync(Guid id, CancellationToken ct);
    Task<List<AiRecommendation>> RecommendationsAsync(Guid accountId, CancellationToken ct);
    void Add(AiRecommendation rec);
    void Log(AiCallLog log);
    Task<List<AiCallLog>> CallLogsSinceAsync(DateTime sinceUtc, CancellationToken ct);
    void Add(AiEvaluation eval);
    Task<List<AiEvaluation>> LatestEvaluationsAsync(CancellationToken ct);
}

public interface ISecurityRepository
{
    void Add(AuditEvent e);
    Task<List<AuditEvent>> AuditAsync(DateTime sinceUtc, int take, CancellationToken ct);
    Task<List<SecurityFinding>> FindingsAsync(CancellationToken ct);
    Task<SecurityFinding?> FindingAsync(Guid id, CancellationToken ct);
    Task<bool> OpenFindingExistsAsync(string fingerprint, CancellationToken ct);
    void Add(SecurityFinding f);
    Task<int> RecentFailedLoginsAsync(string email, DateTime sinceUtc, CancellationToken ct);
}

public interface IImportRepository
{
    Task<ImportSession?> GetAsync(Guid id, CancellationToken ct);
    void Add(ImportSession session);
}

// ---------------- Excel (implemented with ClosedXML) ----------------

public sealed record WorkbookCell(string Address, int Row, int Column, string Value);

public sealed record WorkbookSheet(string Name, IReadOnlyList<WorkbookCell> Cells);

public sealed record WorkbookModel(IReadOnlyList<WorkbookSheet> Sheets);

public interface IWorkbookReader
{
    /// <summary>Reads non-empty cells. Throws <see cref="Common.ValidationException"/> for unreadable or oversized files.</summary>
    WorkbookModel Read(Stream xlsx, int maxCellsPerSheet);
}

public sealed record WorkbookTable(string SheetName, IReadOnlyList<string> Headers, IReadOnlyList<IReadOnlyList<object?>> Rows);

public interface IWorkbookWriter
{
    byte[] Write(IReadOnlyList<WorkbookTable> sheets);
}
