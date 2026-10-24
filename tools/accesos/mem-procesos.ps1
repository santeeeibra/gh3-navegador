# Claude 2026-10-15 (paso 4, memoria iPhone): memoria de los procesos msedge de una corrida de prueba, por tipo.
# privadaMB = memoria privada residente (lo más parecido a lo que cuenta iOS para cerrar la pestaña); comprometidaMB = reservada/comprometida.
param([string]$Pattern)
$perf = @{}
Get-CimInstance Win32_PerfRawData_PerfProc_Process | ForEach-Object { $perf[[int]$_.IDProcess] = $_ }
$out = @()
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$Pattern*" } | ForEach-Object {
  $tipo = 'navegador'
  if ($_.CommandLine -match '--type=(\S+)') { $tipo = $Matches[1] }
  if ($_.CommandLine -match '--utility-sub-type=(\S+)') { $tipo += ':' + $Matches[1] }
  $p = $perf[[int]$_.ProcessId]
  if ($p) { $out += [pscustomobject]@{ pid = $_.ProcessId; tipo = $tipo; privadaMB = [math]::Round($p.WorkingSetPrivate / 1MB); comprometidaMB = [math]::Round($p.PrivateBytes / 1MB) } }
}
$out | ConvertTo-Json -Compress
