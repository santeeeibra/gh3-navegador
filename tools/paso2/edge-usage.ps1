# paso2 (Claude 2026-10-15): CPU y GPU de los procesos msedge de UNA corrida (perfil con $Pattern en la línea de comandos)
# durante $Seconds segundos. CPU = segundos de procesador / segundos de pared ×100 (100 = un núcleo entero).
# GPU = suma de "GPU Engine\Utilization Percentage" de esos procesos (promedio de las muestras), 3D y todos los motores.
param([string]$Pattern, [int]$Seconds = 60)
$ids = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$Pattern*" } | ForEach-Object { [int]$_.ProcessId })
function Cpu { $s = 0.0; foreach ($i in $ids) { try { $s += (Get-Process -Id $i -ErrorAction Stop).TotalProcessorTime.TotalSeconds } catch {} }; $s }
$c0 = Cpu; $t0 = Get-Date
$n = [Math]::Max(1, [int]($Seconds / 2))
$samples = Get-Counter '\GPU Engine(*)\Utilization Percentage' -SampleInterval 2 -MaxSamples $n -ErrorAction SilentlyContinue
$c1 = Cpu; $wall = ((Get-Date) - $t0).TotalSeconds
$g3d = @(); $gall = @()
foreach ($s in $samples) {
  $a = 0.0; $b = 0.0
  foreach ($c in $s.CounterSamples) {
    if ($c.InstanceName -match '^pid_(\d+)_') { if ($ids -contains [int]$Matches[1]) { $b += $c.CookedValue; if ($c.InstanceName -like '*engtype_3D') { $a += $c.CookedValue } } }
  }
  $g3d += $a; $gall += $b
}
$avg = { param($x) if ($x.Count) { [Math]::Round((($x | Measure-Object -Sum).Sum / $x.Count), 2) } else { $null } }
[pscustomobject]@{ pids = $ids.Count; wallSec = [Math]::Round($wall, 1); cpuSec = [Math]::Round($c1 - $c0, 2); cpuPctOneCore = [Math]::Round(($c1 - $c0) / $wall * 100, 1); gpu3dPct = (& $avg $g3d); gpuAllPct = (& $avg $gall); samples = $g3d.Count } | ConvertTo-Json -Compress
