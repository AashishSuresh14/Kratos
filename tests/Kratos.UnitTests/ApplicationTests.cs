using Kratos.Application.Ai;
using Kratos.Application.Common;
using Kratos.Application.Contracts;
using Kratos.Application.Services;
using Kratos.Domain;
using Kratos.Infrastructure.Services;

namespace Kratos.UnitTests;

public class WorkbookRecognitionTests
{
    // Tab names taken from the existing KAM workbook.
    [Theory]
    [InlineData("KYC", SectionKey.Profile)]
    [InlineData("S2 Info Base", SectionKey.Infobase)]
    [InlineData("S3 3 year vision S4 objectives", SectionKey.Vision)]
    [InlineData("S5 Strategic Direction", SectionKey.Strategy)]
    [InlineData("S6 Opportunity Matrix", SectionKey.Opportunities)]
    [InlineData("S7 Mapping the account", SectionKey.Stakeholders)]
    [InlineData("S8 Brickwall for software", SectionKey.Brickwall)]
    [InlineData("S9 Tactical Checklist", SectionKey.Tactical)]
    [InlineData("S10 Priority actions", SectionKey.PriorityActions)]
    [InlineData("S11 Time bound action plan", SectionKey.ActionPlan)]
    [InlineData("S12 Resources Needed", SectionKey.Resources)]
    [InlineData("s10_priority_actions", SectionKey.PriorityActions)]
    public void Recognises_workbook_tabs(string sheet, SectionKey expected) =>
        Assert.Equal(expected, ImportExportService.Recognise(sheet));

    [Theory]
    [InlineData("Sheet1")]
    [InlineData("FY23-24")]
    [InlineData("Notes")]
    public void Unknown_tabs_go_to_the_AI_interpreter(string sheet) => Assert.Null(ImportExportService.Recognise(sheet));
}

public class SecurityPrimitiveTests
{
    [Fact]
    public void Password_hash_verifies_and_rejects_wrong_password()
    {
        var h = new Pbkdf2PasswordHasher();
        var hash = h.Hash("Correct#Horse9");
        Assert.True(h.Verify(hash, "Correct#Horse9"));
        Assert.False(h.Verify(hash, "correct#horse9"));
        Assert.NotEqual(hash, h.Hash("Correct#Horse9")); // salted
    }

    [Theory]
    [InlineData("pbkdf2-sha256$x$abc$def")]
    [InlineData("garbage")]
    [InlineData("pbkdf2-sha256$1000$!!notbase64$@@")]
    public void Malformed_hashes_never_verify(string hash) => Assert.False(new Pbkdf2PasswordHasher().Verify(hash, "anything"));

    [Theory]
    [InlineData("short1!A", false)]
    [InlineData("alllowercase123!", false)]
    [InlineData("NoSymbolsHere123", false)]
    [InlineData("Str0ng#Passphrase", true)]
    public void Password_policy(string password, bool ok) => Assert.Equal(ok, PasswordPolicy.IsStrong(password));

    [Fact]
    public void Excel_export_neutralises_formula_injection()
    {
        var bytes = new ClosedXmlWorkbookWriter().Write([new Application.Abstractions.WorkbookTable("T", ["A"], [["=HYPERLINK(\"http://evil\")"]])]);
        using var wb = new ClosedXML.Excel.XLWorkbook(new MemoryStream(bytes));
        var cell = wb.Worksheet(1).Cell(2, 1);
        Assert.False(cell.HasFormula);
        Assert.True(cell.Style.IncludeQuotePrefix);
        Assert.Equal(ClosedXML.Excel.XLDataType.Text, cell.DataType);
    }

    [Fact]
    public void Workbook_reader_rejects_non_xlsx_bytes()
    {
        var reader = new ClosedXmlWorkbookReader();
        Assert.Throws<ValidationException>(() => reader.Read(new MemoryStream("not a zip"u8.ToArray()), 100));
    }

    [Fact]
    public void Workbook_round_trip_reads_back_cells()
    {
        var bytes = new ClosedXmlWorkbookWriter().Write([new Application.Abstractions.WorkbookTable("S2 Info Base", ["Field", "Value"], [["Growth levers", "CIO reference"]])]);
        var model = new ClosedXmlWorkbookReader().Read(new MemoryStream(bytes), 100);
        Assert.Contains(model.Sheets.Single().Cells, c => c.Value == "CIO reference");
    }
}

public class AiJsonTests
{
    private sealed record Sample(string Action, int Count);

    [Theory]
    [InlineData("{\"action\":\"Call CIO\",\"count\":2}")]
    [InlineData("```json\n{\"action\":\"Call CIO\",\"count\":2}\n```")]
    [InlineData("Here you go: {\"action\":\"Call CIO\",\"count\":2} Hope it helps")]
    public void Parses_model_json_with_noise(string text)
    {
        var s = AiJson.Parse<Sample>(text);
        Assert.Equal("Call CIO", s.Action);
        Assert.Equal(2, s.Count);
    }

    [Fact]
    public void Non_json_raises_ai_unavailable() => Assert.Throws<AiUnavailableException>(() => AiJson.Parse<Sample>("I cannot help with that"));

    [Fact]
    public void Clean_caps_length_and_strips_nulls() => Assert.Equal("abc", AiJson.Clean("a\0bcdef", 4));
}

public class PlanDiffTests
{
    [Fact]
    public void Diff_reports_added_removed_and_changed_items()
    {
        var before = Plan(vision: "Old", stakeholders: [new StakeholderDto(Guid.Parse("00000000-0000-0000-0000-000000000001"), "Ann", "CIO", StakeholderRole.DecisionMaker, Importance.A, "", 3, "", Knowledge.Confirmed, "")]);
        var after = Plan(vision: "New", stakeholders: []);
        var changes = PlanDiff.Compare(before, after);
        Assert.Contains(changes, c => c.Field == "3-year vision" && c.Before == "Old" && c.After == "New");
        Assert.Contains(changes, c => c.Section == SectionKey.Stakeholders && c.After == "(removed)");
    }

    private static AccountPlanDto Plan(string vision, List<StakeholderDto> stakeholders)
    {
        var scores = new ScoresDto(0, 0, 0, 0, 0, 0, RiskLevel.Low, []);
        var summary = new AccountSummaryDto(Guid.Empty, "A", "", "", AccountType.EBD, Guid.Empty, "", Guid.Empty, "", 0, RiskLevel.Low, 0, 0, 0, null, 1);
        return new AccountPlanDto(summary, "", false, [], new ProfileDto(null, null, "USD", "", "", [], [], 30), [], new InfobaseDto("", "", ""),
            stakeholders, new VisionDto(vision, "", []), [], [], [], [], [], [], scores);
    }
}

public class NextBestActionParsingTests
{
    [Fact]
    public void Accepts_single_helper_object_and_string_booleans()
    {
        var o = NextBestActionAgent.ParseOutput("""{"action":"Call the CIO","whoseHelp":{"name":"Rajesh Iyer","type":"Internal","why":"Sponsor"},"channel":"Call","rationale":"Gap in S7","sourceSections":"stakeholders, vision","atRisk":"true","riskReason":""}""");
        Assert.Equal("Rajesh Iyer", Assert.Single(o.WhoseHelp).Name);
        Assert.Equal(["stakeholders", "vision"], o.SourceSections);
        Assert.True(o.AtRisk);
    }

    [Fact]
    public void Accepts_helpers_as_plain_names()
    {
        var o = NextBestActionAgent.ParseOutput("```json\n{\"action\":\"x\",\"whoseHelp\":[\"Priya Natarajan\",\"Elena Marsh\"],\"channel\":\"Meeting\",\"rationale\":\"y\",\"sourceSections\":[\"profile\"],\"atRisk\":false}\n```");
        Assert.Equal(2, o.WhoseHelp.Count);
        Assert.False(o.AtRisk);
    }

    [Fact]
    public void Rejects_non_json() => Assert.Throws<AiUnavailableException>(() => NextBestActionAgent.ParseOutput("Sorry, I can't"));
}
