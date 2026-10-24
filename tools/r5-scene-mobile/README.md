# Renderer R5: escenario y GPU móvil

Entrega aislada desde el snapshot inicial de `artifacts/d1-wasm/memlazy/demo`. No modifica esa base. No publica.

Informe: `artifacts/r5-scene-mobile/RESULTADO-RENDERER-MOVIL.md`. Copiar solo los cuatro bundles gráficos de `artifacts/r5-scene-mobile/demo` indicados allí. `summary.json` distingue FPS del juego entero de FPS del renderer y define la memoria contabilizada.

## Reproducción rápida sin volver a navegar el juego

Un solo cuadro real está preparado en `artifacts/r5-scene-mobile/song-actors`. Sus shaders y material parcial sin sombras están en `artifacts/r5-scene-mobile/shaders.json`; auditoría en `shadowless-audit.json`.

PowerShell, desde la raíz del proyecto:

```powershell
$env:SCENE_FINAL='1'
$env:SCENE_MOBILE='1' # dos CPU lógicos de los procesos de nuestra sesión
$env:SCENE_BENCH_LABEL='mi-medicion'
node tools/r5-scene-mobile/benchmark.mjs --wait
```

Respeta `artifacts/PRUEBAS-EN-CURSO.md`, incluso sin guest: usa la misma GPU. Cuatro variantes de 8 segundos más calentamiento, mismo cuadro, sin audio/emulación. No acredita img/s de un iPhone.

```powershell
node tools/r5-scene-mobile/check-gpu.mjs --wait
node tools/r5-scene-mobile/check-worker.mjs --wait
node tools/r5-scene-mobile/summarize.mjs
```

Los checks verifican píxeles con revisiones de textura, recuperación de un finish fallido y presupuesto de caché, más el transporte del bundle entregado del worker GPU en cuatro cuadros. `replay.mjs actors-fixed artifacts/r5-scene-mobile/song-actors --wait` captura WebGPUReconstruct; el replay nativo final ya está conservado y RenderDoc agotó el plazo. No repetir esa espera para cada pantalla.

## Construcción y mediciones largas

`build.mjs` crea baseline y copia propia. **No volver a ejecutarlo sobre una entrega medida: reemplaza copias y pierde cambios.** `shadowless.mjs` prepara diez variantes auditadas. `fix.mjs` injerta preparador/renderer solo en los cuatro bundles de la copia propia:

```powershell
$env:SCENE_ARENA='1'
node tools/r5-scene-mobile/fix.mjs
```

Conservar los sources exactos de esta entrega en `src/prepare.mjs`, `src/renderer.mjs` y `src/texture-policy.mjs`. El generador lee las fuentes comunes y un snapshot de baseline; cambios posteriores en esos archivos cambian su resultado.

El runner de canción deriva del runner de navegación existente sin escribir en él. Variables: SCENE_VARIANT=demo, SCENE_LABEL, SCENE_MOBILE=1, SCENE_RGBA=1, SCENE_TEX=0.5, SCENE_SCALE=0.75, SCENE_CONSUMER, SCENE_LITE=1, SCENE_TARGET_MS. Ejemplo: `node tools/r5-scene-mobile/run.mjs slowride --full --wait`. Modifica prefijos de configuración **solo en la copia de prueba**, usa un perfil fresco y puede tardar varios minutos. Antes de entregar, quitar esos prefijos iniciales `globalThis.__r5Options=...;`: el default de la copia entregada mantiene escala de render 1 y reducción móvil de texturas de escena cuando corresponde.

No usar el modo liviano fallido de navegación para acreditar rendimiento de ese modo. No presentar esta entrega como port completo u online terminado.
