#pragma once
// Claude 2026-10-18: interruptor «sin espera de VBlank cuando el cuadro ya llegó tarde» (copia artifacts/d1-wasm/sinvblank).
// sub_822BF0F8 (ritmo de cuadros del juego): si el contador de VBlank (0x82AE2520) ya pasó el objetivo, el original pone
// objetivo = ahora + 2 y espera hasta 2 VBlanks más. Con ?sinvblank=1 (la página pone enabled=1) no espera: objetivo = ahora + intervalo.
// También mide (con o sin interruptor) cuántas veces llegó tarde y cuánto espera cada bucle.
#include <cstdint>
#include <emscripten.h>
struct SinVblank {
  int32_t magic;     // 'SVB1'
  int32_t enabled;   // la página pone 1 con ?sinvblank=1
  int32_t ack;       // la página pone 1 cuando ya conoce la dirección
  int32_t calls, late, skips, n20, n34, n50, nAll, pad;  // nXX = cuadros (entre llamadas) de más de XX ms
  double vbMs, qMs;  // tiempo en la espera de VBlank y en la espera de cola (ms)
  double lastAt;     // hora de la llamada anterior
};
static SinVblank g_svb = {0x53564231, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
static inline double sinvblank_now() { return emscripten_get_now(); }
static inline bool sinvblank_late(uint64_t now, uint64_t tgt) {
  SinVblank& s = g_svb; s.calls++;
  { const double t = emscripten_get_now(); if (s.lastAt > 0) { const double d = t - s.lastAt; s.nAll++; if (d > 20) s.n20++; if (d > 34) s.n34++; if (d > 50) s.n50++; } s.lastAt = t; }
  if (!__atomic_load_n(&s.ack, __ATOMIC_RELAXED) && (s.calls % 60) == 1) EM_ASM({
    if (!globalThis.__svbCh) globalThis.__svbCh = new BroadcastChannel("hw60");
    globalThis.__svbCh.postMessage({type: "sinVblankMemory", ptr: $0});
  }, (uint32_t)(uintptr_t)&s);
  if (now <= tgt) return false;
  s.late++;
  if (!__atomic_load_n(&s.enabled, __ATOMIC_RELAXED)) return false;
  s.skips++; return true;
}
