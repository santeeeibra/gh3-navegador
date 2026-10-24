@echo off
cd /d "D:\guitar hero"
echo PRUEBA SHADERS: estable2 + lista "de fabrica" de pipelines del escenario
echo (se preparan en la carga y el menu, no en plena cancion).
echo Arranca como un jugador nuevo (sin memoria de pipelines). Calidad completa.
echo Juga Slow Ride u otra cancion, mirando el ESCENARIO: no deberia congelarse un momento.
echo.
echo *** Apreta la tecla M cada vez que veas un lagazo o tiron. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil shaders --root artifacts/d1-wasm/fluido/shaders/demo --calidad completo --manual --libre --sincaptura --grabar --sinmemoria --pipelista
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
