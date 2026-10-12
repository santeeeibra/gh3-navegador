@echo off
cd /d "%~dp0"
node tools/r5-live-menu/build.mjs
if errorlevel 1 exit /b 1
node tools/r5-live-menu/build-runtime.mjs
if errorlevel 1 exit /b 1
echo Abri http://127.0.0.1:5196/ y elegi la carpeta del juego.
echo Esta prueba muestra solamente parte del menu original.
node tools/r5-live-menu/serve-runtime.mjs 5196
