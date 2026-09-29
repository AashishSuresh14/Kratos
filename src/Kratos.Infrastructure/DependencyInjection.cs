using Kratos.Application.Abstractions;
using Kratos.Application.Ai;
using Kratos.Infrastructure.Ai;
using Kratos.Infrastructure.Data;
using Kratos.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Kratos.Infrastructure;

public static class DependencyInjection
{
    /// <summary>
    /// Database provider: "Sqlite" (local dev, tests, demos with no cloud) or "SqlServer" (Azure SQL).
    /// </summary>
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration config)
    {
        var provider = config["Database:Provider"] ?? "Sqlite";
        var cs = config.GetConnectionString("Kratos") ?? "Data Source=kratos.db";
        services.AddDbContext<KratosDbContext>(o =>
        {
            if (provider.Equals("SqlServer", StringComparison.OrdinalIgnoreCase))
                o.UseSqlServer(cs, sql => sql.EnableRetryOnFailure(5));
            else
                o.UseSqlite(cs);
        });

        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IAccountRepository, AccountRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IMasterDataRepository, MasterDataRepository>();
        services.AddScoped<IActionRepository, ActionRepository>();
        services.AddScoped<IVersionRepository, VersionRepository>();
        services.AddScoped<IAiRepository, AiRepository>();
        services.AddScoped<ISecurityRepository, SecurityRepository>();
        services.AddScoped<IImportRepository, ImportRepository>();
        services.AddScoped<Application.Services.IReportingRepository, ReportingRepository>();

        services.AddSingleton<IClock, SystemClock>();
        services.AddSingleton<IPasswordHasher, Pbkdf2PasswordHasher>();
        services.AddSingleton<IWorkbookReader, ClosedXmlWorkbookReader>();
        services.AddSingleton<IWorkbookWriter, ClosedXmlWorkbookWriter>();

        // AI providers. Keys come from Key Vault or environment variables, never from source.
        var keys = new ProviderKeys
        {
            Anthropic = config["Ai:Keys:Anthropic"] ?? config["ANTHROPIC_API_KEY"],
            Gemini = config["Ai:Keys:Gemini"] ?? config["GEMINI_API_KEY"],
            Groq = config["Ai:Keys:Groq"] ?? config["GROQ_API_KEY"],
            OllamaEnabled = bool.TryParse(config["Ai:Keys:OllamaEnabled"] ?? config["OLLAMA_ENABLED"], out var ol) && ol,
            OllamaBaseUrl = config["Ai:Keys:OllamaBaseUrl"] ?? config["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
        };
        services.AddSingleton(keys);

        var aiOptions = new AiOptions();
        config.GetSection(AiOptions.Section).Bind(aiOptions);
        services.AddSingleton(aiOptions);

        services.AddSingleton<IAiProvider, ClaudeProvider>();
        services.AddHttpClient<GeminiProvider>(c => c.Timeout = TimeSpan.FromSeconds(90));
        services.AddHttpClient<GroqProvider>(c => c.Timeout = TimeSpan.FromSeconds(30));
        services.AddHttpClient<OllamaProvider>(c => c.Timeout = TimeSpan.FromSeconds(120));
        services.AddTransient<IAiProvider>(sp => sp.GetRequiredService<GeminiProvider>());
        services.AddTransient<IAiProvider>(sp => sp.GetRequiredService<GroqProvider>());
        services.AddTransient<IAiProvider>(sp => sp.GetRequiredService<OllamaProvider>());
        return services;
    }
}
