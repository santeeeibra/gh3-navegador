// R3c: latido WebGPU de PRUEBA del backend, dentro del hilo del CP (solo con G1_CP_ASYNC=1 y
// G1_R3C=1 / ?cpasync=1&r3c=1). NO es un cuadro de GH3: en cada swap del juego limpia un
// OffscreenCanvas propio con un color de una paleta fija, sin shaders del juego ni datos guest.
// Init es asíncrona (Pending -> el CP cede con kWaitBackend). Colas acotadas: como mucho 2 envíos
// de GPU sin terminar, 2 imágenes enviadas a la página sin confirmar y 1 lectura de píxel a la vez;
// si una cola está llena ese swap no se dibuja o no se presenta (se cuenta), nunca se espera.
// Presentación: ImageBitmap -> hilo del runtime (callHandler) -> página; la página confirma (ack).
#include "r3c_heartbeat.h"
#include "g1_null_gpu.h"
#include <cstdlib>
#include <cstring>
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#endif

namespace r3c {
namespace {
// Índices de g1::r3c_stats (ver nombres en g1::Report).
enum { kState, kSwapsSeen, kSubmitted, kSkipGpuBusy, kPosted, kSkipPresentBusy, kPresentedAck,
       kGpuDone, kReadbacks, kReadbackOk, kReadbackBad, kGpuErrors, kInitMs, kMaxGpuInflight,
       kMaxPresentInflight, kDeviceLost };
void (*g_on_ready)() = nullptr;
}  // namespace

bool Enabled() {
  static bool v = [] { const char* e = std::getenv("G1_R3C"); return e && std::strcmp(e, "1") == 0; }();
  return v;
}
int State() { return g1::r3c_stats[kState].load(); }
}  // namespace r3c

#ifdef __EMSCRIPTEN__
extern "C" EMSCRIPTEN_KEEPALIVE void r3c_on_init(int ok) {
  (void)ok;  // el estado ya lo escribió JS (2 listo, 3 error)
  if (r3c::g_on_ready) r3c::g_on_ready();
}
// Lo llama el hilo del runtime cuando la página confirma que dibujó una imagen.
extern "C" EMSCRIPTEN_KEEPALIVE void r3c_ack() { ++g1::r3c_stats[r3c::kPresentedAck]; }

EM_JS(void, r3c_js_init, (int stats_ptr), {
  const S = stats_ptr >> 2, t0 = performance.now();
  const H = () => new Int32Array(wasmMemory.buffer);
  const done = (state) => {
    Atomics.store(H(), S + 12, Math.round(performance.now() - t0));
    Atomics.store(H(), S + 0, state);
    _r3c_on_init(state === 2 ? 1 : 0);
  };
  (async () => {
    if (typeof navigator === 'undefined' || !navigator.gpu) throw Error('sin WebGPU en el hilo del CP');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw Error('sin adaptador WebGPU');
    const device = await adapter.requestDevice();
    const canvas = new OffscreenCanvas(320, 180), ctx = canvas.getContext('webgpu');
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    const staging = device.createBuffer({ size: 256, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    const R = { device, canvas, ctx, staging, S, H, bgra: format.startsWith('bgra'), gpuInflight: 0, readInflight: false, lost: false,
      palette: [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]] };
    device.addEventListener('uncapturederror', () => Atomics.add(H(), S + 11, 1));
    device.lost.then(() => { R.lost = true; Atomics.store(H(), S + 15, 1); });
    globalThis.__r3c = R;
    console.log('[r3c] init ok ' + format + ' ' + JSON.stringify(adapter.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture } : {}));
    done(2);
  })().catch((e) => { console.log('[r3c] init error ' + e); globalThis.__r3c = null; done(3); });
});

EM_JS(void, r3c_js_swap, (uint32_t idx), {
  const R = globalThis.__r3c;
  if (!R) return;
  const S = R.S, H = R.H(), max = (i, v) => { if (v > Atomics.load(H, S + i)) Atomics.store(H, S + i, v); };
  Atomics.add(H, S + 1, 1);
  if (R.lost) return;
  if (R.gpuInflight >= 2) { Atomics.add(H, S + 3, 1); return; }
  const col = R.palette[idx % 6];
  const tex = R.ctx.getCurrentTexture();
  const enc = R.device.createCommandEncoder();
  const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(), clearValue: { r: col[0] / 255, g: col[1] / 255, b: col[2] / 255, a: 1 }, loadOp: 'clear', storeOp: 'store' }] });
  pass.end();
  const doRead = !R.readInflight && idx % 30 === 0;
  if (doRead) enc.copyTextureToBuffer({ texture: tex, origin: [8, 8] }, { buffer: R.staging, bytesPerRow: 256 }, [1, 1]);
  R.device.queue.submit([enc.finish()]);
  Atomics.add(H, S + 2, 1);
  R.gpuInflight++; max(13, R.gpuInflight);
  R.device.queue.onSubmittedWorkDone().then(() => { R.gpuInflight--; Atomics.add(R.H(), S + 7, 1); });
  if (doRead) {
    R.readInflight = true; Atomics.add(H, S + 8, 1);
    R.staging.mapAsync(GPUMapMode.READ).then(() => {
      let p = Array.from(new Uint8Array(R.staging.getMappedRange()).slice(0, 4));
      R.staging.unmap();
      if (R.bgra) p = [p[2], p[1], p[0], p[3]];
      const ok = p[0] === col[0] && p[1] === col[1] && p[2] === col[2];
      Atomics.add(R.H(), S + (ok ? 9 : 10), 1);
      R.readInflight = false;
    }).catch(() => { R.readInflight = false; Atomics.add(R.H(), S + 11, 1); });
  }
  // Presentación acotada: como mucho 2 imágenes enviadas a la página sin confirmar.
  const inflight = Atomics.load(H, S + 4) - Atomics.load(H, S + 6);
  if (inflight >= 2) { Atomics.add(H, S + 5, 1); return; }
  const bmp = R.canvas.transferToImageBitmap();
  Atomics.add(H, S + 4, 1); max(14, inflight + 1);
  self.postMessage({ cmd: 'callHandler', handler: 'r3cFrame', args: [bmp, idx, col[0], col[1], col[2]] }, [bmp]);
});
#endif

namespace r3c {
void Init(void (*on_ready)()) {
  g_on_ready = on_ready;
  g1::r3c_stats[kState] = 1;  // pendiente
#ifdef __EMSCRIPTEN__
  r3c_js_init(int(reinterpret_cast<uintptr_t>(&g1::r3c_stats[0])));
#else
  g1::r3c_stats[kState] = 3;
  if (on_ready) on_ready();
#endif
}
void OnSwap(uint32_t swap_index) {
#ifdef __EMSCRIPTEN__
  if (State() == 2) r3c_js_swap(swap_index);
#endif
}
}  // namespace r3c
