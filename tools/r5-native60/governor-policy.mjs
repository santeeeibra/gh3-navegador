// Qué hace cada nivel del gobernador móvil (Claude 2026-10-13). Lo leen el consumidor (hilo del CP) y el worker GPU
// desde el tablero compartido (control.mjs); la página decide los niveles (web/gh3-native60/gh3-governor.js).
// Tres perillas separadas por el motivo del cuello: CPU, GPU y memoria. 0 = normal, 1 = protegido, 2 = mínimo.
// Ninguna toca audio, entradas, juicio ni reloj del juego. Los números son iniciales: calibrar en el iPhone 11 real.
import {C} from './control.mjs';
export const POLICY = Object.freeze({
  cpu: [
    // Normal: captura cada swap que encuentre libre al worker GPU (como antes).
    {minCaptureMs: 0, roadOnly: false, deferSceneUploads: false},
    // Protegido: como máximo un snapshot cada 25 ms (≈ 1 de cada 2 swaps a 60 Hz) y sin convertir/subir texturas
    // nuevas de escena (no esenciales). La decisión se toma ANTES de leer memoria del juego.
    {minCaptureMs: 25, roadOnly: false, deferSceneUploads: true},
    // Mínimo: sólo pista/notas/colas/HUD (el mismo filtro de sombreadores que la calidad «colas»).
    {minCaptureMs: 25, roadOnly: true, deferSceneUploads: true},
  ],
  gpu: [
    {scale: 1},     // 1280×720
    {scale: 0.75},  // 960×540 (56,25 % de píxeles)
    {scale: 0.5},   // 640×360 (25 %)
  ],
  mem: [
    // Presupuestos de texturas INACTIVAS (las activas del cuadro nunca se expulsan): GPU residente y copias en el worker.
    {gpuTextureBytes: 64 << 20, cpuTextureBytes: 96 << 20, deferSceneUploads: false},
    {gpuTextureBytes: 40 << 20, cpuTextureBytes: 48 << 20, deferSceneUploads: false},
    {gpuTextureBytes: 24 << 20, cpuTextureBytes: 24 << 20, deferSceneUploads: true},
  ],
});
// Nivel leído del tablero; un tablero viejo (8 bytes) o un valor raro = 0.
export function knob(i32, index) {
  if (!i32 || i32.length <= C.VERSION || Atomics.load(i32, C.VERSION) < 1) return 0;
  const v = Atomics.load(i32, index);
  return v >= 2 ? 2 : v === 1 ? 1 : 0;
}
// Consumidor: ¿preparar este swap? Se decide antes de cualquier lectura de memoria del juego (no se difiere ninguna lectura).
export function shouldCapture(nowMs, lastCaptureMs, cpuLevel) {
  const p = POLICY.cpu[cpuLevel] || POLICY.cpu[0];
  return !p.minCaptureMs || nowMs - lastCaptureMs >= p.minCaptureMs;
}
// Worker GPU: configuración del renderer según las tres perillas.
export function rendererConfig(cpuLevel, gpuLevel, memLevel) {
  const cpu = POLICY.cpu[cpuLevel] || POLICY.cpu[0], gpu = POLICY.gpu[gpuLevel] || POLICY.gpu[0], mem = POLICY.mem[memLevel] || POLICY.mem[0];
  return {scale: gpu.scale, gpuTextureBytes: mem.gpuTextureBytes, cpuTextureBytes: mem.cpuTextureBytes, deferSceneUploads: cpu.deferSceneUploads || mem.deferSceneUploads};
}
