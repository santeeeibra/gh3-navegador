# Tarea en la nube: controles táctiles + gobernador móvil (2026-10-13)

Rama `movil-tactil-gobernador`. Pedido y aprobación de Santi (no volver a preguntar el plan).
Trabajar acá, entregar PR, **sin merge, sin publicar, sin apagar nada**.

## Qué hay en el repo (y qué NO)

- `web/gh3-native60/`: fuentes propias de la página vigente (copia de la demo local
  `artifacts/r5-native60/demo`, que suma native60 de Codex sobre hw60 → memlazy).
  - `index.html`: página, cargador, **AudioWorklet** (busca `registerProcessor`) y arranque.
  - `gh3-touch.js`, `gh3-mobile-ui.js`, `gh3-input.js`, `gh3-landscape.js`, `gh3-pro.js`: táctil/UI/entrada.
  - `native60-page.js`, `r5snap-native60-gpu.js`: presentación WebGPU de Codex en la página.
  - `hw60*.js`: capa WebGL2 vieja de Claude (diagnóstico).
- `tools/r5-native60/`: fuentes del renderer native60 (consumer, prepare, snapshot-prepare,
  temporal, cadence, renderer, gpu-worker, page) + `build.mjs` y checks. `README.md` explica.
- `tools/r5-scene-mobile/`, `tools/r5-live-song/`, `tools/hw60/`, `tools/re/`, `tools/d1-wasm/`: resto de herramientas.
- `docs/nube/`: `PLAN-MOVIL-PRIORIDADES.md` (diseño del gobernador, Codex),
  `PEDIDO-CONTROLES-TACTILES.md`, `PROMPT-CLAUDE-NUBE.txt`, `RESULTADO-NATIVE60-CODEX.md`,
  `CHECKPOINT-CLAUDE-2026-10-12-OPTIM.md` (perfil CPU). Rutas `artifacts/...` que citan NO existen acá.
- `REGLAS.md` (reglas de Santi): leer.

**NO están (a propósito, no subir ni descargar):** datos del juego, `gh3-web.wasm`/`gh3-web.js`
(recompilado + glue), `chunks/`, `manifest.json`, bundles `r5snap-song-*.js`/`r5snap-native60-{render,colas,scene}.js`
(incluyen shaders traducidos del juego), `logo-lasvegas.png`, toolchain, perfiles de Edge.
Por eso **en la nube no se puede correr GH3 real**: probar módulos, fixtures y la página
sin juego (prueba de controles antes de Jugar, gobernador con telemetría simulada).

## 1. Controles táctiles (aprobado)
Ver `PEDIDO-CONTROLES-TACTILES.md`. Resumen: antes de Jugar, aviso «Controles táctiles activados»,
«Probar controles» con 5 colores en orden que responden al toque **sin cargar wasm/chunks ni enviar
entradas**, explicación de toques/sostenidas/acordes/rasgueo según ajuste, «Jugar» directo.
En canción: bordes tenues visibles, feedback inmediato, alineado a los aros, multitouch, orientación,
safe areas; tamaño/posición/visibilidad persistentes (migrar ajustes existentes de `gh3-touch.js`).
Preservar PC (sin táctil salvo forzado), cruceta/confirmar/volver, pausa, poder estelar.
Sin trabajo por cuadro ni animaciones continuas.

## 2. Gobernador adaptativo móvil (aprobado)
Ver `PLAN-MOVIL-PRIORIDADES.md`. Audio constante a ritmo original y controles/juicio = no negociables.
Medir: reserva de audio y tendencia, picos CPU/GPU, memoria, pausas entre cuadros, latencia
entrada→juicio. Estados normal → protegido → mínimo; recorte rápido, recuperación lenta (histéresis,
permanencia mínima). CPU: menos preparación/captura/copias visuales, snapshots inmutables, sin leer
tarde memoria del guest. GPU: escena 960×540 → 640×360, sombras/reflejos/partículas fuera; pista/notas/
colas/HUD legibles. Memoria: formatos comprimidos solo si el adaptador los soporta, reutilizar, liberar
inactivos, conversiones fuera de canción. Mínimo: solo pista/notas/colas/HUD.
Prohibido: ralentizar la canción, agrandar indefinidamente el retraso de audio, ocultar controles
atrasados con cuadros interpolados. Telemetría barata (SAB), nada de allocations/logs en el worklet.

## Validación y entrega
- Pruebas: `npm test` (+ nuevas de módulos/fixtures). Underrun/skip en sonido esperado = falla; no borrar contadores.
- Verificar multitouch, sostenidas, cancelación, pérdida de foco, orientación, ajustes persistentes, PC.
- Separar FPS presentados / simulación del juego / latencia de controles.
- PR con cambios, pruebas y **pendientes explícitos**: medición en GH3 real (PC de Santi) e iPhone 11 físico.
  No certificar iPhone ni GH3 completo con pruebas sintéticas. Números previos (PC) son solo contexto:
  pista ~58,7 fps, escena parcial ~58,9 fps con 1 underrun inicial, preparación de escena ~29 ms/snapshot.
- Para aplicar en local después: los archivos de `web/gh3-native60/` se copian sobre
  `artifacts/r5-native60/demo` (que tiene wasm/chunks/bundles) y `node tools/r5-native60/build.mjs`.
- Comunicación con Santi: español argentino simple, distinguir COMPROBADO / pendiente / hipótesis.
