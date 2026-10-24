// Paso D2: memoria guest de la Xbox 360 en WebAssembly (wasm32) por SEGMENTOS de 16 MB.
//
// En nativo rexglue (src/system/xmemory.cpp) mapea un archivo de memoria compartida en varias
// vistas (map_info): 0x90000000 es alias de 0x80000000, y 0x7F/0xA0/0xC0/0xE0(+0x1000) son
// alias de la memoria física. WebAssembly no puede crear alias de páginas, pero las vistas son
// pocas y grandes: cada región del "archivo" (virtual 4k, virtual 64k, xex, física) recibe UN
// bloque contiguo del heap de wasm, y una tabla de 256 entradas (una por cada 16 MB guest) da el
// desplazamiento al host. Así:
//   host = rexwasm_seg[guest >> 24] + guest     (aritmética de 32 bits: el ajuste se resta)
// Los alias apuntan al mismo bloque, los rangos contiguos del guest son contiguos en el host
// (memcpy del kernel sobre buffers grandes funciona) y el costo por acceso es una carga más.
// Diferencia con nativo: sin protección de páginas (las guardas NoAccess no fallan) y el MMIO
// solo entra por REX_MM_* (CheckLoad/CheckStore), igual que el diseño del SDK.
#pragma once
#include <cstddef>
#include <cstdint>

extern "C" uintptr_t rexwasm_seg[256];

namespace rexwasm {

struct Region {
  const char* name;
  uint32_t guest_start;  // primera dirección guest de la vista "canónica"
  uint64_t size;         // bytes del bloque host
  uint8_t* host;         // bloque contiguo (memoria nueva de sbrk: empieza en cero)
};

// Regiones del archivo de respaldo (como map_info): 0 virtual 4k, 1 virtual 64k, 2 xex, 3 física.
enum : int { kRegionV00 = 0, kRegionV40 = 1, kRegionXex = 2, kRegionPhys = 3, kRegionCount = 4 };

bool InitSegments();
bool SegmentsReady();
const Region& GetRegion(int index);

inline uint8_t* Host(uint32_t guest) {
  return reinterpret_cast<uint8_t*>(rexwasm_seg[guest >> 24] + guest);
}
inline uint8_t* HostPhysical(uint32_t physical) {  // Memory::TranslatePhysical
  return Host(0xA0000000u + (physical & 0x1FFFFFFFu));
}
// Puntero host -> dirección guest canónica (física por la vista 0xA0000000). UINT32_MAX si no es
// memoria guest.
uint32_t HostToGuest(const void* host);
// true si [host, host+length) está entero dentro de un bloque guest.
bool IsGuestHost(const void* host, size_t length);
// Bytes reservados y bytes del bloque "basura" (vistas sin respaldo).
uint64_t ReservedBytes();

}  // namespace rexwasm
