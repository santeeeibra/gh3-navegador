// Diagnóstico de pasadas (Claude 2026-10-17, SOLO copia de prueba artifacts/d1-wasm/pasadas): dentro de la función que dibuja
// todo (sub_822F0AD0) cada llamada K se saltea durante una ventana de la canción, según el reloj de la canción 0x829B57B0:
// desde PAS_T0 s, ventanas de PAS_W s; ventana par = normal (base), impar = saltea la llamada (idx-1)/2. El productor R5L
// (tools/pasadas/r5_frame.cpp) cuenta los dibujos de cada ventana con el mismo reloj.
#pragma once
#include <cstdint>
#include <cstring>
#include "rex_wasm_seg.h"
#define PAS_T0 4.0
#define PAS_W 0.6
#ifndef PAS_K0
#define PAS_K0 0
#endif
#define PAS_N 47
inline int pas_window_now() {
  // reloj del jugador (float BE ms): 0 en menús, negativo en la cuenta regresiva (el de 0x82BD7C38 corre también en menús)
  const uint32_t u = __builtin_bswap32(*(volatile uint32_t*)::rexwasm::Host(0x829B57B0u));
  float ms; std::memcpy(&ms, &u, 4); const double t = ms / 1000.0;
  if (!(t >= PAS_T0)) return -1;
  const int idx = int((t - PAS_T0) / PAS_W);
  return idx < 2 * (PAS_N - PAS_K0) ? idx : -1;
}
#ifndef PAS_NO
#define PAS_NO {-1}
#endif
inline bool pas_run(int k) { static const int no[] = PAS_NO; for (int x : no) if (x == k) return true; const int w = pas_window_now(); return !(w >= 0 && (w & 1) && PAS_K0 + (w - 1) / 2 == k); }
