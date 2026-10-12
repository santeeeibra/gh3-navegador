@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "if (-not (Test-NetConnection 127.0.0.1 -Port 5432 -WarningAction SilentlyContinue).TcpTestSucceeded) { Start-Process -FilePath 'node' -ArgumentList 'tools/d1-wasm/serve-r5pipe.mjs','5432' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden }"
echo Prueba Claude (2 cuadros en vuelo). Abrir en Edge: http://127.0.0.1:5432/?r5lite=1
echo Elegir la carpeta con default.xex y DATA, Arrancar, Ir directo a tocar.
start "" msedge "http://127.0.0.1:5432/?r5lite=1"
