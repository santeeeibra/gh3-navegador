@echo off
cd /d "D:\guitar hero"
echo PRUEBA EQUIPO: analisis del dispositivo + calibrar sonido/imagen (copia local, sin publicar).
echo 1) Al abrir sale "Preparando tu escenario" (unos 6 segundos). Despues abri Ajustes > Mi equipo y anota la linea completa (WebGPU, CPU, graficos, tirones).
echo 2) Puede recargarse sola una vez. Despues te ofrece "Calibrar sonido e imagen": proba Calibrar ahora (tocas con el teclado) y tambien Omitir en otra corrida.
echo 3) En el panel Ajustes hay una seccion "Mi equipo" con "Medir de nuevo" y "Calibrar".
echo 4) Jugá una cancion un rato: tiene que andar igual que antes (fluida, sin lagazos).
echo Para terminar, cerra la ventana de Edge.
echo.
node tools/modelos/med.mjs rapida --perfil equipo --root artifacts/d1-wasm/equipo/demo --calidad completo --manual --libre --sincaptura --grabar --pipelista --aceptar 8
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
