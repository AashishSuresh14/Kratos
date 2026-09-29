using Kratos.Application.Ai;
using Kratos.Application.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace Kratos.Functions;

/// <summary>Timer-triggered jobs (AC 3 cadence, security monitoring, BI refresh). Each is idempotent and safe to re-run.</summary>
public sealed class Jobs(SecuritySentinel sentinel, ReportingService reporting, AgentEvaluator evaluator, IAiGateway ai, ILogger<Jobs> logger)
{
    [Function("SecuritySentinelScan")]
    public async Task SecurityScan([TimerTrigger("0 */15 * * * *")] TimerInfo timer, CancellationToken ct)
    {
        var findings = await sentinel.ScanAsync(ct);
        logger.LogInformation("Security Sentinel: {Count} new finding(s).", findings.Count);
    }

    [Function("ReportingSnapshot")]
    public async Task Snapshot([TimerTrigger("0 5 * * * *")] TimerInfo timer, CancellationToken ct)
    {
        var rows = await reporting.RefreshAsync(ct);
        logger.LogInformation("Reporting snapshot refreshed for {Rows} accounts.", rows);
    }

    [Function("NightlyAgentEvaluation")]
    public async Task Evaluate([TimerTrigger("0 30 1 * * *")] TimerInfo timer, CancellationToken ct)
    {
        if (ai.ProviderStatus().Values.All(v => v != "configured"))
        {
            logger.LogWarning("Skipping agent evaluation: no AI provider configured.");
            return;
        }
        var results = await evaluator.EvaluateRecentAsync(ct);
        logger.LogInformation("Agent evaluation: {Passed}/{Total} passed.", results.Count(r => r.Passed), results.Count);
    }
}
