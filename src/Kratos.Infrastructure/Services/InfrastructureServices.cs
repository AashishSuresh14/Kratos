using System.IO.Compression;
using System.Security.Cryptography;
using ClosedXML.Excel;
using Kratos.Application.Abstractions;
using Kratos.Application.Common;

namespace Kratos.Infrastructure.Services;

public sealed class SystemClock : IClock
{
    public DateTime UtcNow => DateTime.UtcNow;
}

/// <summary>PBKDF2-SHA256, 210k iterations (OWASP 2023 guidance), per-password salt, constant-time compare.</summary>
public sealed class Pbkdf2PasswordHasher : IPasswordHasher
{
    private const int Iterations = 210_000;
    private const int SaltSize = 16;
    private const int KeySize = 32;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var key = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, KeySize);
        return $"pbkdf2-sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(key)}";
    }

    public bool Verify(string hash, string password)
    {
        var parts = hash.Split('$');
        if (parts.Length != 4 || parts[0] != "pbkdf2-sha256" || !int.TryParse(parts[1], out var iterations)) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[2]);
            var expected = Convert.FromBase64String(parts[3]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch (FormatException)
        {
            return false;
        }
    }
}

public sealed class ClosedXmlWorkbookReader : IWorkbookReader
{
    private const long MaxUncompressedBytes = 100L * 1024 * 1024;
    private const int MaxEntries = 2000;
    private const int MaxSheets = 60;

    public WorkbookModel Read(Stream xlsx, int maxCellsPerSheet)
    {
        using var buffer = new MemoryStream();
        xlsx.CopyTo(buffer);
        GuardAgainstZipBomb(buffer);
        buffer.Position = 0;

        XLWorkbook wb;
        try { wb = new XLWorkbook(buffer); }
        catch (Exception ex) when (ex is InvalidDataException or FileFormatException or ArgumentException or InvalidOperationException or NotSupportedException)
        {
            throw new ValidationException("file", "This file could not be opened as an Excel workbook. Check it is a valid .xlsx and not password protected.");
        }
        using (wb)
        {
            if (wb.Worksheets.Count > MaxSheets) throw new ValidationException("file", $"The workbook has more than {MaxSheets} sheets.");
            var sheets = new List<WorkbookSheet>();
            foreach (var ws in wb.Worksheets)
            {
                if (ws.Visibility != XLWorksheetVisibility.Visible) continue;
                var cells = new List<WorkbookCell>();
                foreach (var c in ws.CellsUsed(XLCellsUsedOptions.Contents))
                {
                    if (cells.Count >= maxCellsPerSheet) break;
                    string value;
                    try
                    {
                        // Cached values only: formulas are never evaluated against external links.
                        value = c.HasFormula ? c.CachedValue.ToString() ?? "" : c.GetFormattedString();
                    }
                    catch (Exception)
                    {
                        value = "";
                    }
                    value = value.Trim();
                    if (value.Length == 0) continue;
                    if (value.Length > 4000) value = value[..4000];
                    cells.Add(new WorkbookCell(c.Address.ToString() ?? "", c.Address.RowNumber, c.Address.ColumnNumber, value));
                }
                sheets.Add(new WorkbookSheet(ws.Name, cells));
            }
            return new WorkbookModel(sheets);
        }
    }

    private static void GuardAgainstZipBomb(MemoryStream buffer)
    {
        buffer.Position = 0;
        try
        {
            using var zip = new ZipArchive(buffer, ZipArchiveMode.Read, leaveOpen: true);
            if (zip.Entries.Count > MaxEntries) throw new ValidationException("file", "The workbook structure is too large to import.");
            long total = 0;
            foreach (var e in zip.Entries)
            {
                total += e.Length;
                if (total > MaxUncompressedBytes) throw new ValidationException("file", "The workbook expands to more than 100 MB and was rejected.");
                if (e.FullName.Contains("vbaProject", StringComparison.OrdinalIgnoreCase))
                    throw new ValidationException("file", "Macro-enabled workbooks are not accepted. Save as a plain .xlsx.");
            }
        }
        catch (InvalidDataException)
        {
            throw new ValidationException("file", "This file is not a valid .xlsx workbook.");
        }
    }
}

public sealed class ClosedXmlWorkbookWriter : IWorkbookWriter
{
    /// <summary>Characters that make spreadsheet apps treat text as a formula.</summary>
    private static readonly char[] FormulaStart = ['=', '+', '-', '@', (char)9, (char)13];

    public byte[] Write(IReadOnlyList<WorkbookTable> sheets)
    {
        using var wb = new XLWorkbook();
        foreach (var s in sheets)
        {
            var name = s.SheetName.Length > 31 ? s.SheetName[..31] : s.SheetName;
            var ws = wb.Worksheets.Add(name);
            for (var c = 0; c < s.Headers.Count; c++) ws.Cell(1, c + 1).Value = s.Headers[c];
            var header = ws.Range(1, 1, 1, Math.Max(1, s.Headers.Count));
            header.Style.Font.Bold = true;
            header.Style.Fill.BackgroundColor = XLColor.FromHtml("#E1F0EE");
            for (var r = 0; r < s.Rows.Count; r++)
            {
                var row = s.Rows[r];
                for (var c = 0; c < row.Count; c++)
                {
                    var cell = ws.Cell(r + 2, c + 1);
                    cell.Value = ToCell(row[c]);
                    // Text that starts with a formula character is stored as quoted text so it can never execute (formula injection).
                    if (row[c] is string s0 && s0.Length > 0 && FormulaStart.Contains(s0[0])) cell.Style.IncludeQuotePrefix = true;
                }
            }
            ws.SheetView.FreezeRows(1);
            ws.Columns().AdjustToContents(1, Math.Min(s.Rows.Count + 1, 200), 8, 80);
        }
        using var ms = new MemoryStream();
        wb.SaveAs(ms);
        return ms.ToArray();
    }

    /// <summary>Text that starts with a formula character is prefixed so it can never execute when opened (CSV/formula injection).</summary>
    private static XLCellValue ToCell(object? v) => v switch
    {
        null => Blank.Value,
        string s when s.Length > 0 && "=+-@\t\r".Contains(s[0]) => "'" + s,
        string s => s,
        int i => i,
        long l => l,
        decimal d => d,
        double d => d,
        bool b => b,
        DateTime dt => dt,
        _ => v.ToString() ?? "",
    };
}
