using Kratos.Application;
using Kratos.Application.Abstractions;
using Kratos.Application.Ai;
using Kratos.Infrastructure;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

// Same Application and Infrastructure layers as the API: jobs reuse the exact business rules.
builder.Services.AddSingleton<ICurrentUser, SystemUser>();
builder.Services.AddSingleton(new SecurityOptions { IsProduction = true, KeyVaultConfigured = !string.IsNullOrWhiteSpace(builder.Configuration["KeyVault:Uri"]) });
builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

builder.Build().Run();

/// <summary>Identity for scheduled jobs. Not authenticated, so it can never pass a user-facing access check.</summary>
internal sealed class SystemUser : ICurrentUser
{
    public Guid Id => Guid.Empty;
    public string Email => "system@kratos";
    public Kratos.Domain.Role Role => Kratos.Domain.Role.Executive;
    public string Ip => "function";
    public bool IsAuthenticated => false;
}
