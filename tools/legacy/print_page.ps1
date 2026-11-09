# print_page.ps1 -- render the daily page as a FLAT A4 sheet and print it.
#
# Why this file exists: pages containing gradients / large translucent fills get
# purged by the spooler (printed=0). Pure solid fills + hairlines + text print.
# Keep this script ASCII-only: PowerShell 5.1 reads BOM-less files as ANSI, so
# any Chinese literal here would corrupt the parser. Chinese text comes from JSON.
#
# Usage:
#   powershell -File print_page.ps1 -Json daily\2026-11-09.json -Preview out.png
#   powershell -File print_page.ps1 -Json daily\2026-11-09.json -Printer "EPSON L3250 Series (副本 1)"
param(
    [Parameter(Mandatory = $true)][string]$Json,
    [string]$Preview = "",
    [string]$Printer = ""
)

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$raw = [System.IO.File]::ReadAllText((Resolve-Path $Json), [System.Text.Encoding]::UTF8)
$page = $raw | ConvertFrom-Json

# 96-dpi design space; bitmap is rendered at 2x for crisp print.
$W = 794
$H = 1123
$SCALE = 2
$ML = 44
$MR = 44
$CW = $W - $ML - $MR

$bmp = New-Object System.Drawing.Bitmap ($W * $SCALE), ($H * $SCALE)
$bmp.SetResolution(96, 96)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.ScaleTransform($SCALE, $SCALE)
$g.Clear([System.Drawing.Color]::White)

$black = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::Black)
$grey = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 90, 90))
$light = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(238, 238, 238))
$penBlack = New-Object System.Drawing.Pen ([System.Drawing.Color]::Black), 1.2
$penGrey = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(120, 120, 120)), 0.8

$fam = "Microsoft YaHei"
function F([double]$pt, [System.Drawing.FontStyle]$style) {
    New-Object System.Drawing.Font($fam, $pt, $style, [System.Drawing.GraphicsUnit]::Point)
}
$fTitle = F 15 ([System.Drawing.FontStyle]::Bold)
$fSub = F 8.4 ([System.Drawing.FontStyle]::Regular)
$fSec = F 9.6 ([System.Drawing.FontStyle]::Bold)
$fName = F 10.6 ([System.Drawing.FontStyle]::Bold)
$fBody = F 9.6 ([System.Drawing.FontStyle]::Regular)
$fMeta = F 8.2 ([System.Drawing.FontStyle]::Regular)
$fSmall = F 7.6 ([System.Drawing.FontStyle]::Regular)

# Draws wrapped text inside a width; returns the height it used.
function Txt($text, $font, $brush, [double]$x, [double]$y, [double]$w) {
    if ($null -eq $text) { $text = "" }
    if ($text -eq "") { return 0 }
    $rect = New-Object System.Drawing.RectangleF $x, $y, $w, 10000
    $size = $g.MeasureString($text, $font, $rect.Size)
    $g.DrawString($text, $font, $brush, $rect)
    return $size.Height
}

$y = 38
$y += Txt $page.title $fTitle $black $ML $y $CW
$sub = ("{0}  周{1}   {2}" -f $page.date, $page.weekday, $page.subtitle)
$y += Txt $sub $fSub $grey $ML ($y + 2) $CW
$y += 8
$g.DrawLine($penBlack, $ML, $y, $W - $MR, $y)
$y += 12

# ---- section 1 -------------------------------------------------------------
$y += Txt "一、今天复现三条（合上书：先写判据，再写步骤）" $fSec $black $ML $y $CW
$y += 6

$idx = 0
foreach ($m in $page.reproduce) {
    $idx++
    $boxTop = $y
    $pad = 7
    $inner = $CW - 2 * $pad
    $ty = $boxTop + $pad
    $ty += Txt ("{0}. {1}" -f $idx, $m.name) $fName $black ($ML + $pad) $ty $inner
    $ty += 1
    $ty += Txt $m.claim $fBody $black ($ML + $pad) $ty $inner
    $judge = "判据：" + $m.judge
    $ty += Txt $judge $fMeta $grey ($ML + $pad) $ty $inner
    if ($m.instances.Count -gt 0) {
        $s = "模型：" + ($m.instances -join "、")
        $ty += Txt $s $fMeta $grey ($ML + $pad) $ty $inner
    }
    if ($m.traps.Count -gt 0) {
        $s = "常错：" + ($m.traps -join "；")
        $ty += Txt $s $fMeta $grey ($ML + $pad) $ty $inner
    }
    $ty += 30   # writing space
    $boxH = $ty - $boxTop + $pad
    $g.DrawRectangle($penGrey, $ML, $boxTop, $CW, $boxH)
    $y = $boxTop + $boxH + 8
}

# ---- section 2 -------------------------------------------------------------
$y += 2
$y += Txt "二、昨天错因一条（写清：当时怎么想的）" $fSec $black $ML $y $CW
$y += 6
$boxTop = $y
$pad = 7
$ty = $boxTop + $pad
$ytext = $page.yesterday.text
if ([string]::IsNullOrWhiteSpace($ytext)) {
    $ytext = "（昨天没有记录，手写一条今天最想弄明白的）"
} elseif ($page.yesterday.node) {
    $ytext = $page.yesterday.node + "  --  " + $ytext
}
$ty += Txt $ytext $fMeta $grey ($ML + $pad) $ty ($CW - 2 * $pad)
$ty += 42
$boxH = $ty - $boxTop + $pad
$g.DrawRectangle($penGrey, $ML, $boxTop, $CW, $boxH)
$y = $boxTop + $boxH + 10

# ---- section 3: hint ladder ------------------------------------------------
$y += Txt "三、提示阶梯（卡住才升一级）" $fSec $black $ML $y $CW
$y += 6

$c0 = 26
$c1 = 150
$c2 = $CW - $c0 - $c1 - 120 - 78
$c3 = 120
$c4 = 78
$cols = @($c0, $c1, $c2, $c3, $c4)
$heads = @("#", "方法", "L1 方法名 · L2 第一步 · L3 关键词", "Recon 0-3", "Hint 0-2")

$rowTop = $y
$hx = $ML
for ($i = 0; $i -lt $cols.Count; $i++) {
    $g.FillRectangle($light, $hx, $rowTop, $cols[$i], 20)
    $g.DrawRectangle($penGrey, $hx, $rowTop, $cols[$i], 20)
    Txt $heads[$i] $fSmall $black ($hx + 4) ($rowTop + 5) ($cols[$i] - 8) | Out-Null
    $hx += $cols[$i]
}
$y = $rowTop + 20

$idx = 0
foreach ($m in $page.reproduce) {
    $idx++
    $rowH = 58
    $l1 = "L1 " + $m.name
    $j = $m.judge
    if ($j.Length -gt 22) { $j = $j.Substring(0, 22) }
    $l2 = "L2 " + $j
    $l3 = "L3 --"
    if ($m.traps.Count -gt 0) {
        $t = $m.traps[0]
        if ($t.Length -gt 24) { $t = $t.Substring(0, 24) }
        $l3 = "L3 " + $t
    }
    $hx = $ML
    $vals = @([string]$idx, $m.name, ($l1 + "`n" + $l2 + "`n" + $l3), "0  1  2  3", "0  1  2")
    for ($i = 0; $i -lt $cols.Count; $i++) {
        $g.DrawRectangle($penGrey, $hx, $y, $cols[$i], $rowH)
        $font = $fBody
        if ($i -eq 2) { $font = $fSmall }
        Txt $vals[$i] $font $black ($hx + 4) ($y + 4) ($cols[$i] - 8) | Out-Null
        $hx += $cols[$i]
    }
    $y += $rowH
}

$y += 10

# ---- section 4: subjects ---------------------------------------------------
$y += Txt "四、六科今日额度" $fSec $black $ML $y $CW
$y += 6
$sc = @(88, 62, 62, 62, 62, ($CW - 88 - 62 * 4))
$sheads = @("科目", "考点", "到期", "命中", "失误", "今天碰哪块")
$rowTop = $y
$hx = $ML
for ($i = 0; $i -lt $sc.Count; $i++) {
    $g.FillRectangle($light, $hx, $rowTop, $sc[$i], 19)
    $g.DrawRectangle($penGrey, $hx, $rowTop, $sc[$i], 19)
    Txt $sheads[$i] $fSmall $black ($hx + 4) ($rowTop + 5) ($sc[$i] - 8) | Out-Null
    $hx += $sc[$i]
}
$y = $rowTop + 19
foreach ($s in $page.subjects) {
    $vals = @($s.name, [string]$s.total, [string]$s.due, [string]$s.hits, [string]$s.misses, "")
    $hx = $ML
    for ($i = 0; $i -lt $sc.Count; $i++) {
        $g.DrawRectangle($penGrey, $hx, $y, $sc[$i], 22)
        Txt $vals[$i] $fBody $black ($hx + 4) ($y + 4) ($sc[$i] - 8) | Out-Null
        $hx += $sc[$i]
    }
    $y += 22
}

$y += 10
$y += Txt $page.foot $fSmall $grey $ML $y $CW

# ---- output ----------------------------------------------------------------
if ($Preview -ne "") {
    $outPath = [System.IO.Path]::GetFullPath($Preview)
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("preview written: " + $outPath + " (" + $bmp.Width + "x" + $bmp.Height + ")")
} elseif ($Printer -ne "") {
    $doc = New-Object System.Drawing.Printing.PrintDocument
    $doc.DocumentName = "NEURO-LOOP daily page"
    $doc.PrinterSettings.PrinterName = $Printer
    if (-not $doc.PrinterSettings.IsValid) {
        throw ("printer not valid: " + $Printer)
    }
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
    $outPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) "daily-preview.png"))
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output ("no target given; wrote " + $outPath)
}

$g.Dispose()
$bmp.Dispose()
