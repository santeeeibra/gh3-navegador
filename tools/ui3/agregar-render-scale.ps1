# Claude 2026-10-22: agrega <script src="gh3-render-scale.js"> al index del sitio (lo usa 3-PREPARAR-OP2PUB.cmd). Idempotente.
param([string]$f)
$t = [IO.File]::ReadAllText($f)
if ($t.Contains('gh3-render-scale.js')) { Write-Host 'index ya tenia gh3-render-scale.js'; exit 0 }
$a = '<head><script src="native60-page.js"></script><script>'
$b = '<head><script src="native60-page.js"></script><script src="gh3-render-scale.js"></script><script>'
if (-not $t.Contains($a)) { Write-Host 'No encontre el lugar en index.html'; exit 1 }
[IO.File]::WriteAllText($f, $t.Replace($a, $b))
Write-Host 'index.html actualizado'
