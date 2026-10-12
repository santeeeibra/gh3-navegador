@echo off
cd /d "%~dp0"
set "GH3_LOADER_OUT=artifacts/all-songs"
node tools/local-loader/build-all-songs.mjs
if errorlevel 1 exit /b 1
echo Abrir http://127.0.0.1:5450/ cuando el turno de pruebas este libre.
node tools/local-loader/server.mjs 5450
