@echo off
cd /d "D:\guitar hero"
echo PRUEBA 4: Jugador nuevo: perfil vacio, para ver la precarga
echo Arranca sin nada guardado, como alguien que entra por primera vez.
echo Quedate 1 o 2 minutos en el menu antes de elegir cancion: ahi baja los escenarios.
echo Despues juga 2 o 3 canciones distintas y fijate cuanto tarda cada pantalla de carga.
echo.
echo *** Apreta la tecla M cada vez que oigas un corte, chasquido o salto de sonido. ***
echo Aparece un cartel "Marca N guardada" abajo a la izquierda.
echo Para terminar, cerra la ventana de Edge. Despues se muestran los resumenes.
echo.
node tools/modelos/med.mjs rapida --perfil e2nuevo%RANDOM% --root artifacts/d1-wasm/estable2/demo --calidad completo --manual --libre --sincaptura --grabar
node tools/modelos/resumen-audio.mjs
node tools/modelos/resumen-grabadora.mjs
pause
