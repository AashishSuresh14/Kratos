using Kratos.Application.Abstractions;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Services;

public sealed class AccountService(
    IAccountRepository accounts, IUserRepository users, IMasterDataRepository master, IUnitOfWork uow,
    AccessScope scope, ScoringService scoring, ICurrentUser user, IAuditService audit, IClock clock)
{
    // ---------------- Reads ----------------

    public async Task<List<AccountSummaryDto>> ListAsync(AccountType? type, Guid? groupId, string? search, CancellationToken ct)
    {
        var ids = await scope.VisibleAccountIdsAsync(ct);
        var list = await accounts.ListAsync(ids, ct);
        IEnumerable<Account> q = list;
        if (type is { } t) q = q.Where(a => a.Type == t);
        if (groupId is { } g) q = q.Where(a => a.GroupId == g);
        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim();
            q = q.Where(a => a.Name.Contains(s, StringComparison.OrdinalIgnoreCase) || a.Industry.Contains(s, StringComparison.OrdinalIgnoreCase));
        }
        var summaries = await scoring.SummariesAsync(q.OrderBy(a => a.Name).ToList(), ct);
        if (!scope.CanReadPlanContent)
        {
            // Admin gets metadata only: blank out plan-derived numbers.
            summaries = summaries.Select(x => x with { Health = 0, Completion = 0, OverdueActions = 0, StaleSections = 0, RiskLevel = RiskLevel.Low }).ToList();
        }
        return summaries;
    }

    public async Task<AccountPlanDto> GetPlanAsync(Guid id, CancellationToken ct)
    {
        await scope.EnsureCanReadPlanAsync(id, ct);
        var a = await accounts.GetAsync(id, ct) ?? throw new NotFoundException("Account");
        return await ToPlanAsync(a, ct);
    }

    public async Task<Account> LoadForEditAsync(Guid id, string? rowVersion, CancellationToken ct)
    {
        await scope.EnsureCanEditAsync(id, ct);
        var a = await accounts.GetAsync(id, ct) ?? throw new NotFoundException("Account");
        if (rowVersion is not null && !string.Equals(rowVersion, a.RowVersion.ToString(), StringComparison.OrdinalIgnoreCase))
            throw new ConflictException("Someone else changed this plan since you opened it. Reload to see their changes.");
        return a;
    }

    public async Task<AccountPlanDto> ToPlanAsync(Account a, CancellationToken ct)
    {
        var s = await scoring.ScoreAsync(a, ct);
        var ctx = await scoring.ContextAsync(ct);
        var names = await users.NamesAsync(a.Team.Select(t => t.UserId).Concat(a.Actions.Select(x => x.OwnerId)).Append(a.CaptainId), ct);
        var today = DateOnly.FromDateTime(clock.UtcNow);

        var opps = new List<OpportunityDto>();
        foreach (var o in a.Opportunities.OrderByDescending(o => o.IsPriority).ThenBy(o => o.Title))
            opps.Add(new OpportunityDto(o.Id, o.Title, o.OfferingId, await scoring.OfferingNameAsync(o.OfferingId, ct), o.Potential, o.Effort,
                o.Complexity, o.EstimatedValue, o.IsPriority, ScoringEngine.OpportunityScore(o, ctx)));

        var brickwall = ctx.Criteria.Select(c =>
        {
            var r = a.Brickwall.FirstOrDefault(b => b.CriterionId == c.Id);
            return new BrickwallDto(c.Id, r?.Score, r?.Note ?? "");
        }).ToList();

        var tactical = a.Opportunities.Where(o => o.IsPriority).Select(o => new TacticalDto(o.Id,
            ctx.Questions.Select(q => new ChecklistAnswerDto(q.Id,
                a.Checklist.FirstOrDefault(r => r.OpportunityId == o.Id && r.QuestionId == q.Id)?.Answer)).ToList())).ToList();

        return new AccountPlanDto(
            await scoring.SummaryAsync(a, s, ct),
            a.RowVersion.ToString(),
            await scope.CanEditAsync(a.Id, ct),
            ScoringEngine.Sections(a, ctx).Select(x => new SectionDto(x.Key, x.Code, x.Title, x.Completion, x.UpdatedAt, x.IsStale)).ToList(),
            new ProfileDto(a.AccountSince, a.CurrentRunRate, "USD", a.CxoConnect, a.Challenges, a.CurrentOfferingIds, a.AspirationalOfferingIds, a.ReviewCadenceDays),
            a.Team.Select(t => new TeamMemberDto(t.UserId, names.GetValueOrDefault(t.UserId, "Unknown user"), t.Raci, t.Responsibility)).ToList(),
            new InfobaseDto(a.Unknowns, a.KnownUnconfirmed, a.GrowthLevers),
            a.Stakeholders.OrderBy(x => x.Importance).ThenBy(x => x.Name).Select(ToDto).ToList(),
            new VisionDto(a.VisionThreeYear, a.VisionOneYear, a.Objectives),
            a.StrategyIds,
            opps,
            brickwall,
            tactical,
            a.Resources.Select(r => new ResourceDto(r.Id, r.Type, r.Description, r.Amount)).ToList(),
            a.Actions.OrderBy(x => x.DueDate).Select(x => ActionService.ToDto(x, a.Name, names, today)).ToList(),
            ScoresDto.From(s));
    }

    // ---------------- Create ----------------

    public async Task<AccountSummaryDto> CreateAsync(CreateAccountRequest req, CancellationToken ct)
    {
        scope.EnsureRole(Role.Admin, Role.GroupLead);
        new Validator()
            .Text(req.Name, "name", Limits.Name, required: true)
            .Text(req.Industry, "industry", Limits.Name)
            .Text(req.Region, "region", Limits.Name)
            .ThrowIfInvalid();
        var group = await master.FindAsync<AccountGroup>(req.GroupId, ct) ?? throw new ValidationException("groupId", "Choose an existing group.");
        if (user.Role == Role.GroupLead && group.LeadUserId != user.Id)
            throw new ForbiddenException("You can only create accounts in groups you lead.");
        var captain = await users.GetAsync(req.CaptainId, ct);
        if (captain is not { IsActive: true } || captain.Role is Role.Admin)
            throw new ValidationException("captainId", "Choose an active account manager or group lead as captain.");
        if (await accounts.NameExistsAsync(req.Name.Trim(), null, ct))
            throw new ConflictException("An account with this name already exists.");

        var a = new Account
        {
            Name = req.Name.Trim(), Industry = req.Industry?.Trim() ?? "", Region = req.Region?.Trim() ?? "",
            Type = req.Type, GroupId = req.GroupId, CaptainId = req.CaptainId,
        };
        a.Team.Add(new TeamMember { AccountId = a.Id, UserId = captain.Id, Raci = Raci.A, Responsibility = "Account captain" });
        accounts.Add(a);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync("account.create", $"account/{a.Id}", AuditOutcome.Success, a.Name, ct);
        return await scoring.SummaryAsync(a, await scoring.ScoreAsync(a, ct), ct);
    }

    // ---------------- Section writes ----------------

    public async Task<AccountPlanDto> UpdateProfileAsync(Guid id, UpdateProfileRequest r, CancellationToken ct)
    {
        var v = new Validator()
            .Text(r.CxoConnect, "cxoConnect", Limits.LongText)
            .Text(r.Challenges, "challenges", Limits.LongText)
            .Require(r.CurrentRunRate is null or >= 0, "currentRunRate", "Run rate cannot be negative.")
            .Range(r.ReviewCadenceDays, "reviewCadenceDays", 7, 365)
            .Require(r.AccountSince is null || r.AccountSince <= DateOnly.FromDateTime(clock.UtcNow), "accountSince", "Account start date cannot be in the future.");
        v.ThrowIfInvalid();
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        var offerings = (await master.OfferingsAsync(ct)).Select(o => o.Id).ToHashSet();
        EnsureKnown(r.CurrentOfferingIds, offerings, "currentOfferingIds");
        EnsureKnown(r.AspirationalOfferingIds, offerings, "aspirationalOfferingIds");

        a.AccountSince = r.AccountSince;
        a.CurrentRunRate = r.CurrentRunRate;
        a.CxoConnect = r.CxoConnect?.Trim() ?? "";
        a.Challenges = r.Challenges?.Trim() ?? "";
        a.CurrentOfferingIds = r.CurrentOfferingIds?.Distinct().ToList() ?? [];
        a.AspirationalOfferingIds = r.AspirationalOfferingIds?.Distinct().Except(a.CurrentOfferingIds).ToList() ?? [];
        if (r.ReviewCadenceDays is { } days) a.ReviewCadenceDays = days;
        return await SaveAsync(a, SectionKey.Profile, ct);
    }

    public async Task<AccountPlanDto> UpdateTeamAsync(Guid id, UpdateTeamRequest r, CancellationToken ct)
    {
        var members = r.Members ?? [];
        var v = new Validator()
            .Require(members.Count <= 30, "members", "A team can have at most 30 members.")
            .Require(members.Select(m => m.UserId).Distinct().Count() == members.Count, "members", "Each person can appear only once.")
            .Require(members.Count(m => m.Raci == Raci.A) <= 1, "members", "Only one person can be Accountable (A).");
        foreach (var m in members) v.Text(m.Responsibility, "responsibility", Limits.ShortText);
        v.ThrowIfInvalid();
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        foreach (var m in members)
        {
            var u = await users.GetAsync(m.UserId, ct);
            if (u is not { IsActive: true } || u.Role == Role.Admin)
                throw new ValidationException("members", "Every team member must be an active account manager, group lead or executive.");
        }
        foreach (var old in a.Team.ToList()) { a.Team.Remove(old); accounts.Remove(old); }
        foreach (var m in members)
        {
            var t = new TeamMember { AccountId = a.Id, UserId = m.UserId, Raci = m.Raci, Responsibility = m.Responsibility?.Trim() ?? "" };
            a.Team.Add(t);
            accounts.AddChild(t);
        }
        // Captain always stays on the team so they never lose access to their own account.
        if (a.Team.All(t => t.UserId != a.CaptainId))
        {
            var t = new TeamMember { AccountId = a.Id, UserId = a.CaptainId, Raci = a.Team.Any(x => x.Raci == Raci.A) ? Raci.R : Raci.A, Responsibility = "Account captain" };
            a.Team.Add(t);
            accounts.AddChild(t);
        }
        return await SaveAsync(a, SectionKey.Profile, ct);
    }

    public async Task<AccountPlanDto> UpdateInfobaseAsync(Guid id, UpdateInfobaseRequest r, CancellationToken ct)
    {
        new Validator().Text(r.Unknowns, "unknowns", Limits.LongText).Text(r.KnownUnconfirmed, "knownUnconfirmed", Limits.LongText)
            .Text(r.GrowthLevers, "growthLevers", Limits.LongText).ThrowIfInvalid();
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        a.Unknowns = r.Unknowns?.Trim() ?? "";
        a.KnownUnconfirmed = r.KnownUnconfirmed?.Trim() ?? "";
        a.GrowthLevers = r.GrowthLevers?.Trim() ?? "";
        return await SaveAsync(a, SectionKey.Infobase, ct);
    }

    public async Task<AccountPlanDto> UpdateVisionAsync(Guid id, UpdateVisionRequest r, CancellationToken ct)
    {
        var objectives = (r.Objectives ?? []).Select(o => o?.Trim() ?? "").Where(o => o.Length > 0).ToList();
        var v = new Validator().Text(r.ThreeYear, "threeYear", Limits.LongText).Text(r.OneYear, "oneYear", Limits.LongText)
            .Require(objectives.Count <= Limits.MaxObjectives, "objectives", $"At most {Limits.MaxObjectives} objectives.");
        foreach (var o in objectives) v.Text(o, "objectives", Limits.ShortText);
        v.ThrowIfInvalid();
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        a.VisionThreeYear = r.ThreeYear?.Trim() ?? "";
        a.VisionOneYear = r.OneYear?.Trim() ?? "";
        a.Objectives = objectives;
        return await SaveAsync(a, SectionKey.Vision, ct);
    }

    public async Task<AccountPlanDto> UpdateStrategiesAsync(Guid id, UpdateStrategiesRequest r, CancellationToken ct)
    {
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        var known = (await master.StrategiesAsync(ct)).Where(s => s.IsActive).Select(s => s.Id).ToHashSet();
        EnsureKnown(r.StrategyIds, known, "strategyIds");
        a.StrategyIds = r.StrategyIds?.Distinct().ToList() ?? [];
        return await SaveAsync(a, SectionKey.Strategy, ct);
    }

    public async Task<AccountPlanDto> UpdateBrickwallAsync(Guid id, UpdateBrickwallRequest r, CancellationToken ct)
    {
        var v = new Validator();
        foreach (var x in r.Ratings ?? []) v.Range(x.Score, "score", 1, 5).Text(x.Note, "note", Limits.ShortText);
        v.ThrowIfInvalid();
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        var known = (await master.CriteriaAsync(ct)).Select(c => c.Id).ToHashSet();
        foreach (var x in r.Ratings ?? [])
        {
            if (!known.Contains(x.CriterionId)) throw new ValidationException("criterionId", "Unknown brickwall criterion.");
            var existing = a.Brickwall.FirstOrDefault(b => b.CriterionId == x.CriterionId);
            if (existing is null)
            {
                existing = new BrickwallRating { AccountId = a.Id, CriterionId = x.CriterionId };
                a.Brickwall.Add(existing);
                accounts.AddChild(existing);
            }
            existing.Score = x.Score;
            existing.Note = x.Note?.Trim() ?? "";
        }
        return await SaveAsync(a, SectionKey.Brickwall, ct);
    }

    public async Task<AccountPlanDto> UpdateTacticalAsync(Guid id, UpdateTacticalRequest r, CancellationToken ct)
    {
        var a = await LoadForEditAsync(id, r.RowVersion, ct);
        var questions = (await master.QuestionsAsync(ct)).Select(q => q.Id).ToHashSet();
        foreach (var item in r.Items ?? [])
        {
            var opp = a.Opportunities.FirstOrDefault(o => o.Id == item.OpportunityId)
                      ?? throw new ValidationException("opportunityId", "The checklist refers to an opportunity that is not on this account.");
            if (!opp.IsPriority) throw new ValidationException("opportunityId", "The tactical checklist applies to priority opportunities only.");
            foreach (var ans in item.Answers ?? [])
            {
                if (!questions.Contains(ans.QuestionId)) throw new ValidationException("questionId", "Unknown checklist question.");
                var existing = a.Checklist.FirstOrDefault(c => c.OpportunityId == opp.Id && c.QuestionId == ans.QuestionId);
                if (existing is null)
                {
                    existing = new ChecklistResponse { AccountId = a.Id, OpportunityId = opp.Id, QuestionId = ans.QuestionId };
                    a.Checklist.Add(existing);
                    accounts.AddChild(existing);
                }
                existing.Answer = ans.Answer;
            }
        }
        return await SaveAsync(a, SectionKey.Tactical, ct);
    }

    // ---------------- Child collections ----------------

    public async Task<AccountPlanDto> AddStakeholderAsync(Guid id, StakeholderInput input, CancellationToken ct)
    {
        Validate(input);
        var a = await LoadForEditAsync(id, null, ct);
        if (a.Stakeholders.Count >= 200) throw new ValidationException("stakeholders", "An account can have at most 200 stakeholders.");
        var s = new Stakeholder { AccountId = a.Id };
        Apply(s, input);
        a.Stakeholders.Add(s);
        accounts.AddChild(s);
        return await SaveAsync(a, SectionKey.Stakeholders, ct);
    }

    public async Task<AccountPlanDto> UpdateStakeholderAsync(Guid id, Guid sid, StakeholderInput input, CancellationToken ct)
    {
        Validate(input);
        var a = await LoadForEditAsync(id, null, ct);
        var s = a.Stakeholders.FirstOrDefault(x => x.Id == sid) ?? throw new NotFoundException("Stakeholder");
        Apply(s, input);
        return await SaveAsync(a, SectionKey.Stakeholders, ct);
    }

    public async Task<AccountPlanDto> DeleteStakeholderAsync(Guid id, Guid sid, CancellationToken ct)
    {
        var a = await LoadForEditAsync(id, null, ct);
        var s = a.Stakeholders.FirstOrDefault(x => x.Id == sid) ?? throw new NotFoundException("Stakeholder");
        a.Stakeholders.Remove(s);
        accounts.Remove(s);
        return await SaveAsync(a, SectionKey.Stakeholders, ct);
    }

    public async Task<AccountPlanDto> AddOpportunityAsync(Guid id, OpportunityInput input, CancellationToken ct)
    {
        await ValidateAsync(input, ct);
        var a = await LoadForEditAsync(id, null, ct);
        if (a.Opportunities.Count >= 100) throw new ValidationException("opportunities", "An account can have at most 100 opportunities.");
        var o = new Opportunity { AccountId = a.Id };
        Apply(o, input);
        a.Opportunities.Add(o);
        accounts.AddChild(o);
        return await SaveAsync(a, SectionKey.Opportunities, ct);
    }

    public async Task<AccountPlanDto> UpdateOpportunityAsync(Guid id, Guid oid, OpportunityInput input, CancellationToken ct)
    {
        await ValidateAsync(input, ct);
        var a = await LoadForEditAsync(id, null, ct);
        var o = a.Opportunities.FirstOrDefault(x => x.Id == oid) ?? throw new NotFoundException("Opportunity");
        Apply(o, input);
        return await SaveAsync(a, SectionKey.Opportunities, ct);
    }

    public async Task<AccountPlanDto> DeleteOpportunityAsync(Guid id, Guid oid, CancellationToken ct)
    {
        var a = await LoadForEditAsync(id, null, ct);
        var o = a.Opportunities.FirstOrDefault(x => x.Id == oid) ?? throw new NotFoundException("Opportunity");
        // Edge case: keep linked actions but detach them, and drop checklist answers for this opportunity.
        foreach (var act in a.Actions.Where(x => x.OpportunityId == oid)) act.OpportunityId = null;
        foreach (var c in a.Checklist.Where(c => c.OpportunityId == oid).ToList()) { a.Checklist.Remove(c); accounts.Remove(c); }
        a.Opportunities.Remove(o);
        accounts.Remove(o);
        return await SaveAsync(a, SectionKey.Opportunities, ct);
    }

    public async Task<AccountPlanDto> AddResourceAsync(Guid id, ResourceInput input, CancellationToken ct)
    {
        Validate(input);
        var a = await LoadForEditAsync(id, null, ct);
        var r = new ResourceNeed { AccountId = a.Id, Type = input.Type, Description = input.Description.Trim(), Amount = input.Amount };
        a.Resources.Add(r);
        accounts.AddChild(r);
        return await SaveAsync(a, SectionKey.Resources, ct);
    }

    public async Task<AccountPlanDto> UpdateResourceAsync(Guid id, Guid rid, ResourceInput input, CancellationToken ct)
    {
        Validate(input);
        var a = await LoadForEditAsync(id, null, ct);
        var r = a.Resources.FirstOrDefault(x => x.Id == rid) ?? throw new NotFoundException("Resource");
        r.Type = input.Type; r.Description = input.Description.Trim(); r.Amount = input.Amount;
        return await SaveAsync(a, SectionKey.Resources, ct);
    }

    public async Task<AccountPlanDto> DeleteResourceAsync(Guid id, Guid rid, CancellationToken ct)
    {
        var a = await LoadForEditAsync(id, null, ct);
        var r = a.Resources.FirstOrDefault(x => x.Id == rid) ?? throw new NotFoundException("Resource");
        a.Resources.Remove(r);
        accounts.Remove(r);
        return await SaveAsync(a, SectionKey.Resources, ct);
    }

    // ---------------- Helpers ----------------

    private async Task<AccountPlanDto> SaveAsync(Account a, SectionKey section, CancellationToken ct)
    {
        a.Touch(section, clock.UtcNow);
        await uow.SaveChangesAsync(ct);
        await audit.RecordAsync($"plan.update.{section}", $"account/{a.Id}", AuditOutcome.Success, "", ct);
        return await ToPlanAsync(a, ct);
    }

    private static void EnsureKnown(IReadOnlyList<Guid>? ids, HashSet<Guid> known, string field)
    {
        if (ids is null) return;
        if (ids.Count > 50) throw new ValidationException(field, "Too many items selected.");
        if (ids.Any(i => !known.Contains(i))) throw new ValidationException(field, "One or more selected items no longer exist.");
    }

    private static void Validate(StakeholderInput i) => new Validator()
        .Text(i.Name, "name", Limits.Name, required: true).Text(i.Title, "title", Limits.Name)
        .Text(i.BuyingMotive, "buyingMotive", Limits.ShortText).Text(i.PerceptionVsCompetitors, "perceptionVsCompetitors", Limits.ShortText)
        .Text(i.Notes, "notes", Limits.LongText).Range(i.Perception, "perception", 1, 5).ThrowIfInvalid();

    private async Task ValidateAsync(OpportunityInput i, CancellationToken ct)
    {
        new Validator().Text(i.Title, "title", Limits.Name, required: true)
            .Range(i.Potential, "potential", 1, 5, true).Range(i.Effort, "effort", 1, 5, true).Range(i.Complexity, "complexity", 1, 5, true)
            .Require(i.EstimatedValue is null or >= 0, "estimatedValue", "Value cannot be negative.").ThrowIfInvalid();
        if (await master.FindAsync<Offering>(i.OfferingId, ct) is not { IsActive: true })
            throw new ValidationException("offeringId", "Choose an active Psiog offering.");
    }

    private static void Validate(ResourceInput i) => new Validator().Text(i.Description, "description", Limits.ShortText, required: true)
        .Require(i.Amount is null or >= 0, "amount", "Amount cannot be negative.").ThrowIfInvalid();

    private static void Apply(Stakeholder s, StakeholderInput i)
    {
        s.Name = i.Name.Trim(); s.Title = i.Title?.Trim() ?? ""; s.Role = i.Role; s.Importance = i.Importance;
        s.BuyingMotive = i.BuyingMotive?.Trim() ?? ""; s.Perception = i.Perception;
        s.PerceptionVsCompetitors = i.PerceptionVsCompetitors?.Trim() ?? ""; s.Knowledge = i.Knowledge; s.Notes = i.Notes?.Trim() ?? "";
    }

    private static void Apply(Opportunity o, OpportunityInput i)
    {
        o.Title = i.Title.Trim(); o.OfferingId = i.OfferingId; o.Potential = i.Potential; o.Effort = i.Effort;
        o.Complexity = i.Complexity; o.EstimatedValue = i.EstimatedValue; o.IsPriority = i.IsPriority;
    }

    private static StakeholderDto ToDto(Stakeholder s) => new(s.Id, s.Name, s.Title, s.Role, s.Importance, s.BuyingMotive,
        s.Perception, s.PerceptionVsCompetitors, s.Knowledge, s.Notes);
}
