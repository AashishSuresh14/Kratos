using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Kratos.Application.Ai;
using Kratos.Application.Common;
using Kratos.Domain;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Kratos.Api.Infrastructure;

/// <summary>Maps application exceptions to RFC 7807 problem details. Never leaks stack traces or provider errors.</summary>
public sealed class ProblemExceptionHandler(ILogger<ProblemExceptionHandler> logger, IProblemDetailsService problems) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext ctx, Exception ex, CancellationToken ct)
    {
        var (status, title, detail) = ex switch
        {
            ValidationException v => (StatusCodes.Status422UnprocessableEntity, "Some fields need attention", v.Message),
            NotFoundException n => (StatusCodes.Status404NotFound, "Not found", n.Message),
            ForbiddenException f => (StatusCodes.Status403Forbidden, "Not allowed", f.Message),
            ConflictException c => (StatusCodes.Status409Conflict, "Conflict", c.Message),
            UnauthorizedAccessException u => (StatusCodes.Status401Unauthorized, "Sign-in failed", u.Message),
            TooManyRequestsException t => (StatusCodes.Status429TooManyRequests, "Slow down", t.Message),
            AiUnavailableException a => (StatusCodes.Status503ServiceUnavailable, "AI unavailable", a.Message),
            BadHttpRequestException b => (StatusCodes.Status400BadRequest, "Bad request", b.Message.Contains("JSON", StringComparison.OrdinalIgnoreCase) ? "The request body is not valid JSON for this endpoint." : "The request could not be read."),
            _ => (StatusCodes.Status500InternalServerError, "Something went wrong", "An unexpected error occurred. It has been logged."),
        };
        if (status >= 500 && ex is not AiUnavailableException) logger.LogError(ex, "Unhandled error on {Path}", ctx.Request.Path);
        else if (ex is AiUnavailableException ai) logger.LogWarning("AI unavailable: {Detail}", ai.Detail);

        var pd = new ProblemDetails { Status = status, Title = title, Detail = detail, Type = $"https://httpstatuses.io/{status}" };
        if (ex is ValidationException ve) pd.Extensions["errors"] = ve.Errors;
        ctx.Response.StatusCode = status;
        return await problems.TryWriteAsync(new ProblemDetailsContext { HttpContext = ctx, ProblemDetails = pd, Exception = ex });
    }
}

/// <summary>
/// Stand-in for the Azure Functions timers when running locally: runs the Security Sentinel every 15 minutes.
/// In Azure, the same Application services are invoked by timer-triggered Functions (see /functions).
/// </summary>
public sealed class SchedulerService(IServiceScopeFactory scopes, ILogger<SchedulerService> logger, IConfiguration config) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!config.GetValue("Scheduler:Enabled", true)) return;
        var interval = TimeSpan.FromMinutes(config.GetValue("Scheduler:SecurityScanMinutes", 15));
        using var timer = new PeriodicTimer(interval);
        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
        do
        {
            try
            {
                using var scope = scopes.CreateScope();
                await scope.ServiceProvider.GetRequiredService<Kratos.Application.Services.ReportingService>().RefreshAsync(stoppingToken);
                var findings = await scope.ServiceProvider.GetRequiredService<SecuritySentinel>().ScanAsync(stoppingToken);
                if (findings.Count > 0)
                {
                    logger.LogWarning("Security Sentinel raised {Count} new finding(s).", findings.Count);
                    var teams = scope.ServiceProvider.GetRequiredService<TeamsNotifier>();
                    foreach (var f in findings.Where(f => f.Severity >= Severity.High))
                        await teams.NotifyAsync($"Security finding: {f.Rule}", f.Detail, f.Severity.ToString(), stoppingToken);
                }
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Scheduled security scan failed");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
    }
}

/// <summary>Posts an Adaptive Card to a Teams incoming webhook when one is configured. No-op otherwise.</summary>
public sealed class TeamsNotifier(HttpClient http, IConfiguration config, ILogger<TeamsNotifier> logger)
{
    public async Task NotifyAsync(string title, string text, string severity, CancellationToken ct)
    {
        var url = config["Integrations:TeamsWebhookUrl"];
        if (string.IsNullOrWhiteSpace(url) || !Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps) return;
        var card = new JsonObject
        {
            ["type"] = "message",
            ["attachments"] = new JsonArray(new JsonObject
            {
                ["contentType"] = "application/vnd.microsoft.card.adaptive",
                ["content"] = new JsonObject
                {
                    ["type"] = "AdaptiveCard", ["version"] = "1.4", ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
                    ["body"] = new JsonArray(
                        new JsonObject { ["type"] = "TextBlock", ["text"] = $"Kratos · {title}", ["weight"] = "Bolder", ["size"] = "Medium", ["wrap"] = true },
                        new JsonObject { ["type"] = "TextBlock", ["text"] = $"Severity: {severity}", ["isSubtle"] = true },
                        new JsonObject { ["type"] = "TextBlock", ["text"] = text, ["wrap"] = true }),
                },
            }),
        };
        try
        {
            using var res = await http.PostAsJsonAsync(uri, card, ct);
            if (!res.IsSuccessStatusCode) logger.LogWarning("Teams webhook returned {Status}", (int)res.StatusCode);
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "Teams webhook failed");
        }
    }
}

public static class DotEnv
{
    /// <summary>Loads KEY=VALUE lines from a local .env file (development only). Existing variables win.</summary>
    public static void Load(string path)
    {
        if (!File.Exists(path)) return;
        foreach (var line in File.ReadAllLines(path))
        {
            var t = line.Trim();
            if (t.Length == 0 || t.StartsWith('#')) continue;
            var i = t.IndexOf('=');
            if (i <= 0) continue;
            var key = t[..i].Trim();
            var value = t[(i + 1)..].Trim().Trim('"');
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable(key))) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
