# Señal de capacidad del consumidor R5L

Pedido de Claude aprobado por Santi, 2026-10-13. La implementación propia está
en `tools/r5-live-song/live-ready.mjs`; los consumidores clásicos de worker e
inline la exponen como `globalThis.__r5liveReady()` en el hilo CP.

`node tools/r5-live-ready/build.mjs` crea una copia independiente de la entrega
B4 en `artifacts/r5-live-ready/demo`. Sólo añade la señal a render/colas/scene;
conserva sus shaders, ajustes móviles y renderer entregados por Claude. Para
otra entrega local, definir `READY_SOURCE` con la carpeta antes de ejecutar.
No modifica esa carpeta, el productor, el runtime, el wasm ni la publicación.

`node tools/r5-live-ready/check.mjs` toma y libera el turno de pruebas. Ejecuta
los tres bundles en workers y WebGPU de Edge usando capturas locales reales.
Comprueba arranque, ocupación, confirmación demorada de la página, huecos de
secuencia, igualdad de píxeles con consumidores frescos, cambio/restauración de
imagen y cierre por error. Es replay, no medición del juego ni de un iPhone.

Contrato para el productor (zona Claude):

- Consultar una vez ANTES de empezar a capturar un cuadro vivo. Si falta la
  función, conservar el comportamiento previo. `0` saltea sólo esa captura;
  nunca detener DRAW, COPY, SWAP, lógica, audio ni input del juego.
- `1` significa capacidad para recibir un snapshot válido con dibujos admitidos.
  No garantiza que un snapshot vacío o no soportado tenga imagen. No reserva
  capacidad y no libera buffers; los guardas existentes del consumidor siguen.
- La consulta es síncrona, de sólo lectura: no espera, no lee memoria guest,
  no crea vistas por consulta, no cambia cadencia ni números de secuencia.
- **Arranque:** el runtime actual importa el consumidor y crea su API en la
  primera entrega. Sin hook todavía, permitir esa entrega. Una vez importado,
  antes de iniciar la inicialización el hook permite el bootstrap; mientras se
  inicializa devuelve `0`. Después requiere renderer listo, sin fatal, sin
  preparación/GPU ocupada y sin bitmap esperando a la página.
- Seguir llamándolo en cada oportunidad de captura: `0` durante arranque no es
  un error terminal. No usar Atomics.wait, sleeps ni intervalos mínimos B6.
- Los consumidores clásicos no necesitan secuencias contiguas ni dos cuadros
  seguidos. Cada archivo vivo contiene BEGIN/registros y shaders; el lector
  reconstruye el estado de ese snapshot. El renderer mantiene cachés, pero no
  reconstruye deltas entre snapshots. COPY/EDRAM siguen pendientes.
- El GPU worker marca `presentation=1` ANTES de liberar `busy`; la página lo
  vuelve a `0` cuando muestra/cierra el bitmap. Así se cubre el intervalo entre
  GPU terminada y presentación. No cambiar ese orden ni el acknowledgement.

El contrato vale para `r5snap-song-render.js`, `r5snap-song-colas.js` y
`r5snap-song-scene.js`. Native60 mantiene
otro transporte y gobernador, y NO recibe este hook en esta entrega. Usar la
detección de función también allí; no aplicar su latch de presentación a una
política de captura clásica, porque su worker presenta repetidamente.

Pendiente: Claude conecta el productor y compara contra B4 sin cambiar otras
variables: tiempo de pared/ritmo del juego, imágenes presentadas, capturas
evitadas, ms del CP, audio acumulado desde arranque y latencia de entrada. Esta
señal pasiva todavía no demuestra ahorro ni 60 fps completos.
