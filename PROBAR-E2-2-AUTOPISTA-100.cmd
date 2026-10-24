@echo off
cd /d "D:\guitar hero"
echo PRUEBA 2: Autopista a 100 por segundo (mas fluida, el juego puede ir un poco mas lento)
echo Compara con la prueba 1: se ve mas suave? Se traba algo?
echo.
echo *** Apreta la tecla M cada vez que oigas un corte, chasquido o salto de sonido. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil estable2 --root artifacts/d1-wasm/estable2/demo --calidad completo --manual --libre --sincaptura --grabar --q a60div=1
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
