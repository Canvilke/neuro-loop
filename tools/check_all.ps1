# check_all.ps1 -- one-shot gate for the Neuro-Loop repo.
#
# Runs, from the repo root:
#   1) python build.py --check
#   2) node test/smoke.cjs
#   3) node test/levels.cjs
#   4) node test/boot.cjs
#   5) node test/net.cjs
#   6) node test/host.mjs
#   7) node test/core.test.mjs
#   8) node test/legacy.test.mjs
#   9) node test/storage.test.mjs
#  11) node test/dispatch.test.mjs
#  12) node test/intake.test.mjs
#   9) python tools/activate.py
#
# Prints a PASS/FAIL summary and exits non-zero if any step fails.
# ASCII ONLY: PowerShell 5.1 reads BOM-less files as ANSI, so do not add
# non-ASCII characters to this file. Chinese belongs in JSON, not here.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

# --- gate lock -------------------------------------------------------------
# Two agents running this gate at the same time will rebuild client.js twice and
# read each other's half-written output. Observed as a flaky test/net.cjs.
# Serialize with a directory lock; steal it only when it is clearly abandoned.
$lockDir = Join-Path $PSScriptRoot '.gate.lock'
$gotLock = $false
for ($i = 0; $i -lt 150; $i++) {
    try {
        New-Item -ItemType Directory -Path $lockDir -ErrorAction Stop | Out-Null
        $gotLock = $true
        break
    } catch {
        if (Test-Path $lockDir) {
            $age = ((Get-Date) - (Get-Item $lockDir).LastWriteTime).TotalSeconds
            if ($age -gt 900) { Remove-Item $lockDir -Recurse -Force -ErrorAction SilentlyContinue; continue }
            Start-Sleep -Seconds 2
        } else {
            Start-Sleep -Milliseconds 200
        }
    }
}
if (-not $gotLock) {
    Write-Host 'FAIL  another gate is running (lock .gate.lock) -- try again later'
    exit 2
}
function Release-GateLock {
    Remove-Item $lockDir -Recurse -Force -ErrorAction SilentlyContinue
}

$results = New-Object System.Collections.ArrayList

function Invoke-Step {
    param(
        [string]$Name,
        [string]$Exe,
        [string[]]$Arguments
    )

    Write-Host ''
    Write-Host ('=== ' + $Name + ' ===')

    $code = 1
    try {
        & $Exe @Arguments
        $code = $LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
    }
    catch {
        Write-Host ('ERROR: ' + $_.Exception.Message)
        $code = 1
    }

    if ($code -ne 0) {
        Write-Host ('--- FAIL: ' + $Name + ' (exit ' + $code + ')')
    }

    [void]$results.Add([pscustomobject]@{ Name = $Name; Code = $code })
}

Write-Host 'NEURO-LOOP check_all'
Write-Host ('repo: ' + $repo)

Invoke-Step -Name 'build.py --check'   -Exe 'python' -Arguments @('build.py', '--check')
Invoke-Step -Name 'test/smoke.cjs'    -Exe 'node'   -Arguments @('test/smoke.cjs')
Invoke-Step -Name 'test/levels.cjs'   -Exe 'node'   -Arguments @('test/levels.cjs')
Invoke-Step -Name 'test/boot.cjs'     -Exe 'node'   -Arguments @('test/boot.cjs')
Invoke-Step -Name 'test/net.cjs'      -Exe 'node'   -Arguments @('test/net.cjs')
Invoke-Step -Name 'test/host.mjs'     -Exe 'node'   -Arguments @('test/host.mjs')
Invoke-Step -Name 'test/core.test.mjs' -Exe 'node'  -Arguments @('test/core.test.mjs')
Invoke-Step -Name 'test/legacy.test.mjs' -Exe 'node' -Arguments @('test/legacy.test.mjs')
Invoke-Step -Name 'test/storage.test.mjs' -Exe 'node' -Arguments @('test/storage.test.mjs')
Invoke-Step -Name 'test/dispatch.test.mjs' -Exe 'node' -Arguments @('test/dispatch.test.mjs')
Invoke-Step -Name 'test/bus.test.mjs' -Exe 'node' -Arguments @('test/bus.test.mjs')
Invoke-Step -Name 'test/room.test.mjs' -Exe 'node' -Arguments @('test/room.test.mjs')
Invoke-Step -Name 'test/intake.test.mjs' -Exe 'node' -Arguments @('test/intake.test.mjs')
Invoke-Step -Name 'tools/check_contract.mjs' -Exe 'node' -Arguments @('tools/check_contract.mjs')
Invoke-Step -Name 'tools/activate.py' -Exe 'python' -Arguments @('tools/activate.py')

$failed = @($results | Where-Object { $_.Code -ne 0 })

Write-Host ''
Write-Host '================ SUMMARY ================'
foreach ($r in $results) {
    if ($r.Code -eq 0) { $tag = 'PASS' } else { $tag = 'FAIL' }
    Write-Host ('{0}  {1}' -f $tag, $r.Name)
}
Write-Host '-----------------------------------------'
Write-Host ('{0} passed, {1} failed' -f ($results.Count - $failed.Count), $failed.Count)

Release-GateLock
if ($failed.Count -gt 0) {
    exit 1
}
exit 0
