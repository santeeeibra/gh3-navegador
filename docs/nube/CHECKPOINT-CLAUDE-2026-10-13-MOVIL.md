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

## Merge y publicación (2026-10-13, sesión local en la PC, pedido de Santi desde el celu)

- Pruebas antes del merge: `npm test` 72/72, `test:movil-tactil` 74/74,
  `test:movil-gobernador` 34/34.
- Aplicado a la copia: `build.mjs` → `apply-web.mjs` (runtime presente; respaldo
  `artifacts/r5-native60/demo-respaldo-2026-10-13T12-58-13`).
- PR 1 mergeado a main (`5b39c43`).
- PUBLICADO (OK de Santi, público para probar desde otro celular):
  `dpl_EcCtVEsNefGNvQyWZa6zYLhjpZCQ` → https://riff-duel.vercel.app/gh3/ .
  Método: `vercel build --prod`, `GH3_SRC=artifacts/r5-native60/demo node
  tools/d1-wasm/stage-cine-gh3.mjs` (30 archivos de programa + 2136 partes, mismo
  wasm y partes que la versión anterior dpl_ATVEhX5…), `vercel deploy --prebuilt --prod`.
  Comprobado: /gh3/, gh3-governor.js, gh3-touch-prueba.js, native60-page.js,
  manifest.json y /fase2/ = 200 con COEP require-corp. No se corrió el juego.
- Sin medir en la PC (Santi lo acepta). Próximo: informe del celu
  (`/gh3/?diag=1` → Copiar informe) y las mediciones de `MEDIR-GOBERNADOR-EN-PC.md`.
- iPhone (Santi): con native60 se quedó en «Iniciando el motor» sin imagen
  (native60 nunca probado en iPhone). Arreglo `57f2ea6`: en celular el consumidor
  vuelve a `r5snap-song-*` (el que andaba; `?n60=1` fuerza native60), el informe
  empieza con un RESUMEN en palabras simples y `?diag=1` ya no muestra los
  registros técnicos (`?diag=2` sí). Respaldo `artifacts/respaldo/2026-10-13-movil-iphone/`.
  Pruebas 72/74/34 OK. PUBLICADO `dpl_Husf4F59NJfsVtfViZRjAEo3GKJy` (riff-duel /gh3/).
  Pendiente: confirmación de Santi en el iPhone; el gobernador sin native60 sólo
  ve el audio (no recibe el tablero del worker GPU).
- iPhone 11 de Santi con dpl_Husf4…: imagen OK, pero abort() del motor ~7 s después
  de levelConfirmed (Barracuda y Slow Ride). Mismo wasm/partes que la versión
  anterior; cambian sólo archivos de la página. Para separar «celular» de «versión
  nueva», con OK de Santi se volvió producción a dpl_ATVEhX5… (`vercel promote`;
  `rollback` pide plan Pro). Comprobado: gh3-governor.js = 404. Esperando su
  informe de Slow Ride con la versión vieja.
- Versión vieja (dpl_ATVEhX5…) en el mismo iPhone 11: Safari cerró la página en
  «Entrando a la canción» (141 s) → el cierre NO lo causa lo nuevo; probable falta
  de memoria al cargar la canción. Republicada la nueva con las últimas 25 líneas
  del juego en el informe (también de la sesión anterior): `4dfda14`,
  dpl_HPr1RKbR1GrqonmJe8GQPFQLGUKk. Plan aprobado: con esas líneas, medir memoria
  al entrar a la canción en la PC (turno de pruebas) y achicar.
- iPhone 11, dpl_HPr1…: Slow Ride ENTRÓ y corre (sin abort esta vez; la sesión
  previa se cerró en «Página abierta» a los 8 s → cierres por memoria intermitentes).
  Pero lento: 1499 swaps en 84 s (~18/s vs ~49 en PC), producción de audio 84 %,
  15 cortes en canción, latencia mando→juego p95 1,05 s (máx 5,6 s). Cuello = CPU
  del juego (wasm) en el iPhone, no el dibujo; el gobernador no actúa (sinTablero
  con r5snap-song). Próximo: decidir con Santi (perfil de CPU en modo celular / native60 en iPhone).
- Plan propuesto (sin aprobar): `docs/nube/PLAN-GH3-FLUIDO-IPHONE.md` (referencia Budokai + etapas E1–E6; primer bloque B1 = velocidad del juego y CPU en modo celular).
- **B1 APROBADO por Santi (2026-10-13)**. Próxima sesión: leer `docs/nube/PLAN-GH3-FLUIDO-IPHONE.md` §4 y ejecutar B1 (no repetir la aprobación).
- **B1 HECHO** (2026-10-13): `docs/nube/RESULTADO-B1-VELOCIDAD.md`. Próximo: OK de Santi para (1) publicar el medidor y medir en iPhone, (2) B2 = probar `optim/spin1` con 2 núcleos.
- **Cierre 2026-10-13 (antes de /clear):** publicado B4 + logo nuevo (`dpl_592qQHZ5RbkNywMDPZWQKEo9FxfW`, wasm 5d3f7816…, logo-gh3.png; base `artifacts/d1-wasm/logo/demo`). B5/B6/B7 medidos y NO adoptados; perfil de camino crítico con todos los núcleos hecho. Todo en `docs/nube/RESULTADO-B1-VELOCIDAD.md`.
- **Próximo (propuesto, pendiente de OK de Santi):** abaratar el productor R5L en el hilo del CP (`BeginEvent` en `tools/d1-wasm/r5_frame.cpp`) con salida R5L idéntica byte a byte; tope medido ≈9 puntos (84→93 % sin imagen), estimado +2–4. Alternativa en zona Codex: `__r5liveReady` que devuelva 0 sólo si el cuadro se descartaría. Falta también: perfil SIN imagen (qué limita el 93 %), medir desfase audio/notas/input, iPhone dos canciones seguidas (¿calor?).
- **PC sin imagen (2026-10-13, arreglado):** la publicación no incluía `r5snap-native60-*.js` (404; la PC usa native60). `stage-cine-gh3.mjs` ahora suma r5snap-*/hw60*/r5cap-render (respaldo `artifacts/respaldo/2026-10-13-stage-native60/`). PUBLICADO dpl_2EZoj5RQ7PcPGKWM5tyPafg79QSa (base `artifacts/d1-wasm/logo/demo`, mismo wasm); archivos 200 comprobados, falta prueba de Santi. Pendiente después: productor (BeginEvent 2,4 s/20 s en hilo CP; idea: marcar bloques de registros escritos en WriteRegister/VIZ_QUERY/graphics_system y comparar sólo esos), aprobado por Santi.
