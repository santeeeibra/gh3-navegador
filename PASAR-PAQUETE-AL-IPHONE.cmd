@echo off
cd /d "%~dp0"
echo Pasa el paquete de diagnostico GH3 al iPhone por el Wi-Fi de casa (1 MB/s). Para sin limite: PASAR-PAQUETE-AL-IPHONE.cmd rapido
node tools/d1-wasm/mobilediag-share.mjs %1
pause
