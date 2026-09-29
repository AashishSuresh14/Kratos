// Generates a synthetic KAM workbook that mirrors the structure of Psiog's real KAM workbooks
// (tabs KYC, S2 ... S12, Sheet1, FY23-24) with entirely fictional content. Use it to test import
// without customer data. Layouts are intentionally "human": titles above tables, labels with colons,
// notes, blank rows, and a revenue sheet the rules cannot map (it exercises the AI interpreter).
//
// Run: dotnet run --project tools/SyntheticWorkbook -- samples/synthetic-KAM-Veridian-Ports.xlsx
using ClosedXML.Excel;

var output = args.Length > 0 ? args[0] : "synthetic-KAM-Veridian-Ports.xlsx";
using var wb = new XLWorkbook();

IXLWorksheet Sheet(string name, string title)
{
    var ws = wb.Worksheets.Add(name);
    ws.Cell("A1").Value = title;
    ws.Cell("A1").Style.Font.Bold = true;
    ws.Cell("A1").Style.Font.FontSize = 14;
    ws.Cell("A2").Value = "Account: Veridian Ports Authority (FICTIONAL - synthetic test data)";
    ws.Cell("A2").Style.Font.Italic = true;
    return ws;
}

void Pairs(IXLWorksheet ws, int row, params (string Label, object Value)[] pairs)
{
    foreach (var (label, value) in pairs)
    {
        ws.Cell(row, 1).Value = label;
        ws.Cell(row, 1).Style.Font.Bold = true;
        ws.Cell(row, 2).Value = XLCellValue.FromObject(value);
        row++;
    }
}

void Table(IXLWorksheet ws, int row, string[] headers, object?[][] rows)
{
    for (var c = 0; c < headers.Length; c++)
    {
        ws.Cell(row, c + 1).Value = headers[c];
        ws.Cell(row, c + 1).Style.Font.Bold = true;
        ws.Cell(row, c + 1).Style.Fill.BackgroundColor = XLColor.LightGray;
    }
    for (var r = 0; r < rows.Length; r++)
        for (var c = 0; c < rows[r].Length; c++)
            ws.Cell(row + 1 + r, c + 1).Value = XLCellValue.FromObject(rows[r][c]);
}

// S1 KYC
var kyc = Sheet("KYC", "Know Your Customer");
Pairs(kyc, 4,
    ("Account name:", "Veridian Ports Authority"),
    ("Industry:", "Maritime logistics"),
    ("Account since:", "2021-04-01"),
    ("Current run rate (USD):", "1.2M"),
    ("CXO connect:", "Bi-annual steering committee with the CDIO; COO attends QBRs"),
    ("Current offerings:", "Application Engineering; QA & Test Automation"),
    ("Aspirational offerings:", "Data Engineering; AI & Machine Learning"),
    ("Key challenges:", "Legacy terminal operating system, siloed berth-planning data, manual customs reconciliation"));
kyc.Cell(14, 1).Value = "Account team (RACI)";
kyc.Cell(14, 1).Style.Font.Bold = true;
Table(kyc, 15, ["Name", "Role", "RACI"], [
    ["Priya Natarajan", "Account captain", "A"],
    ["Arjun Pillai", "Delivery manager", "R"],
    ["Rajesh Iyer", "Executive sponsor", "I"]]);

// S2 Info base
var s2 = Sheet("S2 Info Base", "Information base");
Pairs(s2, 4,
    ("What Psiog doesn't know:", "Who signs off the FY27 digital budget; whether the port will tender the TOS replacement"),
    ("Known but not confirmed:", "A data platform RFP may be issued in Q1; the CDIO favours cloud-native vendors"),
    ("Levers we can use to grow:", "Our QA automation cut release defects by 40%; the COO references us publicly"));

// S3/S4 Vision and objectives
var s3 = Sheet("S3 3 year vision S4 objectives", "Vision and objectives");
Pairs(s3, 4,
    ("3 year vision:", "Be Veridian's strategic partner for terminal digitisation, owning data, apps and quality engineering"),
    ("1 year vision:", "Win the data platform programme and double the QA footprint"),
    ("Objective 1:", "Secure the CDIO as executive sponsor by Q4"),
    ("Objective 2:", "Deliver a berth-planning analytics proof of value in 90 days"),
    ("Objective 3:", "Grow run rate to USD 1.6M"));

// S5 Strategic direction (single-column list with a blank row)
var s5 = Sheet("S5 Strategic Direction", "Why would Veridian buy from us?");
s5.Cell("A4").Value = "Legacy modernisation";
s5.Cell("A5").Value = "Data-driven decisions";
s5.Cell("A7").Value = "Regulatory compliance";

// S6 Opportunity matrix (High/Medium/Low words instead of numbers)
var s6 = Sheet("S6 Opportunity Matrix", "Opportunity matrix");
Table(s6, 4, ["Opportunity", "Psiog offering", "Potential", "Effort", "Complexity", "Priority"], [
    ["Berth planning analytics", "BI & Analytics", "High", "Medium", "Medium", "Yes"],
    ["Customs reconciliation automation", "Integrations & APIs", 4, 2, 3, "Yes"],
    ["TOS modernisation", "Application Engineering", 5, 5, 5, "No"],
    ["Predictive crane maintenance", "AI & Machine Learning", "Medium", "High", "High", "No"]]);

// S7 Mapping the account
var s7 = Sheet("S7 Mapping the account", "Stakeholder map");
Table(s7, 4, ["Name", "Designation", "Role", "Importance (A/B/C)", "Buying motive", "Perception of Psiog (1-5)"], [
    ["Elena Marsh", "Chief Digital & Information Officer", "Decision maker", "A", "Modernise without disrupting operations", 3],
    ["Tomas Reyes", "Chief Operating Officer", "Influencer", "A", "Faster vessel turnaround", 5],
    ["Grace Okafor", "Head of Procurement", "Gatekeeper", "B", "Vendor consolidation", 2],
    ["Hiro Sato", "Enterprise Architect", "Influencer", "B", "Clean integration architecture", 4]]);

// S8 Brickwall (criteria names worded differently from master data)
var s8 = Sheet("S8 Brickwall for software", "Brickwall – relationship strength");
Table(s8, 4, ["Criteria", "Category", "Score (1-5)"], [
    ["Executive sponsorship", "Strategic", 2],
    ["Alignment with client roadmap", "Strategic", 4],
    ["Trust and credibility", "Behavioural", 4],
    ["Breadth of relationships", "Behavioural", 3],
    ["Delivery quality", "Operational", 5],
    ["SLA adherence", "Operational", 4]]);

// S9 Tactical checklist
var s9 = Sheet("S9 Tactical Checklist", "Tactical checklist – Berth planning analytics");
Table(s9, 4, ["Question", "Weight", "Answer"], [
    ["Is the budget identified and approved?", "Essential", "Partial"],
    ["Have we met the decision maker?", "Essential", "Yes"],
    ["Do we know the competitors?", "Desirable", "No"]]);

// S10 Priority actions
var s10 = Sheet("S10 Priority actions", "Priority actions");
Table(s10, 4, ["Action", "Owner", "Due date"], [
    ["Run a berth-planning discovery workshop", "Priya Natarajan", "2026-11-15"],
    ["Draft a customs automation business case", "Arjun Pillai", "2026-12-01"]]);

// S11 Time bound action plan (actions with sub-actions)
var s11 = Sheet("S11 Time bound action plan", "Time-bound action plan");
Table(s11, 4, ["Action", "Sub action", "Owner", "By when"], [
    ["Secure CDIO sponsorship", null, "Priya Natarajan", "2026-12-20"],
    [null, "Book an executive connect with Rajesh Iyer", "Priya Natarajan", "2026-11-30"],
    [null, "Prepare the modernisation point of view", "Arjun Pillai", "2026-11-25"],
    ["Proof of value for berth analytics", null, "Arjun Pillai", "2027-01-31"]]);

// S12 Resources needed
var s12 = Sheet("S12 Resources Needed", "Resources needed");
Pairs(s12, 4,
    ("Money / budget:", "USD 15k for the proof of value"),
    ("Specialist expertise:", "Data architect for 4 weeks"),
    ("Management time:", "Two executive connects with the CDIO"),
    ("Travel:", "USD 6k for two on-site visits"));

// Sheet1: free-form notes (unrecognised; goes to the AI interpreter)
var notes = wb.Worksheets.Add("Sheet1");
notes.Cell("A1").Value = "Notes from QBR, Sept 2026";
notes.Cell("A2").Value = "COO very happy with release quality. CDIO asked about GenAI for customs document classification.";
notes.Cell("A3").Value = "Risk: procurement pushing for vendor consolidation next year.";

// FY23-24: revenue by quarter (unrecognised; goes to the AI interpreter)
var fy = wb.Worksheets.Add("FY23-24");
Table(fy, 1, ["Quarter", "Revenue (USD)", "Headcount"], [
    ["Q1 FY24", 260000, 11], ["Q2 FY24", 285000, 12], ["Q3 FY24", 300000, 13], ["Q4 FY24", 310000, 13]]);

foreach (var ws in wb.Worksheets) ws.Columns().AdjustToContents(1, 30, 8, 60);
wb.SaveAs(output);
Console.WriteLine($"Wrote {Path.GetFullPath(output)} with {wb.Worksheets.Count} sheets.");
