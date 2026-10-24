@echo off
cd /d "D:\guitar hero"
echo PRUEBA MEJORA: shaders de fabrica (53) + autopista 50 por segundo.
echo (se preparan en la carga y el menu, no en plena cancion).
echo Calidad completa. Tu memoria de shaders se mantiene entre partidas.
echo Juga Slow Ride u otra cancion, mirando el ESCENARIO: no deberia congelarse un momento.
echo.
echo *** Apreta la tecla M cada vez que veas un lagazo o tiron. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil mejora --root artifacts/d1-wasm/fluido/mejora/demo --calidad completo --manual --libre --sincaptura --grabar --pipelista
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
