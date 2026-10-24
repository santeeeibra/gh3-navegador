# Lista los bucles (saltos hacia atrás) de una función recompilada y muestra el cuerpo de los más chicos.
# Uso: python tools/optim/loops.py <archivo.cpp> <sub_XXXXXXXX> [max_lineas_cuerpo=40]
import re, sys
path, name = sys.argv[1], sys.argv[2]; maxb = int(sys.argv[3]) if len(sys.argv) > 3 else 40
L = open(path, encoding='utf-8', errors='replace').read().split('\n')
s = next(i for i, l in enumerate(L) if l.startswith(f'DEFINE_REX_FUNC({name})'))
e = next(i for i in range(s + 1, len(L)) if L[i].startswith('DEFINE_REX_FUNC('))
F = L[s:e]; lab = {m.group(1): i for i, l in enumerate(F) if (m := re.match(r'(loc_[0-9A-F]+):', l))}
print(name, 'líneas', len(F))
for i, l in enumerate(F):
    m = re.search(r'goto (loc_[0-9A-F]+);', l)
    if m and m.group(1) in lab and lab[m.group(1)] < i:
        a = lab[m.group(1)]; body = [x.strip() for x in F[a:i + 1] if x.strip().startswith('//')]
        calls = [x for x in body if x.startswith('// bl ')]
        print(f'\nBUCLE {m.group(1)} -> línea {s+i+1}: {i-a} líneas, {len(calls)} llamadas')
        if i - a <= maxb: print('  ' + '\n  '.join(body))
