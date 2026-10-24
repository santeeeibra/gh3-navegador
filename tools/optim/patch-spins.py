# Copia parcheada de un .cpp generado: dentro de bucles de espera activa (spin) agrega un descanso corto.
# No toca el original. Uso: python tools/optim/patch-spins.py <entrada.cpp> <salida.cpp> <loc_XXXXXXXX>[,<loc_...>] [micros=250]
import re, sys
src, dst, labels = sys.argv[1], sys.argv[2], sys.argv[3].split(',')
us = int(sys.argv[4]) if len(sys.argv) > 4 else 250
L = open(src, encoding='utf-8').read().split('\n')
pos = {l.split(':')[0]: i for i, l in enumerate(L) if re.match(r'loc_[0-9A-F]+:$', l)}
done = 0
for lab in labels:
    a = pos[lab]
    # primer goto hacia atrás a esta etiqueta, después de ella
    i = next(i for i in range(a + 1, len(L)) if re.search(rf'goto {lab};', L[i]))
    if 'gh3_spin_rest' in L[i]: continue
    L[i] = re.sub(rf'(if \(.*\)) goto {lab};', rf'\1 {{ gh3_spin_rest(); goto {lab}; }}', L[i])
    assert 'gh3_spin_rest' in L[i], (lab, L[i]); done += 1
head = ['#include <time.h>', f'static inline void gh3_spin_rest() {{ struct timespec ts{{0, {us * 1000}}}; nanosleep(&ts, nullptr); }}']
open(dst, 'w', encoding='utf-8').write('\n'.join(head + L))
print('parcheados', done, 'bucles,', us, 'us')
