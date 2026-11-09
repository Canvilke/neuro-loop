$ErrorActionPreference = 'Continue'
$prn = Get-CimInstance Win32_Printer | Where-Object { $_.PortName -eq 'USB001' } | Select-Object -First 1
if (-not $prn) { Write-Output 'no printer on USB001'; exit 1 }
Write-Output ('before: offline=' + $prn.WorkOffline + ' status=' + $prn.PrinterStatus)
$w = Get-WmiObject -Class Win32_Printer -Filter "PortName='USB001'"
try { $w.WorkOffline = $false; $w.Put() | Out-Null } catch { Write-Output ('put failed: ' + $_.Exception.Message) }
Start-Sleep -Seconds 2
$prn2 = Get-CimInstance Win32_Printer | Where-Object { $_.PortName -eq 'USB001' } | Select-Object -First 1
Write-Output ('after: offline=' + $prn2.WorkOffline + ' status=' + $prn2.PrinterStatus)
