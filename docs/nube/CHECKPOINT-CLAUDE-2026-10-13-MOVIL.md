# Checkpoint para seguir después de un /clear (Claude, 2026-10-13)

Santi pidió «Continuá con lo pendiente» y hacer `/clear` antes. Este archivo es el
traspaso: leerlo primero, junto con `REGLAS.md` y
`docs/nube/RESULTADO-MOVIL-TACTIL-GOBERNADOR.md` (qué se hizo y qué falta).

## Estado

- Rama `movil-tactil-gobernador`, PR abierto sin merge:
  https://github.com/santeeeibra/gh3-navegador/pull/1 — no mergear ni publicar.
- Commits: `85a8257` controles táctiles, `bb1983c` telemetría, `ea62ef2`
  gobernador, `be33573` resultado + formatos comprimidos en el informe.
- Pruebas en verde: `npm test` 54/54, `npm run test:movil-tactil` 74/74,
  `npm run test:movil-gobernador` 27/27.

## Actualización (misma fecha, después del /clear)

- Hecho el paso 1 de la propuesta (herramienta de medición), con OK de Santi:
  `tools/r5-native60/compare-gov.mjs` (compara dos corridas),
  `run-song.mjs` guarda `report.governor` (resumen del gobernador) y
  `tools/r5-native60/measure-gov.mjs` (un comando: observa → activo → tabla).
  Pruebas en `tests/movil-medir.test.mjs`; `npm test` 62/62.
- Guía para Santi en casa: `docs/nube/MEDIR-GOBERNADOR-EN-PC.md`.
- Santi pidió publicar en main para probar en el celu: NO se hizo, porque
  Vercel arma `/gh3` sólo con los datos del juego (no están en GitHub) y
  `web/gh3-native60` no entra en el build; no cambiaba nada en el celu.
- Paso 2 (precarga con presupuesto) HECHO con OK de Santi:
  - `CTRL.STAGE` (26): la página (gh3-governor.js) escribe 1 = cargas/menús,
    2 = canción (`gh3stage` songPlaying). Contadores PRELOADED/PRELOAD_PENDING/
    SONG_BUILDS (27–29); el resumen del gobernador trae `medidas.precarga`.
  - `tools/r5-native60/preload.mjs`: recuerda pipelines en IndexedDB del worker
    GPU y los compila sólo con STAGE = 1 y LEVEL = 0, de a 2. En canción no
    compila por su cuenta ni guarda. renderer: onPipeline/has/prebuild.
  - En canción las texturas no se tiran por tiempo (sólo por presupuesto),
    GPU y copias del worker (`keepTextures`).
  - NO se precargan texturas: el juego las manda recién al dibujarlas; haría
    falta tocar el runtime (`gh3-web.js`, no está en el repo).
  - Medir: `measure-gov.mjs --precarga` (dos corridas con el mismo perfil,
    `GH3_PROFILE` en run-song.mjs).
  - Pruebas: `npm test` 72/72, `test:movil-gobernador` 34/34 (parte C: dos
    sesiones con WebGPU), `test:movil-tactil` 74/74.
- Para Santi en casa: `docs/nube/MEDIR-GOBERNADOR-EN-PC.md` (pasos) y
  `docs/nube/PROMPTS-CASA.md` (prompt para Claude Code si aprueba o no).
- Próximo: esperar sus tres `comparacion.md` (pista, escena, precarga) y el
  informe del celu; calibrar umbrales con esos datos.

## Cómo trabajar en la nube (aprendido)

- Primero `npm ci` (sin eso falla `tests/online.test.mjs`).
- Navegador: `/opt/pw-browsers/chromium` (ya lo usa `tests/lib/movil-server.mjs`).
- WebGPU en la nube: hay dispositivo (SwiftShader) pero **ningún lienzo WebGPU
  puede presentar**. Las pruebas corren el bundle del worker GPU en la página
  con un lienzo falso; ver `tests/movil-gobernador-browser.mjs`.
- Finales de línea: `index.html`, `gh3-touch.js`, `gh3-input.js`,
  `gh3-diag.js` y `r5snap-loader-ui.js` usan CRLF; `tools/r5-native60/renderer.mjs`
  los tiene mezclados. Editar sin cambiarlos (si no, el diff se ensucia).
- Bundle del worker GPU: después de tocar `tools/r5-native60/gpu-worker.mjs` o
  `renderer.mjs`, regenerar `web/gh3-native60/r5snap-native60-gpu.js` con
  `npx esbuild tools/r5-native60/gpu-worker.mjs --bundle --format=iife --platform=browser --target=es2022 --external:module --outfile=web/gh3-native60/r5snap-native60-gpu.js`.
  `tools/r5-native60/page.js` y `web/gh3-native60/native60-page.js` deben ser iguales.
- No están en el repo (no subir ni bajar): datos del juego, wasm, runtime
  `gh3-web.js`, chunks, bundles con shaders del juego.

## Pendiente: qué se puede hacer desde la nube y qué no

Propuesta de orden (por REGLAS.md, presentarla a Santi y esperar su OK antes de
tareas grandes; hacer de a poco y explicar en simple):

1. **Herramienta de medición para la PC de Santi** (lo próximo más útil): un
   script que corra GH3 real con `?gov=observa` y con `?gov=1` (basado en
   `tools/r5-native60/run-song.mjs`), guarde el resumen del gobernador, los
   cortes/saltos de audio desde antes de Jugar, fps presentados / swaps /
   snapshots y la latencia, y compare las dos corridas. En la nube sólo se
   prueba con piezas falsas; la corrida real la hace Santi.
2. **Precarga con presupuesto** de pipelines y texturas estáticas durante
   cargas/menús (señales `gh3stage`), sin trabajo pesado en el tramo de juego.
   Pruebas con dibujos sintéticos.
3. Sólo después de medir: calibrar umbrales, decidir el límite del ritmo de
   audio (`?audiorate=0.005`), activar la señal de swaps/s.

No se puede desde la nube: medir GH3 real (PC) e iPhone 11 físico; la
presentación al lienzo WebGPU; recortar la captura del runtime (`gh3-web.js`
no está); sombras/partículas por separado (necesita los shaders del juego);
ASTC/ETC2/KTX2 (necesita texturas reales para validar, y el renderer es zona
de Codex: coordinar).
