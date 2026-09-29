using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Domain;

namespace Kratos.Application.Services;

public interface IAuditService
{
    Task RecordAsync(string action, string resource, AuditOutcome outcome, string detail = "", CancellationToken ct = default, string? emailOverride = null);
    Task DeniedAsync(string action, string resource, CancellationToken ct);
}

/// <summary>Audit events are written immediately so denied/failed attempts survive a rolled-back request.</summary>
public sealed class AuditService(ICurrentUser user, ISecurityRepository repo, IUnitOfWork uow, IClock clock) : IAuditService
{
    public async Task RecordAsync(string action, string resource, AuditOutcome outcome, string detail = "", CancellationToken ct = default, string? emailOverride = null)
    {
        repo.Add(new AuditEvent
        {
            At = clock.UtcNow,
            UserId = user.IsAuthenticated ? user.Id : null,
            UserEmail = emailOverride ?? (user.IsAuthenticated ? user.Email : "anonymous"),
            Action = action,
            Resource = resource,
            Outcome = outcome,
            Ip = user.Ip,
            Detail = detail.Length > 500 ? detail[..500] : detail,
        });
        await uow.SaveChangesAsync(ct);
    }

    public Task DeniedAsync(string action, string resource, CancellationToken ct) =>
        RecordAsync(action, resource, AuditOutcome.Denied, "", ct);
}

public sealed class AuthService(
    IUserRepository users, IMasterDataRepository master, IPasswordHasher hasher, ITokenIssuer tokens,
    ISecurityRepository security, IAuditService audit, IClock clock)
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan LockoutWindow = TimeSpan.FromMinutes(15);
    private const string GenericFailure = "The email or password is incorrect.";

    public async Task<LoginResponse> LoginAsync(LoginRequest req, CancellationToken ct)
    {
        var email = (req.Email ?? "").Trim().ToLowerInvariant();
        if (email.Length is 0 or > 254 || string.IsNullOrEmpty(req.Password) || req.Password.Length > 256)
            throw new ValidationException("email", "Enter your email and password.");

        var failures = await security.RecentFailedLoginsAsync(email, clock.UtcNow - LockoutWindow, ct);
        if (failures >= MaxFailures)
        {
            await audit.RecordAsync("auth.login", "auth", AuditOutcome.Denied, "locked out", ct, email);
            throw new TooManyRequestsException("Too many failed sign-in attempts. Try again in 15 minutes.");
        }

        var user = await users.GetByEmailAsync(email, ct);
        // Verify against a dummy hash when the user is unknown, so timing does not reveal which emails exist.
        var ok = user is { IsActive: true } ? hasher.Verify(user.PasswordHash, req.Password) : DummyVerify(req.Password);
        if (!ok || user is null)
        {
            await audit.RecordAsync("auth.login", "auth", AuditOutcome.Failed, "bad credentials", ct, email);
            throw new UnauthorizedAccessException(GenericFailure);
        }

        await audit.RecordAsync("auth.login", "auth", AuditOutcome.Success, "", ct, email);
        var (token, expires) = tokens.Issue(user);
        return new LoginResponse(token, expires, await ToDtoAsync(user, ct));
    }

    public async Task<UserDto> MeAsync(Guid userId, CancellationToken ct)
    {
        var user = await users.GetAsync(userId, ct) ?? throw new UnauthorizedAccessException("Your session has ended.");
        if (!user.IsActive) throw new UnauthorizedAccessException("Your account is disabled.");
        return await ToDtoAsync(user, ct);
    }

    private async Task<UserDto> ToDtoAsync(AppUser u, CancellationToken ct)
    {
        var groups = (await master.GroupsAsync(ct)).Where(g => g.LeadUserId == u.Id).Select(g => g.Id).ToList();
        return new UserDto(u.Id, u.Email, u.DisplayName, u.Role, groups);
    }

    private static string? _dummyHash;
    private bool DummyVerify(string password)
    {
        _dummyHash ??= hasher.Hash(Guid.NewGuid().ToString());
        hasher.Verify(_dummyHash, password);
        return false;
    }
}
