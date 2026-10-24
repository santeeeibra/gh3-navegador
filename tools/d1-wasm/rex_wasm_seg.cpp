// Paso D2: ver rex_wasm_seg.h.
#include "rex_wasm_seg.h"

#include <unistd.h>

#include <cstdio>

extern "C" uintptr_t rexwasm_seg[256] = {};

namespace rexwasm {
namespace {

Region g_regions[kRegionCount] = {
    {"virtual 4k (0x00000000)", 0x00000000u, 0x40000000ull, nullptr},
    {"virtual 64k (0x40000000)", 0x40000000u, 0x3F000000ull, nullptr},
    {"xex (0x80000000/0x90000000)", 0x80000000u, 0x10000000ull, nullptr},
    // +0x1000: la vista 0xE0000000 está corrida 4 KB y su última página cae después del final.
    {"fisica (0x7F/0xA0/0xC0/0xE0)", 0xA0000000u, 0x20000000ull + 0x1000ull, nullptr},
};
bool g_ready = false;

// Memoria nueva del final del heap: wasm la entrega en cero y no ocupa RAM hasta tocarla.
uint8_t* Reserve(uint64_t size) {
  constexpr uintptr_t kAlign = 0x10000;
  uintptr_t cur = reinterpret_cast<uintptr_t>(sbrk(0));
  uintptr_t pad = (kAlign - (cur & (kAlign - 1))) & (kAlign - 1);
  if (pad && sbrk(static_cast<intptr_t>(pad)) == reinterpret_cast<void*>(-1)) return nullptr;
  void* p = sbrk(static_cast<intptr_t>(size));
  if (p == reinterpret_cast<void*>(-1)) return nullptr;
  return static_cast<uint8_t*>(p);
}

void MapSegments(uint32_t first_seg, uint32_t last_seg, uint8_t* host, uint32_t view_start) {
  for (uint32_t s = first_seg; s <= last_seg; ++s)
    rexwasm_seg[s] = reinterpret_cast<uintptr_t>(host) - view_start;
}

}  // namespace

bool InitSegments() {
  if (g_ready) return true;
  for (auto& r : g_regions) {
    r.host = Reserve(r.size);
    if (!r.host) {
      std::fprintf(stderr, "[rexwasm] no se pudo reservar %s (%llu MB)\n", r.name,
                   static_cast<unsigned long long>(r.size >> 20));
      return false;
    }
  }
  uint8_t* v00 = g_regions[kRegionV00].host;
  uint8_t* v40 = g_regions[kRegionV40].host;
  uint8_t* xex = g_regions[kRegionXex].host;
  uint8_t* phys = g_regions[kRegionPhys].host;
  MapSegments(0x00, 0x3F, v00, 0x00000000u);
  MapSegments(0x40, 0x7E, v40, 0x40000000u);
  MapSegments(0x7F, 0x7F, phys, 0x7F000000u);  // GPU writeback -> física
  MapSegments(0x80, 0x8F, xex, 0x80000000u);
  MapSegments(0x90, 0x9F, xex, 0x90000000u);  // alias de 0x80000000
  MapSegments(0xA0, 0xBF, phys, 0xA0000000u);
  MapSegments(0xC0, 0xDF, phys, 0xC0000000u);
  MapSegments(0xE0, 0xFF, phys + 0x1000, 0xE0000000u);
  g_ready = true;
  return true;
}

bool SegmentsReady() { return g_ready; }
const Region& GetRegion(int index) { return g_regions[index]; }

uint32_t HostToGuest(const void* host) {
  auto p = reinterpret_cast<uintptr_t>(host);
  for (const auto& r : g_regions) {
    auto b = reinterpret_cast<uintptr_t>(r.host);
    if (r.host && p >= b && p < b + r.size) return r.guest_start + uint32_t(p - b);
  }
  return UINT32_MAX;
}

bool IsGuestHost(const void* host, size_t length) {
  auto p = reinterpret_cast<uintptr_t>(host);
  for (const auto& r : g_regions) {
    auto b = reinterpret_cast<uintptr_t>(r.host);
    if (r.host && p >= b && p + length <= b + r.size) return true;
  }
  return false;
}

uint64_t ReservedBytes() {
  uint64_t t = 0;
  for (const auto& r : g_regions) t += r.size;
  return t;
}

}  // namespace rexwasm
