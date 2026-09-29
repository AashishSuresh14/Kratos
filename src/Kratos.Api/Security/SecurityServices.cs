using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Kratos.Application.Abstractions;
using Kratos.Domain;
using Microsoft.IdentityModel.Tokens;

namespace Kratos.Api.Security;

public sealed class JwtOptions
{
    public const string Section = "Jwt";
    public const string DevelopmentKey = "dev-only-signing-key-change-me-0123456789abcdef";
    public string Issuer { get; set; } = "kratos";
    public string Audience { get; set; } = "kratos-web";
    public string SigningKey { get; set; } = DevelopmentKey;
    public int LifetimeMinutes { get; set; } = 480;
}

public sealed class JwtTokenIssuer(JwtOptions options) : ITokenIssuer
{
    public (string Token, DateTime ExpiresAt) Issue(AppUser user)
    {
        var expires = DateTime.UtcNow.AddMinutes(options.LifetimeMinutes);
        var creds = new SigningCredentials(new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.SigningKey)), SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: options.Issuer,
            audience: options.Audience,
            claims:
            [
                new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new Claim(JwtRegisteredClaimNames.Email, user.Email),
                new Claim("name", user.DisplayName),
                new Claim("role", user.Role.ToString()),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
            ],
            notBefore: DateTime.UtcNow,
            expires: expires,
            signingCredentials: creds);
        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }
}

public sealed class HttpCurrentUser(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? Principal => accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated == true;
    public Guid Id => Guid.TryParse(Principal?.FindFirstValue("sub") ?? Principal?.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : Guid.Empty;
    public string Email => Principal?.FindFirstValue("email") ?? Principal?.FindFirstValue(ClaimTypes.Email) ?? "";

    // Unknown or missing role claims fall back to the least-privileged role.
    public Role Role => Enum.TryParse<Role>(Principal?.FindFirstValue("role") ?? Principal?.FindFirstValue(ClaimTypes.Role), out var r) ? r : Role.AccountManager;

    public string Ip => accessor.HttpContext?.Connection.RemoteIpAddress?.ToString() ?? "";
}

/// <summary>Adds defensive headers to every API response.</summary>
public sealed class SecurityHeadersMiddleware(RequestDelegate next)
{
    public Task InvokeAsync(HttpContext ctx)
    {
        ctx.Response.OnStarting(() =>
        {
            var h = ctx.Response.Headers;
            h["X-Content-Type-Options"] = "nosniff";
            h["X-Frame-Options"] = "DENY";
            h["Referrer-Policy"] = "no-referrer";
            h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()";
            h["Cross-Origin-Opener-Policy"] = "same-origin";
            if (!ctx.Request.Path.StartsWithSegments("/swagger"))
            {
                h["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
                h["Cache-Control"] = "no-store";
            }
            return Task.CompletedTask;
        });
        return next(ctx);
    }
}
