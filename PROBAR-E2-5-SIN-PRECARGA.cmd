@echo off
cd /d "D:\guitar hero"
echo PRUEBA 5: Jugador nuevo SIN precarga, para comparar con la 4
echo Igual que la 4 pero sin precarga. Las cargas deberian tardar mas.
echo.
echo *** Apreta la tecla M cada vez que oigas un corte, chasquido o salto de sonido. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil e2sinpre%RANDOM% --root artifacts/d1-wasm/estable2/demo --calidad completo --manual --libre --sincaptura --grabar --q precarga=0
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
