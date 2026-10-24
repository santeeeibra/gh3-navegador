#pragma once
// Claude 2026-10-17: interruptores del juego para medir (copia artifacts/d1-wasm/interruptores). La página escribe qué va
// encendido (gh3-interruptores.js, ?sinpublico=1 ?sinluces=1 ?menoslod=1); los ganchos están en los cfuncs del juego:
// enable_crowd_models_cfunc (sub_82113830), LightShow_SetActive (sub_821289E0), ToggleLOD (sub_820ED820),
// SetViewerLODDist (sub_8227B4F0), AllowBoneLOD (sub_8226B060). Sólo actúan cuando el juego los llama.
#include <cstdint>
#include <emscripten.h>
struct Gh3Sw {
  int32_t magic;    // 'GSW1'
  int32_t ack;      // la página pone 1 cuando conoce la dirección
  int32_t crowd, light, lod;          // 1 = forzar
  int32_t nCrowd, nCrowdTrue, nLight, nLightTrue, nToggle, nViewer, nBone, ticks;
};
inline Gh3Sw g_sw = {0x47535731, 0, 0, 0, 0};
static inline int sw_get(const int32_t& v) { return __atomic_load_n(&v, __ATOMIC_RELAXED); }
static inline void gh3sw_tick() {
  Gh3Sw& s = g_sw; s.ticks++;
  if (!sw_get(s.ack) && (s.ticks % 60) == 1) EM_ASM({
    if (!globalThis.__swCh) globalThis.__swCh = new BroadcastChannel("hw60");
    globalThis.__swCh.postMessage({type: "gh3swMemory", ptr: $0});
  }, (uint32_t)(uintptr_t)&s);
}
// Público: el cfunc compara el argumento con «true» (0x0203B372) por cada modelo; forzado → se trata como false.
static inline uint32_t gh3sw_crowd(uint32_t arg, uint32_t yes) { g_sw.nCrowd++; if (arg == yes) g_sw.nCrowdTrue++; return sw_get(g_sw.crowd) ? (yes ^ 1) : arg; }
// Luces: r11 = 1 si el argumento es true; forzado → 0.
static inline int64_t gh3sw_light(int64_t on) { g_sw.nLight++; if (on) g_sw.nLightTrue++; return sw_get(g_sw.light) ? 0 : on; }
static inline uint64_t gh3sw_toggle(uint64_t v) { g_sw.nToggle++; return sw_get(g_sw.lod) ? 1 : v; }
static inline double gh3sw_viewer(double d) { g_sw.nViewer++; return sw_get(g_sw.lod) ? d * 0.25 : d; }
static inline int64_t gh3sw_bone(int64_t v) { g_sw.nBone++; return sw_get(g_sw.lod) ? 1 : v; }
