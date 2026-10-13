// Espías de ingeniería inversa (ver gh3_re_prelude.h). Estado compartido con la página por memoria.
#pragma once
#include <cstdint>

#define RE_MAX_FUNCS 65536
#define RE_MAX_WATCH 8

struct ReHit {          // 48 bytes; valores tal como quedan en memoria (big endian)
  uint32_t seq;         // 1.. (0 = vacío)
  uint32_t addr;        // dirección guest escrita
  uint32_t size;        // 1, 2, 4, 8
  uint32_t fn;          // puntero (wasm) al nombre de la función: "__imp__sub_XXXXXXXX"
  uint64_t value;       // valor nuevo
  uint64_t old;         // valor anterior
  uint32_t lr;          // LR guest al escribir
  float clock;          // reloj de la canción (ms) en ese momento
  uint32_t pad[2];
};

struct ReInfo {
  char magic[16];               // "GH3-RE-INFO-v1"
  uint32_t version;             // 1
  uint32_t counts_ptr;          // uint32_t[RE_MAX_FUNCS], llamadas por función (id)
  uint32_t names_ptr;           // const char*[RE_MAX_FUNCS], nombre por id
  volatile uint32_t nfuncs;     // ids asignados
  volatile uint32_t watch_lo;   // rango que abarca todas las vigilancias (lo lo fija la página)
  volatile uint32_t watch_len;  // 0 = apagado
  volatile uint32_t nwatch;     // rangos exactos (la página los fija)
  uint32_t watch[RE_MAX_WATCH][2];
  uint32_t hits_ptr;            // ReHit[hits_cap], anillo
  uint32_t hits_cap;
  volatile uint32_t hits_n;     // total de aciertos escritos (posición = (n-1) % cap)
  volatile uint32_t hits_dropped;
};

extern "C" {
extern ReInfo re_info;
extern uint32_t re_counts[RE_MAX_FUNCS];
uint32_t re_register(const char* fn);
void re_hit(uint32_t addr, uint32_t size, uint64_t value, uint64_t old, const char* fn, uint32_t lr);
}
