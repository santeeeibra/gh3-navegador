# Cinemáticas Bink — renderer aislado

La copia de trabajo está en `artifacts/r5-bink-video/demo`. `build.mjs` copia los
scripts de `artifacts/d1-wasm/movil-memoria/demo` sin enlaces duros; comparte solo
chunks inmutables. Sustituye el adaptador gráfico y el manejo de texturas en sus
copias de render/colas/scene/gpu, conservando las modificaciones de Claude.
No cambia ni publica su runtime, audio, controles o builds.

```powershell
node tools/r5-bink-video/build.mjs
node tools/r5-bink-video/check-adapter.mjs
node tools/r5-bink-video/check-gpu.mjs
$env:VIDEO_SECONDS='105'
$env:VIDEO_CONSUMER='r5snap-song-colas.js'
node tools/r5-bink-video/run.mjs prueba
node tools/r5-bink-video/song-check.mjs slowride --wait
```

Los runners GPU/juego reservan `artifacts/PRUEBAS-EN-CURSO.md`, fallan o esperan
si está ocupado y liberan solo su reserva después de cerrar sus procesos.
No arrancar el juego manualmente fuera de ese turno.

Sin VIDEO_CONSUMER, el runner usa el diagnóstico R5L: conserva `.r5f`, registros,
descriptores y bytes físicos antes de ceder el callback. La ruta del informe es
`artifacts/r5-bink-video/<etiqueta>/verification.json`. Las capturas son locales.

Soporte en las fuentes propias de `tools/r5-live-song`:

- `bink.mjs`: pares observados YUV y YUV+alfa; no detección por parecido.
- `live-prepare.mjs`: viewport de pantalla, swizzles empaquetados por parejas,
  planos R8 lineales sin padding y slots de upload estables para videos.
- `live-consumer.mjs` / `thread-consumer.mjs`: los pares pasan también el filtro
  de autopista; los planos cambiantes se envían cada cuadro.
- `live-renderer.mjs` / `arena-renderer.mjs`: actualizan los slots existentes
  antes de submit; las texturas estáticas conservan su camino anterior.

`check-gpu` compara los dos renderers con el RGBA nativo ya validado del caso
de cuatro planos. Cambia un uniforme y un plano real, exige diferencias, restaura
los píxeles y comprueba que siguen siendo solo cuatro texturas GPU. El diagnóstico
de logos usa capturas reales de tres planos; no equivale a una comparación de
framebuffer completo de todas las cinemáticas ni a una prueba física de iPhone.
