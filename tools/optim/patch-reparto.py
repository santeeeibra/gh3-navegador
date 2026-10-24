# Claude 2026-10-15 (recorte CPU): copia parcheada de gh3_recomp.5.cpp. sub_82190258 reparte tareas con dependencias
# y vuelve a recorrer la lista hasta repartir todas (r24 = pendientes). Si una vuelta entera no repartió ninguna
# (r24 igual que en la vuelta anterior), espera la tarea de otro hilo dando vueltas: ahí descansa `micros` µs.
# No toca el original. Uso: python tools/optim/patch-reparto.py <entrada.cpp> <salida.cpp> [micros=100]
import sys
src, dst = sys.argv[1], sys.argv[2]; us = int(sys.argv[3]) if len(sys.argv) > 3 else 100
L = open(src, encoding='utf-8').read().split('\n')
f = L.index('DEFINE_REX_FUNC(sub_82190258) {')
assert L[f + 2] == '\tuint32_t ea{};', L[f + 2]
L[f + 2] += '\n\tint32_t gh3_prev24 = -1;  // Claude: pendientes al final de la vuelta anterior'
b = next(i for i in range(f, f + 400) if L[i] == '\tif (ctx.cr6.gt) goto loc_821902D0;')
assert L[b - 4] == 'loc_8219043C:', L[b - 4]
L[b] = '\tif (ctx.cr6.gt) { if (ctx.r24.s32 == gh3_prev24) gh3_spin_rest(); gh3_prev24 = ctx.r24.s32; goto loc_821902D0; }'
head = ['#include <time.h>', f'static inline void gh3_spin_rest() {{ struct timespec ts{{0, {us * 1000}}}; nanosleep(&ts, nullptr); }}']
open(dst, 'w', encoding='utf-8').write('\n'.join(head + L))
print('parcheado sub_82190258,', us, 'us')
