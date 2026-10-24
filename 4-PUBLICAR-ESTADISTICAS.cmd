@echo off
rem Claude 2026-10-22 (v2): panel de estadisticas. 1) SQL en Supabase (lo pegas vos)  2) funcion del panel
rem 3) funcion que recibe los eventos (latidos en gh3_live_sessions)  4) sitio en Cloudflare Pages.
cd /d "%~dp0"
echo 1/4 Copiando el SQL al portapapeles y abriendo el editor SQL de Supabase...
powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 tools\analytics\supabase\dashboard-summary.sql | Set-Clipboard" || goto :error
start "" "https://supabase.com/dashboard/project/nvlwlmyuqorxaupcdbdb/sql/new"
echo    En la pagina: pega con Ctrl+V, toca Run y espera que termine (puede tardar un minuto).
echo    Al final muestra una tabla con una sola fila "gh3_rollup_ensure" vacia: eso esta bien.
echo    Cuando termine, volve aca y apreta una tecla.
pause
echo 2/4 Publicando la funcion del panel en Supabase...
call supabase functions deploy gh3-analytics-dashboard --project-ref nvlwlmyuqorxaupcdbdb --no-verify-jwt --workdir tools\analytics\deploy-supabase || goto :error
echo 3/4 Publicando la funcion que recibe los eventos...
call supabase functions deploy gh3-analytics --project-ref nvlwlmyuqorxaupcdbdb --no-verify-jwt --workdir tools\analytics\deploy-supabase || goto :error
cd /d "%~dp0artifacts\pages-gh3"
echo 4/4 Publicando el sitio. Cuenta de Cloudflare (tiene que ser fikadesign3@gmail.com):
call wrangler whoami | findstr /i "fikadesign3" || goto :error
call wrangler pages deploy site --project-name lvh3 --branch main --commit-dirty=true || goto :error
echo.
echo LISTO. Avisale a Claude que termino.
pause
exit /b 0
:error
echo.
echo ERROR: no se termino de publicar. Copiale a Claude lo que aparece arriba.
pause
exit /b 1
