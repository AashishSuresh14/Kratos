using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Contracts;
using Kratos.Domain;
using Kratos.Domain.Scoring;

namespace Kratos.Application.Services;

/// <summary>Loads master data once per request and turns accounts into scored summaries.</summary>
public sealed class ScoringService(IMasterDataRepository master, IUserRepository users, IVersionRepository versions, IClock clock)
{
    private ScoringContext? _ctx;
    private Dictionary<Guid, string>? _groupNames;
    private Dictionary<Guid, string>? _offeringNames;

    public async Task<ScoringContext> ContextAsync(CancellationToken ct, decimal? previousHealth = null)
    {
        if (_ctx is null)
        {
            var criteria = (await master.CriteriaAsync(ct)).Where(c => c.IsActive).ToList();
            var questions = (await master.QuestionsAsync(ct)).Where(q => q.IsActive).ToList();
            var weights = (await master.WeightsAsync(ct)).ToDictionary(w => w.Key, w => w.Weight);
            _ctx = new ScoringContext(criteria, questions, weights, clock.UtcNow);
        }
        return previousHealth is null ? _ctx : _ctx with { PreviousHealth = previousHealth };
    }

    public async Task<Scores> ScoreAsync(Account a, CancellationToken ct, PlanVersion? latest = null)
    {
        latest ??= await versions.LatestAsync(a.Id, ct);
        return ScoringEngine.Calculate(a, await ContextAsync(ct, PreviousHealth(latest)));
    }

    public static decimal? PreviousHealth(PlanVersion? v)
    {
        if (v is null) return null;
        try { return JsonSerializer.Deserialize<ScoresDto>(v.ScoresJson, Json.Options)?.Health; }
        catch (JsonException) { return null; }
    }

    public async Task<string> OfferingNameAsync(Guid id, CancellationToken ct)
    {
        _offeringNames ??= (await master.OfferingsAsync(ct)).ToDictionary(o => o.Id, o => o.Name);
        return _offeringNames.GetValueOrDefault(id, "Unknown offering");
    }

    public async Task<List<AccountSummaryDto>> SummariesAsync(IReadOnlyList<Account> list, CancellationToken ct)
    {
        _groupNames ??= (await master.GroupsAsync(ct)).ToDictionary(g => g.Id, g => g.Name);
        var names = await users.NamesAsync(list.Select(a => a.CaptainId), ct);
        var latest = await versions.LatestForAsync(list.Select(a => a.Id).ToList(), ct);
        var result = new List<AccountSummaryDto>(list.Count);
        foreach (var a in list)
        {
            var ctx = await ContextAsync(ct, PreviousHealth(latest.GetValueOrDefault(a.Id)));
            result.Add(Summary(a, ScoringEngine.Calculate(a, ctx), ctx, _groupNames, names));
        }
        return result;
    }

    public async Task<AccountSummaryDto> SummaryAsync(Account a, Scores s, CancellationToken ct)
    {
        _groupNames ??= (await master.GroupsAsync(ct)).ToDictionary(g => g.Id, g => g.Name);
        var names = await users.NamesAsync([a.CaptainId], ct);
        return Summary(a, s, await ContextAsync(ct), _groupNames, names);
    }

    private static AccountSummaryDto Summary(Account a, Scores s, ScoringContext ctx, IReadOnlyDictionary<Guid, string> groups, IReadOnlyDictionary<Guid, string> names)
    {
        var today = DateOnly.FromDateTime(ctx.NowUtc);
        var sections = ScoringEngine.Sections(a, ctx);
        return new AccountSummaryDto(a.Id, a.Name, a.Industry, a.Region, a.Type, a.GroupId, groups.GetValueOrDefault(a.GroupId, "Unassigned"),
            a.CaptainId, names.GetValueOrDefault(a.CaptainId, "Unassigned"), s.Health, s.RiskLevel, s.Completion,
            a.Actions.Count(x => x.IsOverdue(today)), sections.Count(x => x.IsStale), a.LastReviewedAt, a.CurrentVersion);
    }
}

public static class Json
{
    public static readonly JsonSerializerOptions Options = CreateOptions();

    private static JsonSerializerOptions CreateOptions()
    {
        var o = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        o.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter<SectionKey>(JsonNamingPolicy.CamelCase));
        o.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
        return o;
    }
}
