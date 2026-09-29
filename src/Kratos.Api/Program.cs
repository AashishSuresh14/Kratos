using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Azure.Identity;
using Kratos.Api.Endpoints;
using Kratos.Api.Infrastructure;
using Kratos.Api.Security;
using Kratos.Application;
using Kratos.Application.Abstractions;
using Kratos.Application.Ai;
using Kratos.Domain;
using Kratos.Infrastructure;
using Kratos.Infrastructure.Data;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

// Local development reads API keys from the repo-root .env (git-ignored). Azure uses Key Vault.
DotEnv.Load(Path.Combine(Directory.GetCurrentDirectory(), ".env"));
DotEnv.Load(Path.Combine(Directory.GetCurrentDirectory(), "..", "..", ".env"));

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

var keyVaultUri = config["KeyVault:Uri"];
if (!string.IsNullOrWhiteSpace(keyVaultUri))
    config.AddAzureKeyVault(new Uri(keyVaultUri), new DefaultAzureCredential());

// ---- Options ----
var jwt = new JwtOptions();
config.GetSection(JwtOptions.Section).Bind(jwt);
if (Encoding.UTF8.GetByteCount(jwt.SigningKey) < 32) throw new InvalidOperationException("Jwt:SigningKey must be at least 32 bytes.");
if (builder.Environment.IsProduction() && jwt.SigningKey == JwtOptions.DevelopmentKey)
    throw new InvalidOperationException("Refusing to start in Production with the development JWT signing key.");
builder.Services.AddSingleton(jwt);

var demoPassword = config["Seed:DemoPassword"];
builder.Services.AddSingleton(new SecurityOptions
{
    IsProduction = builder.Environment.IsProduction(),
    UsingDemoPassword = config.GetValue("Seed:Enabled", true) && !string.IsNullOrEmpty(demoPassword),
    KeyVaultConfigured = !string.IsNullOrWhiteSpace(keyVaultUri),
    JwtKeyIsDevelopmentDefault = jwt.SigningKey == JwtOptions.DevelopmentKey,
});

// ---- Layers ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, HttpCurrentUser>();
builder.Services.AddSingleton<ITokenIssuer, JwtTokenIssuer>();
builder.Services.AddApplication();
builder.Services.AddInfrastructure(config);
builder.Services.AddHttpClient<TeamsNotifier>(c => c.Timeout = TimeSpan.FromSeconds(10));
builder.Services.AddHostedService<SchedulerService>();

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter<SectionKey>(JsonNamingPolicy.CamelCase));
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.MaxDepth = 32;
});

// ---- AuthN / AuthZ (least privilege: every endpoint requires sign-in; admin surfaces need the Admin role) ----
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(o =>
{
    o.MapInboundClaims = false;
    o.TokenValidationParameters = new TokenValidationParameters
    {
        ValidIssuer = jwt.Issuer,
        ValidAudience = jwt.Audience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),
        ValidateIssuer = true, ValidateAudience = true, ValidateLifetime = true, ValidateIssuerSigningKey = true,
        ClockSkew = TimeSpan.FromMinutes(1),
        NameClaimType = "name", RoleClaimType = "role",
    };
});
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
    .AddPolicy(Policies.Admin, p => p.RequireRole(nameof(Role.Admin)));

// ---- Abuse protection ----
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    static string Partition(HttpContext c) => c.User.FindFirst("sub")?.Value ?? c.Connection.RemoteIpAddress?.ToString() ?? "anon";
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(c =>
        RateLimitPartition.GetFixedWindowLimiter(Partition(c), _ => new FixedWindowRateLimiterOptions { PermitLimit = 600, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("auth", c => RateLimitPartition.GetFixedWindowLimiter(c.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
    o.AddPolicy("ai", c => RateLimitPartition.GetFixedWindowLimiter(Partition(c),
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 20, Window = TimeSpan.FromMinutes(1) }));
});
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 11 * 1024 * 1024);
builder.WebHost.ConfigureKestrel(k => k.Limits.MaxRequestBodySize = 11 * 1024 * 1024);

var origins = config.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? ["http://localhost:5173"];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p.WithOrigins(origins).AllowAnyHeader()
    .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE").WithExposedHeaders("Content-Disposition")));

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ProblemExceptionHandler>();
builder.Services.AddOpenApi();

var app = builder.Build();

// ---- Database and demo seed ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KratosDbContext>();
    await db.Database.EnsureCreatedAsync();
    if (config.GetValue("Seed:Enabled", true))
    {
        if (string.IsNullOrWhiteSpace(demoPassword))
            app.Logger.LogWarning("Seed:DemoPassword is not set; demo data was not seeded.");
        else
            await DataSeeder.SeedAsync(scope.ServiceProvider, demoPassword, app.Logger);
    }
}

app.UseExceptionHandler();
app.UseMiddleware<SecurityHeadersMiddleware>();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapOpenApi("/openapi/{documentName}.json").AllowAnonymous();
app.UseSwaggerUI(o =>
{
    o.SwaggerEndpoint("/openapi/v1.json", "Kratos Digital KAM API v1");
    o.DocumentTitle = "Kratos API";
});

app.MapGet("/api/v1/health", async (KratosDbContext db, IAiGateway ai) =>
{
    var dbOk = await db.Database.CanConnectAsync();
    return Results.Ok(new { status = dbOk ? "ok" : "degraded", version = typeof(Program).Assembly.GetName().Version?.ToString(), db = dbOk ? "ok" : "down", ai = ai.ProviderStatus() });
}).AllowAnonymous().WithTags("Health");

app.MapKratos();
app.Run();

public partial class Program;
