# word_to_pdf.ps1 -- convert one .docx to PDF through Word COM.
#
# ASCII ONLY. PowerShell 5.1 reads a BOM-less file as ANSI, so any non-ASCII
# byte here would be mangled. The paths are handed in through environment
# variables (NL_SRC / NL_DST), which Windows passes as UTF-16 and therefore
# survives Chinese directory names such as the workspace root.
#
# The printer is resolved at run time with Get-Printer. Nothing is printed;
# Word only needs a valid ActivePrinter to open documents reliably on a
# machine whose default printer is a network queue that may be offline.

$ErrorActionPreference = "Stop"

$src = $env:NL_SRC
$dst = $env:NL_DST
if (-not (Test-Path -LiteralPath $src)) { throw ("source missing: " + $src) }

$printer = Get-Printer -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $printer) {
    $printer = Get-CimInstance Win32_Printer -ErrorAction SilentlyContinue |
        Select-Object -First 1
}
if (-not $printer) { throw "no printer found by Get-Printer" }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try { $word.ActivePrinter = $printer.Name } catch { }

$doc = $null
try {
    $doc = $word.Documents.Open($src, $false, $true)   # ReadOnly
    $doc.ExportAsFixedFormat($dst, 17)                  # wdExportFormatPDF
    Write-Output ("pdf written: " + $dst)
} finally {
    if ($doc -ne $null) { $doc.Close(0) }
    $word.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
