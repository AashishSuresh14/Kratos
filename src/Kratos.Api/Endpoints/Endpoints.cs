using System.Text.Json;
using Kratos.Application.Abstractions;
using Kratos.Application.Ai;
using Kratos.Application.Contracts;
using Kratos.Application.Services;
using Kratos.Domain;
using Microsoft.AspNetCore.Mvc;

namespace Kratos.Api.Endpoints;

public static class Endpoints
{
    private const string Xlsx = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    public static void MapKratos(this WebApplication app)
    {
        var api = app.MapGroup("/api/v1").RequireAuthorization();

        // ---- Auth ----
        api.MapPost("/auth/login", (LoginRequest req, AuthService auth, CancellationToken ct) => auth.LoginAsync(req, ct))
            .AllowAnonymous().RequireRateLimiting("auth").WithTags("Auth");
        api.MapGet("/auth/me", (ICurrentUser u, AuthService auth, CancellationToken ct) => auth.MeAsync(u.Id, ct)).WithTags("Auth");

        // ---- Master data and admin (AC 9) ----
        api.MapGet("/master", (AdminService s, CancellationToken ct) => s.GetMasterAsync(ct)).WithTags("Master data");
        var admin = api.MapGroup("/admin").RequireAuthorization(Policies.Admin).WithTags("Admin");
        admin.MapPost("/master/{kind}", (string kind, JsonElement body, AdminService s, CancellationToken ct) => s.UpsertAsync(kind, null, body, ct));
        admin.MapPut("/master/{kind}/{id:guid}", (string kind, Guid id, JsonElement body, AdminService s, CancellationToken ct) => s.UpsertAsync(kind, id, body, ct));
        admin.MapPut("/scoring-weights", (UpdateWeightsRequest r, AdminService s, CancellationToken ct) => s.UpdateWeightsAsync(r, ct));
        admin.MapGet("/users", (AdminService s, CancellationToken ct) => s.UsersAsync(ct));
        admin.MapPost("/users", (CreateUserRequest r, AdminService s, CancellationToken ct) => s.CreateUserAsync(r, ct));
        admin.MapPut("/users/{id:guid}", (Guid id, UpdateUserRequest r, AdminService s, CancellationToken ct) => s.UpdateUserAsync(id, r, ct));
        admin.MapPost("/groups", (GroupRequest r, AdminService s, CancellationToken ct) => s.UpsertGroupAsync(null, r, ct));
        admin.MapPost("/reporting/refresh", async (ReportingService s, CancellationToken ct) => Results.Ok(new { rows = await s.RefreshAsync(ct) }));
        admin.MapPut("/groups/{id:guid}", (Guid id, GroupRequest r, AdminService s, CancellationToken ct) => s.UpsertGroupAsync(id, r, ct));

        // ---- Accounts and plan sections (AC 1) ----
        var acc = api.MapGroup("/accounts").WithTags("Accounts");
        acc.MapGet("/", (AccountType? type, Guid? groupId, string? search, AccountService s, CancellationToken ct) => s.ListAsync(type, groupId, search, ct));
        acc.MapPost("/", (CreateAccountRequest r, AccountService s, CancellationToken ct) => s.CreateAsync(r, ct));
        acc.MapGet("/{id:guid}", (Guid id, AccountService s, CancellationToken ct) => s.GetPlanAsync(id, ct));
        acc.MapPut("/{id:guid}/profile", (Guid id, UpdateProfileRequest r, AccountService s, CancellationToken ct) => s.UpdateProfileAsync(id, r, ct));
        acc.MapPut("/{id:guid}/team", (Guid id, UpdateTeamRequest r, AccountService s, CancellationToken ct) => s.UpdateTeamAsync(id, r, ct));
        acc.MapPut("/{id:guid}/infobase", (Guid id, UpdateInfobaseRequest r, AccountService s, CancellationToken ct) => s.UpdateInfobaseAsync(id, r, ct));
        acc.MapPut("/{id:guid}/vision", (Guid id, UpdateVisionRequest r, AccountService s, CancellationToken ct) => s.UpdateVisionAsync(id, r, ct));
        acc.MapPut("/{id:guid}/strategies", (Guid id, UpdateStrategiesRequest r, AccountService s, CancellationToken ct) => s.UpdateStrategiesAsync(id, r, ct));
        acc.MapPut("/{id:guid}/brickwall", (Guid id, UpdateBrickwallRequest r, AccountService s, CancellationToken ct) => s.UpdateBrickwallAsync(id, r, ct));
        acc.MapPut("/{id:guid}/tactical", (Guid id, UpdateTacticalRequest r, AccountService s, CancellationToken ct) => s.UpdateTacticalAsync(id, r, ct));
        acc.MapPost("/{id:guid}/stakeholders", (Guid id, StakeholderInput r, AccountService s, CancellationToken ct) => s.AddStakeholderAsync(id, r, ct));
        acc.MapPut("/{id:guid}/stakeholders/{sid:guid}", (Guid id, Guid sid, StakeholderInput r, AccountService s, CancellationToken ct) => s.UpdateStakeholderAsync(id, sid, r, ct));
        acc.MapDelete("/{id:guid}/stakeholders/{sid:guid}", (Guid id, Guid sid, AccountService s, CancellationToken ct) => s.DeleteStakeholderAsync(id, sid, ct));
        acc.MapPost("/{id:guid}/opportunities", (Guid id, OpportunityInput r, AccountService s, CancellationToken ct) => s.AddOpportunityAsync(id, r, ct));
        acc.MapPut("/{id:guid}/opportunities/{oid:guid}", (Guid id, Guid oid, OpportunityInput r, AccountService s, CancellationToken ct) => s.UpdateOpportunityAsync(id, oid, r, ct));
        acc.MapDelete("/{id:guid}/opportunities/{oid:guid}", (Guid id, Guid oid, AccountService s, CancellationToken ct) => s.DeleteOpportunityAsync(id, oid, ct));
        acc.MapPost("/{id:guid}/resources", (Guid id, ResourceInput r, AccountService s, CancellationToken ct) => s.AddResourceAsync(id, r, ct));
        acc.MapPut("/{id:guid}/resources/{rid:guid}", (Guid id, Guid rid, ResourceInput r, AccountService s, CancellationToken ct) => s.UpdateResourceAsync(id, rid, r, ct));
        acc.MapDelete("/{id:guid}/resources/{rid:guid}", (Guid id, Guid rid, AccountService s, CancellationToken ct) => s.DeleteResourceAsync(id, rid, ct));

        // ---- Versions and trends (AC 3) ----
        acc.MapPost("/{id:guid}/versions", (Guid id, CreateVersionRequest r, VersionService s, CancellationToken ct) => s.CreateAsync(id, r, ct));
        acc.MapGet("/{id:guid}/versions", (Guid id, VersionService s, CancellationToken ct) => s.ListAsync(id, ct));
        acc.MapGet("/{id:guid}/versions/{number:int}/diff", (Guid id, int number, [FromQuery] int against, VersionService s, CancellationToken ct) => s.DiffAsync(id, number, against, ct));
        acc.MapGet("/{id:guid}/scores/trend", (Guid id, VersionService s, CancellationToken ct) => s.TrendAsync(id, ct));

        // ---- Actions (AC 4) ----
        acc.MapPost("/{id:guid}/actions", (Guid id, CreateActionRequest r, ActionService s, CancellationToken ct) => s.CreateAsync(id, r, ActionOrigin.Manual, ct));
        api.MapGet("/actions", (Guid? accountId, ActionStatus? status, bool? mine, bool? overdue, ICurrentUser u, ActionService s, CancellationToken ct) =>
            s.ListAsync(accountId, status, mine ?? false, overdue ?? false, u.Id, ct)).WithTags("Actions");
        api.MapPatch("/actions/{id:guid}", (Guid id, PatchActionRequest r, ActionService s, CancellationToken ct) => s.PatchAsync(id, r, ct)).WithTags("Actions");

        // ---- Views (AC 7) ----
        var views = api.MapGroup("/views").WithTags("Views");
        views.MapGet("/mac", (ViewService s, CancellationToken ct) => s.MacAsync(ct));
        views.MapGet("/nbd", (ViewService s, CancellationToken ct) => s.NbdAsync(ct));
        views.MapGet("/ebd", (ViewService s, CancellationToken ct) => s.EbdAsync(ct));

        // ---- AI (AC 8) ----
        var ai = api.MapGroup("").RequireRateLimiting("ai").WithTags("AI");
        ai.MapPost("/accounts/{id:guid}/ai/next-best-action", (Guid id, NextBestActionAgent a, CancellationToken ct) => a.RecommendAsync(id, ct));
        ai.MapGet("/accounts/{id:guid}/ai/recommendations", (Guid id, NextBestActionAgent a, CancellationToken ct) => a.ListAsync(id, ct));
        ai.MapPost("/ai/recommendations/{rid:guid}/accept", (Guid rid, AcceptRecommendationRequest r, NextBestActionAgent a, CancellationToken ct) => a.AcceptAsync(rid, r, ct));
        ai.MapPost("/ai/recommendations/{rid:guid}/dismiss", async (Guid rid, DismissRecommendationRequest r, NextBestActionAgent a, CancellationToken ct) =>
        {
            await a.DismissAsync(rid, r.Reason, ct);
            return Results.NoContent();
        });
        ai.MapPost("/accounts/{id:guid}/ai/copilot", (Guid id, CopilotRequest r, PlanCopilotAgent a, CancellationToken ct) => a.SuggestAsync(id, r, ct));
        ai.MapPost("/ai/risk-scan", (RiskSentinelAgent a, CancellationToken ct) => a.ScanAsync(ct));
        ai.MapGet("/ai/executive-brief", (ExecutiveBriefAgent a, CancellationToken ct) => a.BriefAsync(ct));
        api.MapGet("/ai/usage", (AiUsageService s, CancellationToken ct) => s.UsageAsync(ct)).WithTags("AI");
        api.MapGet("/ai/evaluations", (AgentEvaluator e, CancellationToken ct) => e.LatestAsync(ct)).RequireAuthorization(Policies.Admin).WithTags("AI");
        ai.MapPost("/ai/evaluations/run", (AgentEvaluator e, CancellationToken ct) => e.EvaluateRecentAsync(ct)).RequireAuthorization(Policies.Admin);

        // ---- Import / export (AC 5, AC 6) ----
        var io = api.MapGroup("").WithTags("Import and export");
        io.MapPost("/imports", async (IFormFile file, ImportExportService s, CancellationToken ct) =>
        {
            await using var stream = file.OpenReadStream();
            return await s.AnalyseAsync(file.FileName, stream, file.Length, ct);
        }).DisableAntiforgery().RequireRateLimiting("ai");
        io.MapPost("/imports/{importId:guid}/commit", (Guid importId, CommitImportRequest r, ImportExportService s, CancellationToken ct) => s.CommitAsync(importId, r, ct));
        io.MapGet("/accounts/{id:guid}/export", async (Guid id, ImportExportService s, CancellationToken ct) =>
        {
            var f = await s.ExportAccountAsync(id, ct);
            return Results.File(f.Content, Xlsx, f.FileName);
        });
        io.MapGet("/exports/bd-pack", async (ImportExportService s, CancellationToken ct) =>
        {
            var f = await s.BdPackAsync(ct);
            return Results.File(f.Content, Xlsx, f.FileName);
        });
        io.MapGet("/exports/executive-pack", async (ImportExportService s, CancellationToken ct) =>
        {
            var f = await s.ExecutivePackAsync(ct);
            return Results.File(f.Content, Xlsx, f.FileName);
        });

        // ---- Security (Admin) ----
        var sec = api.MapGroup("/security").RequireAuthorization(Policies.Admin).WithTags("Security");
        sec.MapGet("/findings", (SecuritySentinel s, CancellationToken ct) => s.ListAsync(ct));
        sec.MapPost("/scan", (SecuritySentinel s, CancellationToken ct) => s.ScanAsync(ct));
        sec.MapPost("/findings/{id:guid}/acknowledge", async (Guid id, SecuritySentinel s, CancellationToken ct) =>
        {
            await s.AcknowledgeAsync(id, ct);
            return Results.NoContent();
        });
        sec.MapGet("/audit", (int? take, SecuritySentinel s, CancellationToken ct) => s.AuditAsync(take ?? 100, ct));
    }
}

public static class Policies
{
    public const string Admin = "AdminOnly";
}
