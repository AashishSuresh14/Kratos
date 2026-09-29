using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;

namespace Kratos.IntegrationTests;

public sealed class KratosFactory : WebApplicationFactory<Program>
{
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"kratos-test-{Guid.NewGuid():N}.db");
    public const string Password = "Test#Password2026";

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");
        builder.UseSetting("ConnectionStrings:Kratos", $"Data Source={_db}");
        builder.UseSetting("Seed:DemoPassword", Password);
        builder.UseSetting("Scheduler:Enabled", "false");
        // No AI keys in tests: AI endpoints must degrade with a clear 503, never a 500.
        builder.UseSetting("Ai:Keys:Anthropic", "");
        builder.UseSetting("Ai:Keys:Gemini", "");
        builder.UseSetting("Ai:Keys:Groq", "");
    }
}

public class ApiTests(KratosFactory factory) : IClassFixture<KratosFactory>
{
    private async Task<HttpClient> SignInAsync(string email)
    {
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/v1/auth/login", new { email, password = KratosFactory.Password });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", body.GetProperty("token").GetString());
        return client;
    }

    [Fact]
    public async Task Health_is_public_and_everything_else_requires_sign_in()
    {
        var client = factory.CreateClient();
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/api/v1/health")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/accounts")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/views/mac")).StatusCode);
    }

    [Fact]
    public async Task Tampered_token_is_rejected()
    {
        var client = await SignInAsync("exec@kratos.demo");
        var token = client.DefaultRequestHeaders.Authorization!.Parameter!;
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token[..^4] + "AAAA");
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/v1/accounts")).StatusCode);
    }

    [Fact]
    public async Task Account_manager_only_sees_own_accounts_and_gets_404_elsewhere()
    {
        var exec = await SignInAsync("exec@kratos.demo");
        var am = await SignInAsync("deepa.am@kratos.demo");
        var all = await exec.GetFromJsonAsync<JsonElement[]>("/api/v1/accounts");
        var mine = await am.GetFromJsonAsync<JsonElement[]>("/api/v1/accounts");
        Assert.True(mine!.Length < all!.Length);
        var mineIds = mine.Select(a => a.GetProperty("id").GetString()).ToHashSet();
        var other = all.First(a => !mineIds.Contains(a.GetProperty("id").GetString()));
        Assert.Equal(HttpStatusCode.NotFound, (await am.GetAsync($"/api/v1/accounts/{other.GetProperty("id").GetString()}")).StatusCode);
    }

    [Fact]
    public async Task Role_boundaries_are_enforced()
    {
        var admin = await SignInAsync("admin@kratos.demo");
        var exec = await SignInAsync("exec@kratos.demo");
        var am = await SignInAsync("priya.am@kratos.demo");
        Assert.Equal(HttpStatusCode.Forbidden, (await am.GetAsync("/api/v1/admin/users")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await exec.GetAsync("/api/v1/security/findings")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await admin.GetAsync("/api/v1/views/mac")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await am.GetAsync("/api/v1/exports/executive-pack")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await admin.GetAsync("/api/v1/admin/users")).StatusCode);
    }

    [Fact]
    public async Task Problem_details_and_security_headers_are_returned()
    {
        var am = await SignInAsync("priya.am@kratos.demo");
        var res = await am.GetAsync($"/api/v1/accounts/{Guid.NewGuid()}");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        Assert.Equal("nosniff", res.Headers.GetValues("X-Content-Type-Options").Single());
        Assert.Equal("DENY", res.Headers.GetValues("X-Frame-Options").Single());
    }

    [Fact]
    public async Task Ai_endpoints_degrade_to_503_without_keys()
    {
        var am = await SignInAsync("priya.am@kratos.demo");
        var mine = await am.GetFromJsonAsync<JsonElement[]>("/api/v1/accounts");
        var res = await am.PostAsync($"/api/v1/accounts/{mine![0].GetProperty("id").GetString()}/ai/next-best-action", null);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
    }

    [Fact]
    public async Task Import_rejects_non_excel_upload()
    {
        var am = await SignInAsync("priya.am@kratos.demo");
        using var form = new MultipartFormDataContent { { new ByteArrayContent("hello"u8.ToArray()), "file", "notes.txt" } };
        var res = await am.PostAsync("/api/v1/imports", form);
        Assert.Equal(HttpStatusCode.UnprocessableEntity, res.StatusCode);
    }

    [Fact]
    public async Task Export_then_import_round_trip_maps_sections()
    {
        var am = await SignInAsync("priya.am@kratos.demo");
        var mine = await am.GetFromJsonAsync<JsonElement[]>("/api/v1/accounts");
        var id = mine![0].GetProperty("id").GetString();
        var bytes = await am.GetByteArrayAsync($"/api/v1/accounts/{id}/export");
        using var form = new MultipartFormDataContent { { new ByteArrayContent(bytes), "file", "Roundtrip Account KAM.xlsx" } };
        var res = await am.PostAsync("/api/v1/imports", form);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var report = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(report.GetProperty("mapped").GetArrayLength() >= 4, report.ToString());
        Assert.True(report.GetProperty("canCommit").GetBoolean());
    }
}
