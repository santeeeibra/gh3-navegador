@echo off
cd /d "D:\guitar hero"
echo PRUEBA 1: Version estable2 tal cual (autopista 50 por segundo, precarga, tecla M)
echo Jugala 10 minutos con la cancion que quieras. Fijate si la autopista se ve pareja.
echo.
echo *** Apreta la tecla M cada vez que oigas un corte, chasquido o salto de sonido. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil estable2 --root artifacts/d1-wasm/estable2/demo --calidad completo --manual --libre --sincaptura --grabar
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
