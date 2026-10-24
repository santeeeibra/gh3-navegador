@echo off
rem Claude 2026-10-14: sube UNA SOLA VEZ las partes del juego (3,6 GB) al proyecto aparte sante11/lvh3-datos
rem (https://lvh3-datos.vercel.app). Despues los deploys normales suben solo ~95 MB. Correr ANTES de 2-PUBLICAR-GH3.cmd.
cd /d "%~dp0artifacts\privado\deploy-datos"
echo Cuenta de Vercel (tiene que ser santigutierreznew):
call vercel whoami || goto :error
call vercel project add lvh3-datos --scope guitarra-heroe
call vercel link --yes --project lvh3-datos --scope guitarra-heroe || goto :error
call vercel deploy --prebuilt --prod --yes --scope guitarra-heroe || goto :error
echo.
echo LISTO (datos). Avisale a Claude que termino.
pause
exit /b 0
:error
echo.
echo ERROR: no se subio. Copiale a Claude lo que aparece arriba.
pause
exit /b 1
