param(
  [ValidateSet('Run','Status','Pause','Stop','Resume','Retry')][string]$Action='Status',
  [string]$Queue='tools/autonomy/smoke-queue.json',
  [string]$Task,
  [switch]$AllowWork
)
$controllerRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location -LiteralPath $controllerRoot
try {
  $controllerArgs = @((Join-Path $PSScriptRoot 'controller.mjs'),$Action.ToLowerInvariant())
  if ($Action -eq 'Run') { $controllerArgs += $Queue }
  if ($Action -eq 'Retry') { if (!$Task) { throw 'Retry requiere -Task' }; $controllerArgs += $Task }
  if ($AllowWork) { $controllerArgs += '--allow-work' }
  & node @controllerArgs
  if ($LASTEXITCODE -ne 0) { throw "El controlador terminó con código $LASTEXITCODE. Revisar artifacts/autonomy/RESUMEN.md y logs." }
} finally { Pop-Location }
