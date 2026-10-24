# Replay original con cadencia independiente

Zona aislada de Codex, aprobada por Santi («Si dale», 2026-10-13).
Base de solo lectura: `artifacts/d1-wasm/hw60/demo`. No es una entrega de
fidelidad completa ni una medición física del iPhone. No se publicó esta ruta.

`build.mjs` copia los scripts, conserva el wasm y los chunks inmutables y
verifica que no cambió la base. Los shaders son los WGSL originales traducidos,
sin las variantes que quitan sombras. `temporal.mjs` avanza entradas capturadas:
la pista y las notas usan su geometría original; la extrapolación conservadora
de constantes de escena sigue siendo experimental.

Un worker WebGPU recibe snapshots inmutables, reutiliza recursos entre ellos y
entrega bitmaps directamente a la página. Hay un cuadro GPU y un snapshot de
transporte en vuelo. Los cuadros vacíos de pasadas secundarias no reemplazan
la última imagen visible. Arenas compactadas evitan conservar los máximos de
películas/menús al pasar a una canción. Presupuesto de texturas GPU inactivas:
64 MiB; las activas pueden superar ese valor y se contabilizan por separado.
Los pipelines nuevos se preparan fuera del tick de presentación; hasta que
estén listos se continúa usando el snapshot anterior, con el mismo límite de
antigüedad. El temporizador recupera retrasos breves sin acumular cuadros GPU.

## Reproducir

```powershell
node tools/r5-native60/build.mjs
node tools/r5-native60/check-prepare.mjs
node tools/r5-native60/check-cadence.mjs
node tools/r5-native60/fixture.mjs
node tools/r5-native60/check.mjs
```

El último comando toma la reserva única de GPU en `artifacts/PRUEBAS-EN-CURSO.md`.
No ejecutar benchmarks de CPU u otras cargas durante mediciones de juego/audio.

Juego real, primero comprobar que el turno esté LIBRE:

```powershell
$env:DEMO_ROOT='artifacts/r5-native60/demo'
$env:EXTRA_STATIC=(Get-ChildItem artifacts/r5-native60/demo -File | Select-Object -ExpandProperty Name) -join ','
$env:GH3_QUERY='manual=1&r5lite=1&r5liveconsumer=r5snap-native60-colas.js&gfx=url'
$env:HW60_LABEL='road-full'
$env:BOT_REFRET='100'
node tools/r5-native60/run-song.mjs slowride --full
```

Para otra ruta automática usar `talkdirtytome`, `hitmewithyourbestshot` o
`storyofmylife`. Para escena: `r5lite=0&r5liveconsumer=r5snap-native60-scene.js`.
`--full` llega al final del chart más 500 ms; no certifica la pantalla de
resultados. Rasgueos del robot no equivalen a aciertos.

Los FPS se calculan con cuadros presentados y tiempo de pared. El benchmark
de replay sin el juego es una prueba aparte. Los contadores de underruns,
silentBlocks y skips son evidencia de continuidad del worklet, no una audición
manual ni una comprobación del dispositivo de salida. Contabilidad de buffers
y texturas no equivale a RAM del proceso, driver o wasm.

## Pendientes de fidelidad

COPY/EDRAM, superficies secundarias, mapas originales de sombras, mipmaps,
expansión post-VS de rectángulos y algunos vertex fetches/materiales.
`audit-surfaces.mjs` documenta dependencias del cuadro real sin ejecutar GPU.
La igualdad de píxeles comprobada compara los mismos dibujos admitidos por el
replay parcial; no compara contra la salida nativa completa de Xbox 360.

No tomar `index.html`, runtime, cargador o wasm para integrar automáticamente
en una base posterior de Claude. La ruta del port directo requiere su pequeño
hook `r5NativePort` en el runtime y `native60-page.js`; debe integrarse y probarse
deliberadamente, conservando cambios posteriores de UI/audio.

## Gobernador móvil (Claude, 2026-10-13)

Pedido aprobado por Santi (`docs/nube/PLAN-MOVIL-PRIORIDADES.md`). El audio a
ritmo original y los controles/juicio no se negocian; se sacrifican gráficos.

- `control.mjs`: tablero compartido de 128 bytes. Es el mismo SAB que antes
  era `presentation` ([0] y [1] sin cambios); suma telemetría (swaps, snapshots,
  costo de preparación, espera de GPU, memoria, escala) y la política.
- `governor-policy.mjs`: qué hace cada nivel. CPU: captura ≤1 cada 25 ms y sin
  texturas nuevas de escena no esenciales; en mínimo sólo pista/notas/colas/HUD.
  GPU: 1280×720 → 960×540 → 640×360 con nitidez moderada. Memoria: presupuestos
  de texturas inactivas 64/40/24 MiB. La decisión de saltear un swap se toma
  antes de leer memoria del juego; nunca se difiere una lectura.
- La decisión la toma la página (`web/gh3-native60/gh3-governor.js`) con la
  reserva y tendencia de audio del worklet, picos de CPU/GPU, memoria y
  latencia de entrada. Celular: activo. PC: sólo observa (`?gov=1` lo activa,
  `?gov=0` lo apaga).
- Aplicar en la PC: `node tools/r5-native60/build.mjs` y después
  `node tools/r5-native60/apply-web.mjs` (respaldo automático de lo que reemplaza).
- Pruebas sin el juego: `npm test`, `npm run test:movil-gobernador`
  (WebGPU SwiftShader con dibujos sintéticos; la presentación al lienzo no se
  puede probar en la nube). Umbrales sin calibrar: medir en GH3 real e iPhone 11.
