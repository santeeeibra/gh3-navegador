// Pasos D1/D2: se incluye ANTES de cada archivo generado (-include). Carga gh3_init.h original y
// reemplaza los accesos a memoria por la traducción por segmentos (rex_wasm_seg.h), que comparte
// con el kernel. El #pragma once de gh3_init.h evita que el #include del .cpp lo reprocese.
#pragma once
#include "gh3_init.h"
#include "rex_wasm_seg.h"

#undef REX_FUNC_PROLOGUE
#undef REX_RAW_ADDR
#undef REX_LOAD_U8
#undef REX_LOAD_U16
#undef REX_LOAD_U32
#undef REX_LOAD_U64
#undef REX_LOAD_STRING
#undef REX_STORE_U8
#undef REX_STORE_U16
#undef REX_STORE_U32
#undef REX_STORE_U64
#undef REX_MM_LOAD_U8
#undef REX_MM_LOAD_U16
#undef REX_MM_LOAD_U32
#undef REX_MM_LOAD_U64
#undef REX_MM_STORE_U8
#undef REX_MM_STORE_U16
#undef REX_MM_STORE_U32
#undef REX_MM_STORE_U64
#undef REX_LOOKUP_FUNC

// `base` (virtual_membase en nativo) no se usa: la traducción la hace rexwasm_seg.
#define REX_FUNC_PROLOGUE() ((void)base)
#define REX_HOST(x) (::rexwasm::Host((u32)(x)))
#define REX_RAW_ADDR(x) REX_HOST(x)

#define REX_LOAD_U8(x) (*(volatile u8*)REX_HOST(x))
#define REX_LOAD_U16(x) __builtin_bswap16(*(volatile u16*)REX_HOST(x))
#define REX_LOAD_U32(x) __builtin_bswap32(*(volatile u32*)REX_HOST(x))
#define REX_LOAD_U64(x) __builtin_bswap64(*(volatile u64*)REX_HOST(x))
#define REX_LOAD_STRING(x, len) std::string_view(reinterpret_cast<const char*>(REX_HOST(x)), (len))

#ifndef GH3_R2_WATCH
#define REX_STORE_U8(x, y) (*(volatile u8*)REX_HOST(x) = (y))
#define REX_STORE_U16(x, y) (*(volatile u16*)REX_HOST(x) = __builtin_bswap16(y))
#define REX_STORE_U32(x, y) (*(volatile u32*)REX_HOST(x) = __builtin_bswap32(y))
#define REX_STORE_U64(x, y) (*(volatile u64*)REX_HOST(x) = __builtin_bswap64(y))
#else
// R2 (solo diagnóstico): avisa cuando un store del juego toca la palabra vigilada [r2_watch_host, +4).
// La fija el CP en su primera espera de memoria. Llamada después del store, con el nombre de la
// función generada (__func__) para saber quién escribe.
extern "C" uintptr_t r2_watch_host;
extern "C" void r2_watch_hit(const char* fn, u64 value, u32 size, uintptr_t host);
#define R2_STORE_(T, x, v, n)                                                              \
  ({                                                                                       \
    uintptr_t _r2p = (uintptr_t)REX_HOST(x);                                               \
    *(volatile T*)_r2p = (v);                                                              \
    if (__builtin_expect((uintptr_t)(_r2p + (n) - 1 - r2_watch_host) < (uintptr_t)(3 + (n)), 0)) \
      r2_watch_hit(__func__, (u64)(v), (n), _r2p);                                         \
  })
#define REX_STORE_U8(x, y) R2_STORE_(u8, x, (u8)(y), 1)
#define REX_STORE_U16(x, y) R2_STORE_(u16, x, __builtin_bswap16(y), 2)
#define REX_STORE_U32(x, y) R2_STORE_(u32, x, __builtin_bswap32(y), 4)
#define REX_STORE_U64(x, y) R2_STORE_(u64, x, __builtin_bswap64(y), 8)
#endif

// MMIO: misma regla que pch_h.inja (0x7F000000-0x7FFFFFFF va a MMIOHandler).
#define REX_MM_STORE_(addr, val, STORE)                                                       \
  do {                                                                                        \
    u32 _mmio_addr = (addr);                                                                  \
    if (REX_IS_MMIO_ADDR(_mmio_addr))                                                         \
      rex::runtime::MMIOHandler::global_handler()->CheckStore(_mmio_addr, static_cast<u32>(val)); \
    else                                                                                      \
      STORE(_mmio_addr, val);                                                                 \
  } while (0)
#define REX_MM_STORE_U8(addr, val) REX_MM_STORE_(addr, val, REX_STORE_U8)
#define REX_MM_STORE_U16(addr, val) REX_MM_STORE_(addr, val, REX_STORE_U16)
#define REX_MM_STORE_U32(addr, val) REX_MM_STORE_(addr, val, REX_STORE_U32)
#define REX_MM_STORE_U64(addr, val)                                                          \
  do {                                                                                       \
    u32 _mmio_addr = (addr);                                                                 \
    if (REX_IS_MMIO_ADDR(_mmio_addr)) {                                                      \
      u64 _v64 = static_cast<u64>(val);                                                      \
      rex::runtime::MMIOHandler::global_handler()->CheckStore(_mmio_addr, u32(_v64 >> 32));  \
      rex::runtime::MMIOHandler::global_handler()->CheckStore(_mmio_addr + 4, u32(_v64));    \
    } else {                                                                                 \
      REX_STORE_U64(_mmio_addr, val);                                                        \
    }                                                                                        \
  } while (0)
#define REX_MM_LOAD_(addr, T, LOAD)                                        \
  ({                                                                       \
    u32 _mmio_addr = (addr);                                               \
    T _r;                                                                  \
    if (REX_IS_MMIO_ADDR(_mmio_addr)) {                                    \
      u32 _v;                                                              \
      rex::runtime::MMIOHandler::global_handler()->CheckLoad(_mmio_addr, &_v); \
      _r = static_cast<T>(_v);                                             \
    } else {                                                               \
      _r = LOAD(_mmio_addr);                                               \
    }                                                                      \
    _r;                                                                    \
  })
#define REX_MM_LOAD_U8(addr) REX_MM_LOAD_(addr, u8, REX_LOAD_U8)
#define REX_MM_LOAD_U16(addr) REX_MM_LOAD_(addr, u16, REX_LOAD_U16)
#define REX_MM_LOAD_U32(addr) REX_MM_LOAD_(addr, u32, REX_LOAD_U32)
#define REX_MM_LOAD_U64(addr)                                                       \
  ({                                                                                \
    u32 _mmio_addr = (addr);                                                        \
    u64 _r;                                                                         \
    if (REX_IS_MMIO_ADDR(_mmio_addr)) {                                             \
      u32 _hi, _lo;                                                                 \
      rex::runtime::MMIOHandler::global_handler()->CheckLoad(_mmio_addr, &_hi);     \
      rex::runtime::MMIOHandler::global_handler()->CheckLoad(_mmio_addr + 4, &_lo); \
      _r = (static_cast<u64>(_hi) << 32) | _lo;                                     \
    } else {                                                                        \
      _r = REX_LOAD_U64(_mmio_addr);                                                \
    }                                                                               \
    _r;                                                                             \
  })

// Tabla de despacho indirecto: igual que nativo, en memoria guest a IMAGE_BASE + IMAGE_SIZE
// (dentro del bloque xex), con una entrada de 8 bytes por instrucción. En wasm32 el puntero a
// función ocupa los primeros 4 bytes de cada entrada (lo escribe el runtime, endianness del host).
#define REX_LOOKUP_FUNC(x, y) \
  (*(PPCFunc**)(REX_HOST(REX_IMAGE_BASE + REX_IMAGE_SIZE) + (u32(u32(y) - REX_CODE_BASE) * 2)))

#ifdef GH3_G1B_TRACE
#include "g1b_audio_watch.h"
#endif
