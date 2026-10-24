@echo off
cd /d "D:\guitar hero"
echo PRUEBA 3: Autopista como antes (tope de 60 por segundo), para comparar
echo Esta es la autopista de la version publicada. Compara con la 1 y la 2.
echo.
echo *** Apreta la tecla M cada vez que oigas un corte, chasquido o salto de sonido. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil estable2 --root artifacts/d1-wasm/estable2/demo --calidad completo --manual --libre --sincaptura --grabar --q a60div=0
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
