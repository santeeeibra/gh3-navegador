// Tablero compartido (SharedArrayBuffer de 128 bytes, Int32) entre el consumidor (hilo del CP del juego), el worker
// GPU y la página. Claude 2026-10-13, gobernador móvil (docs/nube/PLAN-MOVIL-PRIORIDADES.md).
// Es el mismo SAB que antes era `presentation` (8 bytes): [0] y [1] conservan su significado, así una página vieja
// sigue funcionando con un consumidor nuevo y la página nueva detecta un consumidor viejo por VERSION.
// Lecturas/escrituras con Atomics: sin mensajes ni allocations por cuadro. La página copia estos índices en
// web/gh3-native60/gh3-governor.js (tests/movil-gobernador.test.mjs comprueba que coincidan).
export const CONTROL_BYTES = 128;
export const CONTROL_VERSION = 1;
export const C = Object.freeze({
  LATCH: 0,          // GPU→página: 1 = hay un bitmap en camino (un cuadro en vuelo)
  PRESENTED: 1,      // página: cuadros presentados
  LEVEL: 2,          // página→todos: estado del gobernador 0 normal, 1 protegido, 2 mínimo
  CPU: 3,            // página→consumidor/GPU: nivel de recorte de CPU (captura, conversiones)
  GPU: 4,            // página→GPU: nivel de recorte de GPU (escala 1280×720 / 960×540 / 640×360)
  MEM: 5,            // página→GPU: nivel de recorte de memoria (presupuestos de texturas)
  POLICY_SEQ: 6,     // página: se incrementa en cada cambio de política
  ACTIVE: 7,         // página: 1 = el gobernador actúa; 0 = sólo observa (las perillas quedan en 0)
  SWAPS: 8,          // consumidor: cuadros del juego (swaps) recibidos = ritmo de la simulación visible
  SNAPSHOTS: 9,      // consumidor: snapshots preparados y enviados al worker GPU
  GOV_SKIPPED: 10,   // consumidor: swaps salteados por el gobernador ANTES de leer memoria del juego
  PREP_US: 11,       // consumidor: costo del último snapshot (lectura+preparación+copia), µs
  PREP_MAX_US: 12,   // consumidor: máximo desde la última lectura de la página (la página lo pone en 0)
  BUSY_DROPS: 13,    // consumidor: swaps descartados porque el worker GPU seguía ocupado con el anterior
  GPU_US: 14,        // GPU: espera de la GPU por cuadro (onSubmittedWorkDone), promedio móvil, µs
  GPU_MAX_US: 15,    // GPU: máximo desde la última lectura de la página
  TEX_GPU_KIB: 16,   // GPU: texturas residentes en la GPU, KiB
  TEX_CPU_KIB: 17,   // GPU: copias de texturas en el worker, KiB
  SCALE_PCT: 18,     // GPU: escala de render aplicada ×100
  RENDERED: 19,      // GPU: cuadros dibujados
  GPU_LOST: 20,      // GPU: 1 = dispositivo perdido o error fatal
  SCENE_DEFERRED: 21,// GPU: dibujos de escena omitidos por no convertir texturas nuevas bajo presión
  ROAD_ONLY: 22,     // consumidor: 1 = el último snapshot fue sólo pista/notas/colas/HUD
  BUF_KIB: 23,       // GPU: buffers (arenas) en la GPU, KiB
  VERSION: 24,       // consumidor: CONTROL_VERSION cuando el SAB tiene este formato
  WORKER_US: 25,     // GPU: costo total del cuadro en el worker (CPU del worker + espera GPU), promedio móvil, µs
  STAGE: 26,         // página→GPU: 0 sin dato, 1 cargas/menús, 2 canción en juego (señales gh3stage). Claude 2026-10-13, precarga
  PRELOADED: 27,     // GPU: pipelines precompilados fuera del juego (recordados de sesiones anteriores)
  PRELOAD_PENDING: 28,// GPU: pipelines recordados que faltan precompilar
  SONG_BUILDS: 29,   // GPU: pipelines que hubo que compilar con la canción en juego (lo que la precarga quiere llevar a 0)
});
export function createControl() {
  const sab = new SharedArrayBuffer(CONTROL_BYTES), i32 = new Int32Array(sab);
  Atomics.store(i32, C.VERSION, CONTROL_VERSION);
  return sab;
}
// Promedio móvil exponencial en enteros (µs), sin allocations.
export function ewmaStore(i32, index, valueUs, alpha = 0.2) {
  const prev = Atomics.load(i32, index), v = Math.max(0, Math.min(2e9, Math.round(valueUs)));
  Atomics.store(i32, index, prev ? Math.round(prev + (v - prev) * alpha) : v);
}
export function maxStore(i32, index, valueUs) {
  const v = Math.max(0, Math.min(2e9, Math.round(valueUs)));
  if (v > Atomics.load(i32, index)) Atomics.store(i32, index, v);
}
