# pol_page.ps1 -- render the politics daily sheet as a FLAT A4 page.
#
# Flat only: solid fills + hairlines + text. Gradients / large translucent fills
# get purged by the spooler on this printer.
# This script must stay ASCII-only: PowerShell 5.1 reads BOM-less files as ANSI.
# All Chinese text comes from the JSON file (UTF-8, read explicitly).
#
# Usage:
#   powershell -File pol_page.ps1 -Json daily\pol-2026-11-10.json -Preview out.png
#   powershell -File pol_page.ps1 -Json daily\pol-2026-11-10.json -Printer "EPSON L3250 Series (副本 1)"
param(
    [Parameter(Mandatory = $true)][string]$Json,
    [string]$Preview = "",
    [string]$Printer = ""
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"

$raw = [System.IO.File]::ReadAllText((Resolve-Path $Json), [System.Text.Encoding]::UTF8)
$p = $raw | ConvertFrom-Json

$W = 794
$PH = 1123
$SCALE = 2
$ML = 46
$MR = 46
$CW = $W - $ML - $MR

$bmp = New-Object System.Drawing.Bitmap ($W * $SCALE), ($PH * $SCALE)
$bmp.SetResolution(96, 96)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.ScaleTransform($SCALE, $SCALE)
$g.Clear([System.Drawing.Color]::White)

$black = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
$grey = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(92, 92, 92))
$faint = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(150, 150, 150))
$penB = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 1.2
$penG = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(160, 160, 160)), 0.8
$penD = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(170, 170, 170)), 0.8
$penD.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash

$fam = "Microsoft YaHei"
function F([double]$pt, [System.Drawing.FontStyle]$style) {
    New-Object System.Drawing.Font($fam, $pt, $style, [System.Drawing.GraphicsUnit]::Point)
}
$fTitle = F 14.5 ([System.Drawing.FontStyle]::Bold)
$fSub = F 8.4 ([System.Drawing.FontStyle]::Regular)
$fSec = F 10 ([System.Drawing.FontStyle]::Bold)
$fBody = F 9.8 ([System.Drawing.FontStyle]::Regular)
$fMeta = F 8 ([System.Drawing.FontStyle]::Regular)
$fSmall = F 7.4 ([System.Drawing.FontStyle]::Regular)
$fNum = F 9.8 ([System.Drawing.FontStyle]::Bold)

function Txt($text, $font, $brush, [double]$x, [double]$y, [double]$w) {
    if ($null -eq $text) { $text = "" }
    if ($text -eq "") { return 0 }
    $rect = New-Object System.Drawing.RectangleF $x, $y, $w, 4000
    $size = $g.MeasureString($text, $font, $rect.Size)
    $g.DrawString($text, $font, $brush, $rect)
    return $size.Height
}

# ---- header ---------------------------------------------------------------
$y = 40
$y += Txt "NEURO-LOOP   POLITICS DAILY" $fMeta $faint $ML $y $CW
$y += 2
$y += Txt $p.lesson $fTitle $black $ML $y $CW
$sub = "{0}  周{1}   {2}   {3}" -f $p.date, $p.weekday, $p.book, $p.range
$y += 2
$y += Txt $sub $fSub $grey $ML $y $CW
$y += 10
$g.DrawLine($penB, $ML, $y, $W - $MR, $y)
$y += 14

# ---- section 1: fill in the blanks ---------------------------------------
$y += Txt "一、概念填空" $fSec $black $ML $y $CW
$y += Txt "合上书默写。只填关键词，不用写整句。" $fMeta $grey $ML $y $CW
$y += 8

foreach ($it in $p.fill) {
    $head = "{0}." -f $it.n
    Txt $head $fNum $black $ML $y $CW | Out-Null
    $body = "{0}   {1}" -f $it.text, ("(" + $it.hint + ")")
    $th = Txt $body $fBody $black ($ML + 20) $y ($CW - 20)
    $y += [Math]::Max($th, 15) + 20
}

$y += 8

# ---- section 2: true / false ---------------------------------------------
$y += Txt "二、易错易混（判断正误，错的在后面写一句更正）" $fSec $black $ML $y $CW
$y += 8

foreach ($it in $p.traps) {
    $head = "{0}." -f $it.n
    Txt $head $fNum $black $ML $y $CW | Out-Null
    $body = $it.text + "     (          )"
    $th = Txt $body $fBody $black ($ML + 20) $y ($CW - 20)
    $y += [Math]::Max($th, 15) + 34
}

$y += 6

# ---- section 3: rolling review -------------------------------------------
$y += Txt "三、滚动复习" $fSec $black $ML $y $CW
if ($p.roll.Count -eq 0) {
    $y += Txt $p.rollNote $fMeta $faint $ML $y $CW
} else {
    foreach ($it in $p.roll) {
        $head = "{0}. [{1}]" -f $it.n, $it.tag
        Txt $head $fNum $black $ML $y $CW | Out-Null
        $th = Txt $it.text $fBody $black ($ML + 56) $y ($CW - 56)
        $y += [Math]::Max($th, 15) + 16
    }
}

$y += 10

# ---- section 4: self check ------------------------------------------------
$g.DrawLine($penG, $ML, $y, $W - $MR, $y)
$y += 8
$n1 = $p.fill.Count
$n2 = $p.traps.Count
$n3 = $p.roll.Count
$line = "填空 ____ / {0}      易错 ____ / {1}      滚动 ____ / {2}      用时 ____ 分" -f $n1, $n2, $n3
$y += Txt $line $fBody $black $ML $y $CW
$y += Txt "今日卡点：______________________________________________________________" $fBody $black $ML $y $CW
$y += Txt "其他备注：______________________________________________________________" $fBody $black $ML $y $CW

# ---- footer: answers ------------------------------------------------------
$fy = $PH - 168
$g.DrawLine($penD, $ML, $fy, $W - $MR, $fy)
$fy += 7
$fy += Txt "答案（做完再看）" $fMeta $black $ML $fy $CW

$half = [int]($CW / 2)
$rows1 = [Math]::Ceiling($n1 / 2)
$colA = @()
$colB = @()
$i = 0
foreach ($a in $p.answersFill) {
    $i++
    $t = "{0}. {1}" -f $i, $a
    if ($i -le $rows1) { $colA += $t } else { $colB += $t }
}
$cyA = $fy + 2
foreach ($t in $colA) { $cyA += (Txt $t $fSmall $black $ML $cyA ($half - 6)) }
$cyB = $fy + 2
foreach ($t in $colB) { $cyB += (Txt $t $fSmall $black ($ML + $half) $cyB ($half - 4)) }
$ty0 = [Math]::Max($cyA, $cyB)
$ty = $ty0 + 6

$traps = @()
$i = 0
foreach ($a in $p.answersTrap) {
    $i++
    $traps += ("{0} {1} ({2})" -f $i, $a, $p.traps[$i - 1].fix)
}
$ty += Txt ("易错：" + ($traps -join "   ")) $fSmall $grey $ML $ty $CW

$gy = $PH - 24
Txt $p.foot $fSmall $faint $ML $gy $CW | Out-Null

# ---- output ---------------------------------------------------------------
if ($Preview -ne "") {
    $outPath = [System.IO.Path]::GetFullPath($Preview)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("preview written: " + $outPath + " (" + $bmp.Width + "x" + $bmp.Height + ")")
} elseif ($Printer -ne "") {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = "NEURO-LOOP politics daily"
    $doc.PrinterSettings.PrinterName = $Printer
    if (-not $doc.PrinterSettings.IsValid) { throw ("printer not valid: " + $Printer) }
    $doc.DefaultPageSettings.Landscape = $false
    $doc.DefaultPageSettings.Color = $true
    $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins 10, 10, 10, 10
    $script:img = $bmp
    $handler = {
        param($sender, $e)
        $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
        $mb = $e.MarginBounds
        $dw = $mb.Width
        $dh = [int]($dw * $script:img.Height / $script:img.Width)
        $e.Graphics.DrawImage($script:img, [int]$mb.Left, [int]$mb.Top, [int]$dw, [int]$dh)
    }
    $doc.add_PrintPage($handler)
    $doc.Print()
    Write-Output ("printed to: " + $Printer)
} else {
    $outPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) "pol-preview.png"))
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("no target given; wrote " + $outPath)
}

$g.Dispose()
$bmp.Dispose()
