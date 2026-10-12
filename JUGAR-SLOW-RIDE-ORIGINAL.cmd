@echo off
cd /d "%~dp0"
powershell -NoProfile -Command "if (-not (Test-NetConnection 127.0.0.1 -Port 5424 -WarningAction SilentlyContinue).TcpTestSucceeded) { Start-Process -FilePath 'node' -ArgumentList 'tools/r5-live-song/serve-live.mjs','5424' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden }"
echo Abrir en Edge: http://127.0.0.1:5424/?r5lite=1
echo Elegir la carpeta con default.xex y DATA, Arrancar, Ir directo a tocar.
