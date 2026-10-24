# Prueba móvil y arranque privado

Público: https://riff-duel.vercel.app/iphone/ y /iphone/preparar.html. Estas páginas contienen infraestructura propia, sin programa, shaders ni recursos de GH3.

**Actualización RGBA posterior a la prueba de Santi:** su iPhone 11 no admite BC (también lo comprobó en Brave). El paquete actual ya no requiere BC: usa un Worker móvil que convierte a RGBA8. Peso actual 409.332.925 bytes. Probado en Edge con dispositivo sin BC: GH3 llegó a 40,35 s con imagen, audio y shader estrella; falta probar el arranque en iPhone. Detalle vigente: artifacts/mobile-private/RESULTADO-RGBA-2026-10-11.md. Las referencias BC y pasos condicionales de la entrega anterior que siguen abajo son historial, no la instrucción actual.

## Próxima acción de Santi

En su iPhone 11, abrir /iphone/?revision=2, tocar **4. Texturas para GH3** y enviar el resultado. La prueba crea y carga texturas sintéticas BC1/BC2/BC3/BC5 si el adaptador anuncia BC. No prueba muestras/shaders del juego ni rendimiento. Si BC falta, el renderer actual necesita adaptación; no iniciar importación pesada como si ya fuera compatible.

## Paquete privado

`node tools/iphone-probe/build-private.mjs` prepara `artifacts/mobile-private/GH3-Slow-Ride-privado.gh3mobile`, solo local. Para la entrega actual: 409.329.166 bytes, unos 390,4 MiB, 238 partes únicas, 14 archivos de programa y 46 dependencias base más los tres archivos de Slow Ride. Fuente del programa: copia de artifacts/local-loader/demo; recompila solo el consumidor de carretera para incluir la corrección de notas estrella 19815E13AC0DCC92. No modifica la fuente de Claude ni el cargador actual de PC. Los consumidores thread y live propios incorporan la selección de ese shader para sus reconstrucciones futuras.

Copiar el paquete desde la PC a **Archivos** del iPhone mediante el método que elija Santi. No es una descarga pública y la ruta de Windows no es un enlace web para el celular. No enviarlo a Vercel ni publicar sus contenidos. Seleccionarlo desde /iphone/preparar.html, guardarlo y abrir la prueba de arranque. Esta primera versión sigue usando render targets 1280×720 y no incorpora trastes táctiles de canción: prueba de arranque, no versión móvil terminada.

El importador valida cabecera, tamaños, rutas y SHA256 de partes de máximo 2 MiB. Guarda las partes en la caché ya utilizada por el cargador, sin volcar el paquete completo a RAM. Una importación interrumpida conserva partes y solo reemplaza la selección activa al terminar. Un Service Worker entrega el programa y los archivos desde IndexedDB; los nombres privados/faltantes nunca se reenvían al servidor. Las partidas existentes permanecen separadas de los paquetes. Al importar en un origen con partida previa, la prueba puede restaurarla: no borra guardados.

No certificar funcionamiento en iPhone por la prueba en Edge. Quedan Safari real, BC, compilación del wasm grande, RAM tocada por el motor y GPU/audio simultáneos. La caché no garantiza persistencia indefinida ni inicio completamente offline de la página pública.

## Pruebas realizadas

- `check-private.mjs`: partes dañadas y rutas ajenas rechazadas; importación, reapertura y Worker con fetch local; ausencias sin red; carga real de cuatro formatos BC en Edge.
- `check-private.mjs --game`: paquete real importado en Edge; GH3 con imagen/audio, reloj de canción registrado hasta 35,84 s y shader estrella observado en 10 muestras; cero errores de página y cero solicitudes privadas al servidor. Loop termina al superar 40 s de canción; el último sample conservado es anterior. No canción completa ni audición humana. El audio registra 4 underruns iniciales y no aumentó entre samples de 5,1–35,8 s.
- `check-public.mjs`: importador público probado con fixture propia pequeña, Worker/recursos servidos localmente, aislamiento activo, cero POST/subidas y cero errores. No importó GH3 al sitio desde esta prueba de producción.
- Regresiones existentes: npm test 24/24; tools/build.mjs correcto.

Los scripts que usan GPU/juego requieren reserva propia en artifacts/PRUEBAS-EN-CURSO.md. La reserva usada se liberó; navegador y servidor propios cerrados.

## Publicación de infraestructura

El build normal incluye las cinco páginas/scripts públicos de iphone. En esta tanda, `vercel build --prod --scope sante11` falló con `spawn cmd.exe ENOENT` aun ajustando PATH/ComSpec. Se ejecutó tools/build.mjs directamente y `prepare-public.mjs` generó Build Output API con lista explícita de 24 archivos públicos, incluidos los ocho de /fase2/. Se respaldó la metadata fallida builds.json antes del deploy prebuilt. No reutilizar a ciegas este fallback sobre un static ya existente.

Despliegue verificado: dpl_BTEFMPu8hMmqmHwXK6rkU3wVSB1R, alias riff-duel.vercel.app. /iphone/, importador, Service Worker, /fase2/, wasm32 de fase2 y portada responden 200; /iphone/private/gh3-web.wasm responde 404 desde la red. El programa solo existe después de la importación local en ese navegador.

Evidencia: artifacts/mobile-private/check-1791758684739/verification.json, check-1791758728315/verification.json, public-verification.json, public-inventory.json y package-result.json. Backup: artifacts/respaldo/2026-10-11-mobile-private/.
