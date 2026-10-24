@echo off
rem Claude 2026-10-21: sube a Cloudflare Pages (proyecto lvh3, dominio lasvegasherogame.com) lo armado en artifacts\pages-gh3\site.
rem Wrangler solo sube lo que cambio (las partes en gh3\chunks ya estan). El wasm sigue en Cloudflare R2.
rem Cuenta de Cloudflare: fikadesign3@gmail.com (si wrangler whoami muestra otra, correr: wrangler logout y wrangler login).
cd /d "%~dp0artifacts\pages-gh3"
echo Cuenta de Cloudflare (tiene que ser fikadesign3@gmail.com):
call wrangler whoami | findstr /i "fikadesign3" || goto :error
call wrangler pages deploy site --project-name lvh3 --branch main --commit-dirty=true || goto :error
echo.
echo LISTO. Avisale a Claude que termino.
pause
exit /b 0
:error
echo.
echo ERROR: no se publico. Copiale a Claude lo que aparece arriba.
pause
exit /b 1
