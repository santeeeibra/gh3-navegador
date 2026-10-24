// Paso 1 fluidez (Claude 2026-10-14): bloques de 16 registros de GPU escritos desde la última consulta del productor
// R5L. Los marcan todas las escrituras al archivo de registros (rtsrc command_processor.cpp y graphics_system.cpp);
// r5_frame.cpp (BeginEvent) compara sólo esos bloques en vez de los 0x5003 registros en cada evento.
// Bloques que escribe OTRO hilo (MMIO del CPU del juego, p. ej. CP_RB_WPTR 0x1C5) quedan "fijos": se revisan en cada
// evento, leyendo en el mismo instante que el recorrido completo de antes (sin carrera entre marca y valor).
// Definición de g_bits/g_fixed en command_processor.cpp.
#pragma once
#include <atomic>
#include <cstdint>

namespace r5dirty {
constexpr uint32_t kRegs = 0x5003, kBlocks = (kRegs + 15) / 16, kWords = (kBlocks + 31) / 32;
extern std::atomic<uint32_t> g_bits[kWords];   // escritos desde el último canje (hilo del CP)
extern std::atomic<uint32_t> g_fixed[kWords];  // escritos alguna vez por otro hilo: siempre se revisan

// Hilo del CP (el mismo que consulta): marcar DESPUÉS de escribir; basta leer antes de escribir.
inline void MarkCp(uint32_t index) {
  if (index >= kRegs) return;
  const uint32_t b = index >> 4, m = 1u << (b & 31);
  std::atomic<uint32_t>& w = g_bits[b >> 5];
  if (!(w.load(std::memory_order_relaxed) & m)) w.fetch_or(m, std::memory_order_relaxed);
}
inline void MarkRangeCp(uint32_t first, uint32_t count) {
  for (uint32_t b = first >> 4, e = count ? (first + count - 1) >> 4 : 0; count && b <= e && b < kBlocks; b++)
    g_bits[b >> 5].fetch_or(1u << (b & 31), std::memory_order_relaxed);
}
// Otro hilo: llamar ANTES de escribir el valor (queda fijo) y MarkCp después (por la primera vez).
inline void FixOtherThread(uint32_t index) {
  if (index >= kRegs) return;
  const uint32_t b = index >> 4, m = 1u << (b & 31);
  std::atomic<uint32_t>& w = g_fixed[b >> 5];
  if (!(w.load(std::memory_order_seq_cst) & m)) w.fetch_or(m, std::memory_order_seq_cst);
}
inline void ClearAll() { for (auto& w : g_bits) w.store(0, std::memory_order_relaxed); }
}  // namespace r5dirty
