cd 'd:\guitar hero'

Write-Host "Limpiando deploy-app anterior..." -ForegroundColor Yellow
Remove-Item -Path 'artifacts/privado/deploy-app' -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Configurando variables de entorno..." -ForegroundColor Yellow
$env:GH3_SRC = 'artifacts/d1-wasm/audioworklet-60/demo'
$env:GH3_NO_CHUNKS = '1'
$env:GH3_DST = 'artifacts/privado/deploy-app/.vercel/output/static/gh3'

Write-Host "Ejecutando stage-privado.mjs..." -ForegroundColor Yellow
node tools/ui3/stage-privado.mjs

Write-Host "Agregando analytics..." -ForegroundColor Yellow
node tools/analytics/stage-feedback.mjs artifacts/privado/deploy-app/.vercel/output/static/gh3 -ErrorAction SilentlyContinue
node tools/analytics/stage-dashboard.mjs artifacts/privado/deploy-app/.vercel/output/estadisticas
node tools/analytics/patch-vercel-config.mjs artifacts/privado/deploy-app/.vercel/output -ErrorAction SilentlyContinue

Write-Host "Deploy-app armado. Iniciando deploy a Vercel preview..." -ForegroundColor Green
cd artifacts/privado/deploy-app
vercel deploy --prebuilt --yes --scope guitarra-heroe

Write-Host "Deploy completado!" -ForegroundColor Green
