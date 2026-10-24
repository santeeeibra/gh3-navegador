// XXH3-64 para el verificador JS de R5F (r5frame-check.mjs). Compilado a un .mjs autocontenido.
#define XXH_INLINE_ALL
#include <xxhash.h>
#include <emscripten.h>
EMSCRIPTEN_KEEPALIVE unsigned long long r5f_xxh3(const void* p, unsigned long n) { return XXH3_64bits(p, n); }
