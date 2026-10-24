// Claude 2026-10-15 (paso 4, memoria iPhone): SOLO DIAGNÓSTICO. Envuelve malloc/calloc/aligned_alloc/memalign/posix_memalign
// (enlazar con -Wl,--wrap=...) y anota cada reserva >= 256 KB (tamaño, dirección, orden, hilo) en una tabla en memoria que
// tools/accesos/acceso.mjs --mem encuentra por su marca. No cambia lo que se reserva. Sin funciones JS nuevas (el gh3-web.js
// publicado tiene cambios a mano: sólo se le ajustan las ASM_CONSTS).
#include <pthread.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>

#define N 4096
struct rec { unsigned magic, size, ptr, n, hilo; };
struct rec gh3_big_alloc[N];
static atomic_uint cnt;

void* __real_malloc(size_t);
void* __real_calloc(size_t, size_t);
void* __real_aligned_alloc(size_t, size_t);
void* __real_memalign(size_t, size_t);
int __real_posix_memalign(void**, size_t, size_t);

static __thread int dentro;
static void anota(void* p, size_t sz) {
  if (sz < 262144 || !p || dentro) return;
  dentro = 1;
  unsigned i = atomic_fetch_add(&cnt, 1);
  if (i < N) {
    struct rec* r = &gh3_big_alloc[i];
    r->size = (unsigned)sz; r->ptr = (unsigned)(size_t)p; r->n = i;
    r->hilo = (unsigned)(size_t)pthread_self();
    r->magic = 0x474D454Du;  // 'MEMG'
  }
  dentro = 0;
}
void* __wrap_malloc(size_t s) { void* p = __real_malloc(s); anota(p, s); return p; }
void* __wrap_calloc(size_t a, size_t b) { void* p = __real_calloc(a, b); anota(p, a * b); return p; }
void* __wrap_aligned_alloc(size_t a, size_t s) { void* p = __real_aligned_alloc(a, s); anota(p, s); return p; }
void* __wrap_memalign(size_t a, size_t s) { void* p = __real_memalign(a, s); anota(p, s); return p; }
int __wrap_posix_memalign(void** o, size_t a, size_t s) { int r = __real_posix_memalign(o, a, s); if (!r) anota(*o, s); return r; }
