#pragma once
// Claude 2026-10-17: gancho «reloj del juego atado al audio que suena» (copia artifacts/d1-wasm/relojaudio).
// Se llama justo antes de sub_82266250 (suma f1 al reloj de canción, double BE en 0x82BD7C38), en el único punto de
// llamada (gh3_recomp.2.cpp, lr 0x821139F0). Sólo cambia el avance f1 de ese cuadro: avance = delta del juego + corrección,
// con la corrección limitada (tope por cuadro) → nunca saltos. La página escribe la hora del audio que suena (tiempo de
// canción en s, el mismo que calcula autopista60.js) + la hora de escritura; acá se extrapola con el reloj de pared.
#include <cstdint>
#include <cstring>
#include <cmath>
#include <emscripten.h>
#include "rex_wasm_seg.h"
struct RelojAudio {
  int32_t magic;      // 0x52415531 'RAU1'
  int32_t enabled;    // la página pone 1 con ?relojaudio=1 (2 = sólo medir, no corrige)
  int32_t seq;        // impar = la página está escribiendo
  int32_t ack;        // la página pone 1 cuando ya conoce la dirección
  double audioSec;    // tiempo de canción del audio que suena (s)
  double atMs;        // hora (timeOrigin+now, ms) de esa lectura
  double ofsSec;      // objetivo = audio + ofs
  double capSec;      // tope de corrección por cuadro (s)
  double gain;        // fracción del error que se corrige por cuadro
  // estadísticas (escribe el gancho)
  double lastErr, sumAbsErr, maxAbsErr, lastT, lastD, sumCorr;
  int32_t calls, nCorr, nNeg, nZero, nStale, nBig, nCapped, nStill, nMeas, nFrozen;
  double sumErr;
};
static RelojAudio g_ra = {0x52415531, 0, 0, 0, 0, 0, 0, 0.002, 0.1};
static inline double ra_now_ms() { return EM_ASM_DOUBLE({ return performance.timeOrigin + performance.now(); }); }
static inline void ra_announce(uint32_t p) { EM_ASM({
  if (!globalThis.__raCh) globalThis.__raCh = new BroadcastChannel("hw60");
  globalThis.__raCh.postMessage({type: "relojAudioMemory", ptr: $0});
}, p); }
static inline double ra_f64(uint32_t a) { uint64_t u = __builtin_bswap64(*(volatile uint64_t*)::rexwasm::Host(a)); double v; std::memcpy(&v, &u, 8); return v; }
static double ra_prevAudio = -1e9, ra_prevAt = -1;
static uint32_t ra_prevEdge = 0xFFFFFFFF;
static inline double relojaudio_delta(double d) {
  RelojAudio& r = g_ra; r.calls++;
  if (!__atomic_load_n(&r.ack, __ATOMIC_RELAXED) && (r.calls % 60) == 1) ra_announce((uint32_t)(uintptr_t)&r);
  const int en = __atomic_load_n(&r.enabled, __ATOMIC_RELAXED); if (!en) return d;
  const double T = ra_f64(0x82BD7C38); r.lastT = T; r.lastD = d;
  if (T < 0) { r.nNeg++; return d; }          // cuenta regresiva antes de la primera nota
  if (!(d > 0)) { r.nZero++; return d; }       // reloj quieto (pausa / fin), por si se llama con 0
  // Reloj del jugador 1 (float BE 0x829B57B0): se congela con SONG FAILED / fin aunque 0x82BD7C38 siga (comprobado 2026-10-17).
  const uint32_t edge = __builtin_bswap32(*(volatile uint32_t*)::rexwasm::Host(0x829B57B0));
  const bool frozen = edge == ra_prevEdge; ra_prevEdge = edge;
  if (frozen) { r.nFrozen++; return d; }
  double a = 0, at = 0; int ok = 0;
  for (int k = 0; k < 4 && !ok; k++) {
    const int s0 = __atomic_load_n(&r.seq, __ATOMIC_ACQUIRE); if (s0 & 1) continue;
    a = r.audioSec; at = r.atMs; ok = __atomic_load_n(&r.seq, __ATOMIC_ACQUIRE) == s0;
  }
  const double now = ra_now_ms();
  if (!ok || now - at > 250 || now < at - 50) { r.nStale++; return d; }   // sin hora de audio reciente
  if (at != ra_prevAt && a == ra_prevAudio) { r.nStill++; return d; }   // lectura nueva con el audio quieto (cortado / pausa)
  ra_prevAudio = a; ra_prevAt = at;
  const double A = a + (now - at) / 1000.0 + r.ofsSec, err = A - (T + d);
  r.lastErr = err;
  if (std::fabs(err) > 0.5) { r.nBig++; return d; }                        // desacuerdo grande: no es la canción en curso
  r.nMeas++; r.sumErr += err; r.sumAbsErr += std::fabs(err); if (std::fabs(err) > r.maxAbsErr) r.maxAbsErr = std::fabs(err);
  if (en != 1) return d;                                                     // 2 = sólo medir
  double c = err * r.gain; const double cap = r.capSec;
  if (c > cap) { c = cap; r.nCapped++; } else if (c < -cap) { c = -cap; r.nCapped++; }
  r.nCorr++; r.sumCorr += c;
  return d + c;
}
