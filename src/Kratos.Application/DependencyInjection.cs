using Kratos.Application.Ai;
using Kratos.Application.Services;
using Microsoft.Extensions.DependencyInjection;

namespace Kratos.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<AccessScope>();
        services.AddScoped<AuthService>();
        services.AddScoped<ScoringService>();
        services.AddScoped<AccountService>();
        services.AddScoped<ActionService>();
        services.AddScoped<VersionService>();
        services.AddScoped<ViewService>();
        services.AddScoped<AdminService>();
        services.AddScoped<ImportExportService>();
        services.AddScoped<ReportingService>();

        services.AddScoped<IAiGateway, AiGateway>();
        services.AddScoped<NextBestActionAgent>();
        services.AddScoped<PlanCopilotAgent>();
        services.AddScoped<RiskSentinelAgent>();
        services.AddScoped<ExecutiveBriefAgent>();
        services.AddScoped<WorkbookInterpreterAgent>();
        services.AddScoped<SecuritySentinel>();
        services.AddScoped<AgentEvaluator>();
        services.AddScoped<AiUsageService>();
        return services;
    }
}
