using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Domain;

namespace Kratos.Application.Services;

/// <summary>
/// Single place that decides which accounts a user may see and change (AC 10, least privilege).
/// Admin sees account metadata only; plan content is never exposed to Admin.
/// </summary>
public sealed class AccessScope(ICurrentUser user, IAccountRepository accounts, IMasterDataRepository master, IAuditService audit)
{
    private IReadOnlyList<Guid>? _visible;
    private HashSet<Guid>? _editable;

    public async Task<IReadOnlyList<Guid>> VisibleAccountIdsAsync(CancellationToken ct)
    {
        if (_visible is not null) return _visible;
        await LoadAsync(ct);
        return _visible!;
    }

    public async Task<bool> CanEditAsync(Guid accountId, CancellationToken ct)
    {
        if (_editable is null) await LoadAsync(ct);
        return _editable!.Contains(accountId);
    }

    public bool CanReadPlanContent => user.Role is not Role.Admin;

    /// <summary>Throws NotFound (not Forbidden) for invisible accounts so their existence does not leak.</summary>
    public async Task EnsureCanViewAsync(Guid accountId, CancellationToken ct)
    {
        if (!(await VisibleAccountIdsAsync(ct)).Contains(accountId))
        {
            await audit.DeniedAsync("account.view", $"account/{accountId}", ct);
            throw new NotFoundException("Account");
        }
    }

    public async Task EnsureCanReadPlanAsync(Guid accountId, CancellationToken ct)
    {
        await EnsureCanViewAsync(accountId, ct);
        if (!CanReadPlanContent)
        {
            await audit.DeniedAsync("plan.read", $"account/{accountId}", ct);
            throw new ForbiddenException("Admins manage configuration and cannot open account plans.");
        }
    }

    public async Task EnsureCanEditAsync(Guid accountId, CancellationToken ct)
    {
        await EnsureCanViewAsync(accountId, ct);
        if (!await CanEditAsync(accountId, ct))
        {
            await audit.DeniedAsync("plan.edit", $"account/{accountId}", ct);
            throw new ForbiddenException("You can view this account but not change it.");
        }
    }

    public void EnsureRole(params Role[] roles)
    {
        if (!roles.Contains(user.Role)) throw new ForbiddenException();
    }

    private async Task LoadAsync(CancellationToken ct)
    {
        var rows = await accounts.ListScopeRowsAsync(ct);
        List<AccountScopeRow> visible;
        List<AccountScopeRow> editable;
        switch (user.Role)
        {
            case Role.Admin:
            case Role.Executive:
                visible = rows;
                editable = [];
                break;
            case Role.GroupLead:
            {
                var groups = (await master.GroupsAsync(ct)).Where(g => g.LeadUserId == user.Id).Select(g => g.Id).ToHashSet();
                visible = rows.Where(r => groups.Contains(r.GroupId) || IsMember(r)).ToList();
                editable = visible;
                break;
            }
            default:
                visible = rows.Where(IsMember).ToList();
                editable = visible;
                break;
        }
        _visible = visible.Select(r => r.Id).ToList();
        _editable = editable.Select(r => r.Id).ToHashSet();
    }

    private bool IsMember(AccountScopeRow r) => r.CaptainId == user.Id || r.TeamUserIds.Contains(user.Id);
}
