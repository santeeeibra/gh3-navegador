# Claude 2026-10-12: limita los núcleos de los procesos msedge de una corrida de prueba (simula un celular con pocos núcleos).
param([long]$Mask, [string]$Pattern)
$n = 0
Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" | Where-Object { $_.CommandLine -like "*$Pattern*" } | ForEach-Object {
  try { (Get-Process -Id $_.ProcessId).ProcessorAffinity = [IntPtr]$Mask; $n++ } catch {}
}
$n
