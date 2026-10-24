# Extrae del PE de GH3 X360 los pares {puntero a nombre, puntero a función} (tablas de
# funciones C que llaman los scripts QB). Solo lectura. Uso:
#   python -I extract-cfuncs.py <default-dd2ca1ab.pe> <functions.txt> <salida.tsv>
import sys, struct
pe, funcs_txt, out = sys.argv[1:4]
d = open(pe, 'rb').read()
B = 0x82000000
funcs = {int(l.strip(), 16) for l in open(funcs_txt) if l.strip()}

def cstr(va):
    o = va - B
    if o < 0 or o >= len(d): return None
    e = d.find(b'\0', o, o + 80)
    if e <= o + 1: return None
    s = d[o:e]
    if not all(48 <= c < 123 and (chr(c).isalnum() or c == 95) for c in s): return None
    if not chr(s[0]).isalpha(): return None
    return s.decode()

rows = []
for o in range(0, len(d) - 8, 4):
    n, f = struct.unpack_from('>II', d, o)
    if f in funcs and B <= n < B + len(d):
        s = cstr(n)
        if s: rows.append((B + o, s, f))
# agrupar en tablas: entradas contiguas cada 8 bytes
tables, cur = [], []
for r in rows:
    if cur and r[0] - cur[-1][0] != 8:
        tables.append(cur); cur = []
    cur.append(r)
if cur: tables.append(cur)
keep = [t for t in tables if len(t) >= 4]
with open(out, 'w') as w:
    w.write('func\tname\ttable\n')
    for t in keep:
        for (at, s, f) in t:
            w.write('%08X\t%s\t%08X\n' % (f, s, t[0][0]))
print('tablas', len(keep), 'entradas', sum(len(t) for t in keep))
for t in keep: print('  %08X x%d  %s..%s' % (t[0][0], len(t), t[0][1], t[-1][1]))
