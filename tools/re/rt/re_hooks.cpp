// Espías de ingeniería inversa: estado en memoria que la página lee/escribe directamente.
#include "re_hooks.h"
#include <atomic>
#include <cstring>
#include "rex_wasm_seg.h"

#define RE_HITS_CAP 65536

extern "C" {
uint32_t re_counts[RE_MAX_FUNCS];
static const char* re_names[RE_MAX_FUNCS];
static ReHit re_hits[RE_HITS_CAP];

ReInfo re_info = {
    {'G', 'H', '3', '-', 'R', 'E', '-', 'I', 'N', 'F', 'O', '-', 'v', '1', 0, 0},
    1, 0, 0, 0, 0, 0, 0, {}, 0, RE_HITS_CAP, 0, 0};

static std::atomic<uint32_t> re_next{0};
static std::atomic<uint32_t> re_seq{0};

static void re_init_ptrs() {
  if (!re_info.counts_ptr) {
    re_info.counts_ptr = (uint32_t)(uintptr_t)re_counts;
    re_info.names_ptr = (uint32_t)(uintptr_t)re_names;
    re_info.hits_ptr = (uint32_t)(uintptr_t)re_hits;
  }
}

uint32_t re_register(const char* fn) {
  re_init_ptrs();
  uint32_t id = re_next.fetch_add(1, std::memory_order_relaxed);
  if (id >= RE_MAX_FUNCS) return RE_MAX_FUNCS - 1;  // no debería pasar (59.590 funciones)
  re_names[id] = fn;
  re_info.nfuncs = id + 1;
  return id;
}

void re_hit(uint32_t addr, uint32_t size, uint64_t value, uint64_t old, const char* fn, uint32_t lr) {
  // filtro exacto contra los rangos pedidos (el macro solo mira el rango que los abarca a todos)
  uint32_t n = re_info.nwatch;
  if (n) {
    bool in = false;
    for (uint32_t i = 0; i < n && i < RE_MAX_WATCH; ++i)
      if (addr + size - 1 - re_info.watch[i][0] < re_info.watch[i][1] + size - 1) { in = true; break; }
    if (!in) return;
  }
  uint32_t s = re_seq.fetch_add(1, std::memory_order_relaxed) + 1;
  ReHit& h = re_hits[(s - 1) % RE_HITS_CAP];
  h.seq = 0;
  h.addr = addr;
  h.size = size;
  h.fn = (uint32_t)(uintptr_t)fn;
  h.value = value;
  h.old = old;
  h.lr = lr;
  uint32_t c = __builtin_bswap32(*(volatile uint32_t*)::rexwasm::Host(0x829B57B0u));
  std::memcpy(&h.clock, &c, 4);
  __atomic_store_n(&h.seq, s, __ATOMIC_RELEASE);
  re_info.hits_n = s;
}
}
