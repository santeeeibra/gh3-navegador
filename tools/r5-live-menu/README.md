# Menú original parcial en vivo (R5L)

Prueba local: el juego Xbox 360 original corre en WebAssembly y el renderer dibuja las capas compatibles del par B43CF443883B8351 / 526B394DE2AB8891. No es el menú completo ni una canción jugable. Los demás DRAW y todas las COPY se saltean y cuentan; un cuadro sin dibujos compatibles conserva la imagen anterior.

## Abrir

Ejecutar `JUGAR-MENU-PARCIAL.cmd` desde la raíz del proyecto y abrir http://127.0.0.1:5196/ en Edge de PC. Elegir la carpeta que contiene `default.xex` y `DATA`, pulsar Iniciar y usar START para pasar las pantallas de inicio (dos pulsaciones separadas según la pantalla). Esta prueba no reproduce audio.

El servidor solo escucha en 127.0.0.1. La carpeta original se monta en solo lectura desde los archivos elegidos en la página. Esta salida contiene código del juego y shaders: conservar local, fuera de publicación.

## Integración

- `build-runtime.mjs` crea `artifacts/r5-live-menu/demo/`, con una copia del JS de `artifacts/d1-wasm/r5live/d4`. Agrega únicamente los handlers de presentación/informe. El wasm entregado se sirve tal cual, sin recompilar.
- `runtime-consumer.mjs` instala `__r5liveConsumer`, inicializa WebGPU y XXH3, verifica los mini-archivos con `readFrameCapture` y normaliza el estado por evento con `replayEvents`. Inicialización y cuadros ocupados se descartan, sin cola ni espera del CP. Los recursos aceptados se copian sincrónicamente antes del primer await.
- `worker.mjs` envía ImageBitmap solo para cuadros con dibujos aceptados. Un latch compartido permite como máximo un bitmap en tránsito; el canvas confirma al presentarlo. No hay readbacks en producción.
- `page.html` presenta los bitmaps y muestra contadores y errores. Usa los botones START/A del runtime entregado. El modo `cpasync=1` permite que los callbacks asíncronos del renderer progresen en el hilo CP. No cambia los defaults del runtime de Claude.

Reconstruir: `node tools/r5-live-menu/build.mjs` y `node tools/r5-live-menu/build-runtime.mjs`. Servir: `node tools/r5-live-menu/serve-runtime.mjs 5196`.

## Verificación

`node tools/r5-live-menu/verify-runtime.mjs 200 <etiqueta>` reserva su propio turno en `artifacts/PRUEBAS-EN-CURSO.md`, abre Edge oculto, ejecuta el original con START programado a 150/175 s y guarda JSON, log y capturas del canvas. Al terminar cierra su Edge y servidor y libera únicamente su reserva. Para una prueba manual, coordinar también el turno antes de Iniciar.

El soporte no garantiza memoria guest atómica entre hilos ni reconstruye EDRAM/resolves. Se muestra una composición parcial sobre fondo negro; las dependencias no soportadas se rechazan explícitamente.
