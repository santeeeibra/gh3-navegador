@echo off
rem Claude 2026-10-24: avisos push del panel. 1) SQL en Supabase (lo pegas vos)  2) claves  3) funcion gh3-push  4) sitio.
cd /d "%~dp0"
call node tools\analytics\push-armar.mjs || goto :error
echo 1/4 Copiando el SQL al portapapeles y abriendo el editor SQL de Supabase...
powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 artifacts\analytics\push-schema-LISTO.sql | Set-Clipboard" || goto :error
start "" "https://supabase.com/dashboard/project/nvlwlmyuqorxaupcdbdb/sql/new"
echo    Pega con Ctrl+V, toca Run y espera. Si pregunta por "destructive operations" (unschedule), acepta.
echo    Cuando termine, volve aca y apreta una tecla.
pause
echo 2/4 Guardando las claves de los avisos en Supabase...
call supabase secrets set --env-file artifacts\analytics\push-secrets.env --project-ref nvlwlmyuqorxaupcdbdb || goto :error
echo 3/4 Publicando la funcion de avisos...
call supabase functions deploy gh3-push --project-ref nvlwlmyuqorxaupcdbdb --no-verify-jwt --workdir tools\analytics\deploy-supabase || goto :error
cd /d "%~dp0artifacts\pages-gh3"
echo 4/4 Publicando el sitio. Cuenta de Cloudflare (tiene que ser fikadesign3@gmail.com):
call wrangler whoami | findstr /i "fikadesign3" || goto :error
call wrangler pages deploy site --project-name lvh3 --branch main --commit-dirty=true || goto :error
echo.
echo LISTO. Abri el panel desde el atajo del celular y toca "Activar avisos".
pause
exit /b 0
:error
echo.
echo ERROR: no se termino. Copiale a Claude lo que aparece arriba.
pause
exit /b 1
