// Ingeniería inversa (Claude, 2026-10-13): prelude para el build web "espía" de GH3.
// Se usa EN LUGAR de tools/d1-wasm/gh3_wasm_prelude.h (-include). Carga ese prelude y cambia dos cosas:
//  1. REX_FUNC_PROLOGUE: cada función generada se registra una vez (id) y cuenta sus llamadas.
//  2. REX_STORE_*: si la escritura toca el rango vigilado, se anota (dirección, valor nuevo/viejo,
//     función, LR, reloj de la canción) en un anillo. El rango lo fija la página desde afuera.
// Todo vive en re_info (re_hooks.cpp), que la página encuentra en la memoria por su marca.
#pragma once
#include "gh3_wasm_prelude.h"
#include "re_hooks.h"

#undef REX_FUNC_PROLOGUE
#undef REX_STORE_U8
#undef REX_STORE_U16
#undef REX_STORE_U32
#undef REX_STORE_U64

#define REX_FUNC_PROLOGUE()                                            \
  ((void)base);                                                        \
  static const uint32_t _re_fid = ::re_register(__func__);             \
  ::re_counts[_re_fid]++

#define RE_STORE_(T, x, v, n)                                                                   \
  ({                                                                                            \
    u32 _rga = (u32)(x);                                                                        \
    volatile T* _rp = (volatile T*)REX_HOST(_rga);                                              \
    T _rv = (v);                                                                                \
    if (__builtin_expect((u32)(_rga + ((n) - 1) - ::re_info.watch_lo) < ::re_info.watch_len + ((n) - 1), 0)) \
      ::re_hit(_rga, (n), (u64)_rv, (u64)*_rp, __func__, (u32)ctx.lr);                          \
    *_rp = _rv;                                                                                 \
  })
#define REX_STORE_U8(x, y) RE_STORE_(u8, x, (u8)(y), 1)
#define REX_STORE_U16(x, y) RE_STORE_(u16, x, __builtin_bswap16(y), 2)
#define REX_STORE_U32(x, y) RE_STORE_(u32, x, __builtin_bswap32(y), 4)
#define REX_STORE_U64(x, y) RE_STORE_(u64, x, __builtin_bswap64(y), 8)
