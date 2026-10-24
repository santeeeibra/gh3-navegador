@echo off
rem Claude 2026-10-14: publica programa + pagina (~95 MB) en lasvegasherogame.com/gh3/ (sante11/gh3-privado).
rem Las partes del juego se piden a lvh3-datos (subidas una vez con 1-SUBIR-DATOS-GH3-UNA-VEZ.cmd).
rem Copia de la pagina que se publica: GH3_SRC (cambiarla aca cuando haya una version nueva).
cd /d "%~dp0"
set GH3_SRC=artifacts/d1-wasm/sunshine/demo
set GH3_DST=artifacts/privado/deploy-app/.vercel/output/static/gh3
set GH3_NO_CHUNKS=1
node tools/ui3/stage-privado.mjs || goto :error
node tools/analytics/stage-feedback.mjs artifacts/privado/deploy-app/.vercel/output/static/gh3 || goto :error
node tools/analytics/stage-dashboard.mjs artifacts/privado/deploy-app/.vercel/output/static/estadisticas || goto :error
node tools/analytics/patch-vercel-config.mjs artifacts/privado/deploy-app/.vercel/output || goto :error
cd /d "%~dp0artifacts\privado\deploy-app"
echo Cuenta de Vercel (tiene que ser santigutierreznew):
call vercel whoami || goto :error
call vercel project add gh3-privado --scope guitarra-heroe
call vercel link --yes --project gh3-privado --scope guitarra-heroe || goto :error
call vercel deploy --prebuilt --prod --yes --scope guitarra-heroe || goto :error
echo.
echo LISTO. Avisale a Claude que termino.
pause
exit /b 0
:error
echo.
echo ERROR: no se publico. Copiale a Claude lo que aparece arriba.
pause
exit /b 1
