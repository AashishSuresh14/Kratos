using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Services;

/// <summary>Master data and user administration (AC 9). Everything here is configuration, no code changes.</summary>
public sealed class AdminService(
    IMasterDataRepository master, IUserRepository users, IUnitOfWork uow, AccessScope scope,
    IPasswordHasher hasher, IAuditService audit, ICurrentUser current)
{
    public async Task<MasterDataDto> GetMasterAsync(CancellationToken ct)
    {
        var groups = await master.GroupsAsync(ct);
        var names = await users.NamesAsync(groups.Select(g => g.LeadUserId), ct);
        var weights = (await master.WeightsAsync(ct)).ToDictionary(w => w.Key);
        return new MasterDataDto(
            (await master.OfferingsAsync(ct)).OrderBy(o => o.Name).Select(o => new OfferingDto(o.Id, o.Name, o.Category, o.IsActive)).ToList(),
            (await master.StrategiesAsync(ct)).OrderBy(s => s.Name).Select(s => new StrategyDto(s.Id, s.Name, s.Description, s.IsActive)).ToList(),
            (await master.CriteriaAsync(ct)).OrderBy(c => c.Category).ThenBy(c => c.Name).Select(c => new CriterionDto(c.Id, c.Name, c.Category, c.Weight, c.IsActive)).ToList(),
            (await master.QuestionsAsync(ct)).OrderBy(q => q.Weight).ThenBy(q => q.Text).Select(q => new QuestionDto(q.Id, q.Text, q.Weight, q.IsActive)).ToList(),
            groups.OrderBy(g => g.Name).Select(g => new GroupDto(g.Id, g.Name, g.LeadUserId, names.GetValueOrDefault(g.LeadUserId, "Unassigned"))).ToList(),
            WeightKeys.Defaults.Select(d => new WeightDto(d.Key, d.Value.Label, weights.TryGetValue(d.Key, out var w) ? w.Weight : d.Value.Weight)).ToList());
    }

    /// <summary>Create or update one master-data item. `kind` is the route segment; body is the item JSON.</summary>
    public async Task<object> UpsertAsync(string kind, Guid? id, JsonElement body, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        object result = kind switch
        {
            "offerings" => await Upsert<Offering, OfferingDto>(id, body, (e, d) =>
            {
                new Validator().Text(d.Name, "name", Limits.Name, true).Text(d.Category, "category", Limits.Name).ThrowIfInvalid();
                e.Name = d.Name.Trim(); e.Category = d.Category?.Trim() ?? ""; e.IsActive = d.IsActive;
            }, e => new OfferingDto(e.Id, e.Name, e.Category, e.IsActive), ct),
            "strategies" => await Upsert<StrategyOption, StrategyDto>(id, body, (e, d) =>
            {
                new Validator().Text(d.Name, "name", Limits.Name, true).Text(d.Description, "description", Limits.ShortText).ThrowIfInvalid();
                e.Name = d.Name.Trim(); e.Description = d.Description?.Trim() ?? ""; e.IsActive = d.IsActive;
            }, e => new StrategyDto(e.Id, e.Name, e.Description, e.IsActive), ct),
            "brickwallCriteria" => await Upsert<BrickwallCriterion, CriterionDto>(id, body, (e, d) =>
            {
                new Validator().Text(d.Name, "name", Limits.Name, true).Require(d.Weight is > 0 and <= 10, "weight", "Weight must be between 0 and 10.").ThrowIfInvalid();
                e.Name = d.Name.Trim(); e.Category = d.Category; e.Weight = d.Weight; e.IsActive = d.IsActive;
            }, e => new CriterionDto(e.Id, e.Name, e.Category, e.Weight, e.IsActive), ct),
            "checklistQuestions" => await Upsert<ChecklistQuestion, QuestionDto>(id, body, (e, d) =>
            {
                new Validator().Text(d.Text, "text", Limits.ShortText, true).ThrowIfInvalid();
                e.Text = d.Text.Trim(); e.Weight = d.Weight; e.IsActive = d.IsActive;
            }, e => new QuestionDto(e.Id, e.Text, e.Weight, e.IsActive), ct),
            _ => throw new NotFoundException("Master data type"),
        };
        await audit.RecordAsync($"master.{kind}.{(id is null ? "create" : "update")}", $"master/{kind}/{id}", AuditOutcome.Success, "", ct);
        return result;
    }

    private async Task<TDto> Upsert<TEntity, TDto>(Guid? id, JsonElement body, Action<TEntity, TDto> apply, Func<TEntity, TDto> map, CancellationToken ct)
        where TEntity : Entity, new()
    {
        TDto dto;
        try { dto = body.Deserialize<TDto>(Json.Options) ?? throw new ValidationException("body", "Request body is empty."); }
        catch (JsonException) { throw new ValidationException("body", "Request body is not valid for this item."); }
        TEntity entity;
        if (id is { } existing)
            entity = await master.FindAsync<TEntity>(existing, ct) ?? throw new NotFoundException("Item");
        else
        {
            entity = new TEntity();
            master.Add(entity);
        }
        apply(entity, dto);
        await uow.SaveChangesAsync(ct);
        return map(entity);
    }

    public async Task<List<WeightDto>> UpdateWeightsAsync(UpdateWeightsRequest req, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        var existing = (await master.WeightsAsync(ct)).ToDictionary(w => w.Key);
        foreach (var w in req.Weights ?? [])
        {
            if (!WeightKeys.Defaults.TryGetValue(w.Key, out var def)) throw new ValidationException("key", $"Unknown weight '{w.Key}'.");
            if (w.Weight is < 0 or > 100) throw new ValidationException("weight", "Weights must be between 0 and 100.");
            if (!existing.TryGetValue(w.Key, out var entity))
            {
                entity = new ScoringWeight { Key = w.Key, Label = def.Label };
                master.Add(entity);
                existing[w.Key] = entity;
            }
            entity.Weight = w.Weight;
        }
        var healthKeys = new[] { WeightKeys.HealthOpportunity, WeightKeys.HealthBrickwall, WeightKeys.HealthChecklist, WeightKeys.HealthPerception, WeightKeys.HealthCompletion };
        var healthSum = healthKeys.Sum(k => existing.TryGetValue(k, out var e) ? e.Weight : WeightKeys.Defaults[k].Weight);
        if (healthSum <= 0) throw new ValidationException("weights", "At least one health component needs a weight above zero.");
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("master.weights.update", "master/weights", AuditOutcome.Success, "", ct);
        return (await GetMasterAsync(ct)).ScoringWeights.ToList();
    }

    public async Task<List<AdminUserDto>> UsersAsync(CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        var groups = await master.GroupsAsync(ct);
        return (await users.ListAsync(ct)).OrderBy(u => u.DisplayName)
            .Select(u => new AdminUserDto(u.Id, u.Email, u.DisplayName, u.Role, groups.Where(g => g.LeadUserId == u.Id).Select(g => g.Id).ToList(), u.IsActive)).ToList();
    }

    public async Task<AdminUserDto> CreateUserAsync(CreateUserRequest r, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        var email = (r.Email ?? "").Trim().ToLowerInvariant();
        new Validator().Text(email, "email", 254, true).Require(email.Contains('@') && !email.StartsWith('@') && !email.EndsWith('@'), "email", "Enter a valid email.")
            .Text(r.DisplayName, "displayName", Limits.Name, true)
            .Require(PasswordPolicy.IsStrong(r.Password), "password", PasswordPolicy.Message).ThrowIfInvalid();
        if (await users.GetByEmailAsync(email, ct) is not null) throw new ConflictException("A user with this email already exists.");
        var u = new AppUser { Email = email, DisplayName = r.DisplayName.Trim(), Role = r.Role, PasswordHash = hasher.Hash(r.Password) };
        users.Add(u);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("user.create", $"user/{u.Id}", AuditOutcome.Success, r.Role.ToString(), ct);
        return new AdminUserDto(u.Id, u.Email, u.DisplayName, u.Role, [], u.IsActive);
    }

    public async Task<AdminUserDto> UpdateUserAsync(Guid id, UpdateUserRequest r, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        new Validator().Text(r.DisplayName, "displayName", Limits.Name, true).ThrowIfInvalid();
        var u = await users.GetAsync(id, ct) ?? throw new NotFoundException("User");
        if (u.Id == current.Id && (r.Role != Role.Admin || !r.IsActive))
            throw new ValidationException("role", "You cannot remove your own admin access or disable yourself.");
        var roleChanged = u.Role != r.Role;
        var old = u.Role;
        u.DisplayName = r.DisplayName.Trim(); u.Role = r.Role; u.IsActive = r.IsActive;
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync(roleChanged ? "user.role.change" : "user.update", $"user/{u.Id}", AuditOutcome.Success,
            roleChanged ? $"{old} -> {r.Role}" : "", ct);
        var groups = await master.GroupsAsync(ct);
        return new AdminUserDto(u.Id, u.Email, u.DisplayName, u.Role, groups.Where(g => g.LeadUserId == u.Id).Select(g => g.Id).ToList(), u.IsActive);
    }

    public async Task<GroupDto> UpsertGroupAsync(Guid? id, GroupRequest r, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin);
        new Validator().Text(r.Name, "name", Limits.Name, true).ThrowIfInvalid();
        var lead = await users.GetAsync(r.LeadUserId, ct);
        if (lead is not { IsActive: true, Role: Role.GroupLead }) throw new ValidationException("leadUserId", "The group lead must be an active user with the GroupLead role.");
        AccountGroup g;
        if (id is { } gid) g = await master.FindAsync<AccountGroup>(gid, ct) ?? throw new NotFoundException("Group");
        else { g = new AccountGroup(); master.Add(g); }
        g.Name = r.Name.Trim(); g.LeadUserId = r.LeadUserId;
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("group.upsert", $"group/{g.Id}", AuditOutcome.Success, "", ct);
        return new GroupDto(g.Id, g.Name, g.LeadUserId, lead.DisplayName);
    }
}

public static class PasswordPolicy
{
    public const string Message = "Use at least 12 characters with upper and lower case letters, a number and a symbol.";

    public static bool IsStrong(string? p) =>
        p is { Length: >= 12 and <= 256 } && p.Any(char.IsUpper) && p.Any(char.IsLower) && p.Any(char.IsDigit) && p.Any(c => !char.IsLetterOrDigit(c));
}
