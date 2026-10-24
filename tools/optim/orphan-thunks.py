# Claude 2026-10-13: funciones "pasamanos" del juego que el traductor (rexglue) no descubrió (sólo se llaman por tabla).
# Busca, traduce con el MISMO estilo que el código generado y arma los archivos para compilar sin regenerar todo.
# Sólo admite lwz/stw/addi/addis/mr/mtctr/cmplwi/b<cond>lr/bctr; cualquier otra instrucción = error (se revisa a mano).
# Uso: python -I tools/optim/orphan-thunks.py <salida_dir>          → gh3_orphans.cpp, gh3_init.cpp, gh3_register.cpp, lista.txt
#      python -I tools/optim/orphan-thunks.py --check                 → traduce funciones YA generadas y compara con rexglue
import bisect, glob, re, struct, sys
ROOT = __file__.replace('\\', '/').rsplit('/tools/', 1)[0]
G = ROOT + '/artifacts/xex-adapt/paso-b/gh3-variant/generated/variant-dd2ca1ab/'
PE = open(ROOT + '/artifacts/ghidra/default-dd2ca1ab.pe', 'rb').read()
BASE, LO, HI = 0x82000000, 0x820D0000, 0x828BB70C
BCTR, BLR = 0x4E800420, 0x4E800020
W = lambda a: struct.unpack('>I', PE[a - BASE:a - BASE + 4])[0]
s16 = lambda v: v - 0x10000 if v & 0x8000 else v

def translate(addr):
    out, a = [], addr
    while True:
        w = W(a); op = w >> 26; rt = (w >> 21) & 31; ra = (w >> 16) & 31; d = s16(w & 0xFFFF)
        if op == 32 and ra:
            out.append(f'ctx.r{rt}.u64 = REX_LOAD_U32(ctx.r{ra}.u32 + {d});')
        elif op == 36 and ra:
            out.append(f'REX_STORE_U32(ctx.r{ra}.u32 + {d}, ctx.r{rt}.u32);')
        elif op == 14:
            out.append(f'ctx.r{rt}.s64 = {d};' if ra == 0 else f'ctx.r{rt}.s64 = ctx.r{ra}.s64 + {d};')
        elif op == 15:
            out.append(f'ctx.r{rt}.s64 = {d * 65536};' if ra == 0 else f'ctx.r{rt}.s64 = ctx.r{ra}.s64 + {d * 65536};')
        elif op == 31 and (w >> 1) & 1023 == 444 and not w & 1 and rt == (w >> 11) & 31:
            out.append(f'ctx.r{ra}.u64 = ctx.r{rt}.u64;')               # mr rA,rS
        elif op == 31 and (w >> 1) & 1023 == 467 and ((w >> 11) & 0x3FF) == 0x120:
            out.append(f'ctx.ctr.u64 = ctx.r{rt}.u64;')                 # mtctr
        elif op == 10 and not (rt & 1):
            out.append(f'ctx.cr{rt >> 2}.compare<uint32_t>(ctx.r{ra}.u32, {w & 0xFFFF}, ctx.xer);')
        elif op == 19 and (w >> 1) & 1023 == 16 and not w & 1 and rt in (4, 12) and w != BLR:
            bi = ra; f = ['lt', 'gt', 'eq', 'so'][bi & 3]
            out.append(f'if ({"" if rt == 12 else "!"}ctx.cr{bi >> 2}.{f}) return;')
        elif w == BCTR:
            out.append('REX_CALL_INDIRECT_FUNC(ctx.ctr.u32);'); out.append('return;'); return out, a + 4
        else:
            raise ValueError(f'{addr:08X}: instrucción no admitida {w:08X} en {a:08X}')
        a += 4
        if a - addr > 64: raise ValueError(f'{addr:08X}: demasiado larga')

def known():
    size, body = {}, {}
    for f in glob.glob(G + 'gh3_recomp.*.cpp'):
        cur = None
        for line in open(f, encoding='utf-8', errors='ignore'):
            m = re.match(r'DEFINE_REX_FUNC\(sub_([0-9A-F]{8})\)', line)
            if m: cur = int(m[1], 16); size[cur] = 0; body[cur] = []; continue
            if cur is None: continue
            if re.match(r'\t// [a-z]', line): size[cur] += 1
            elif line.startswith('\t') and 'REX_FUNC_PROLOGUE' not in line: body[cur].append(line.strip())
    return size, body

def orphans(size):
    starts = sorted(size); res = []
    for a in range(LO + 4, HI - 64, 4):
        if a in size or W(a - 4) not in (BCTR, BLR) or W(a) == 0: continue
        s = starts[bisect.bisect_left(starts, a) - 1]
        if a < s + 4 * size[s]: continue
        w = W(a)
        if w >> 26 != 32 or (w >> 16) & 31 != 3: continue
        seq = [W(a + 4 * k) for k in range(12)]
        if BCTR in seq and BLR not in seq[:seq.index(BCTR)]: res.append(a)
    return res

size, body = known()
if sys.argv[1] == '--check':
    ok = bad = skip = 0
    for a in sorted(size):
        if size[a] > 9 or not body[a] or body[a][-2:] != ['REX_CALL_INDIRECT_FUNC(ctx.ctr.u32);', 'return;']: continue
        try: mine, _ = translate(a)
        except ValueError: skip += 1; continue
        if mine == body[a]: ok += 1
        else:
            bad += 1
            if bad <= 5: print('DIFERENTE', hex(a), mine, body[a])
    print(f'comprobación: {ok} iguales, {bad} distintas, {skip} con instrucciones no admitidas'); sys.exit(1 if bad else 0)

out = sys.argv[1]; found = orphans(size); code = {}
for a in found:
    code[a], end = translate(a)
    assert end <= HI
print(len(found), 'funciones')
with open(out + '/gh3_orphans.cpp', 'w', newline='\n') as f:
    f.write('// Claude 2026-10-13: pasamanos que rexglue no descubrió (tools/optim/orphan-thunks.py). Mismo estilo que el generado.\n#include "gh3_init.h"\n\n')
    f.write(''.join(f'DECLARE_REX_FUNC(sub_{a:08X});\n' for a in found) + '\n')
    for a in found:
        f.write(f'DEFINE_REX_FUNC(sub_{a:08X}) {{\n\tREX_FUNC_PROLOGUE();\n' + ''.join('\t' + l + '\n' for l in code[a]) + '}\n\n')
decl = ''.join(f'DECLARE_REX_FUNC(sub_{a:08X});\n' for a in found)
for name, pat, fmt in (('gh3_init.cpp', r'\t\{ 0x([0-9A-F]{8}), sub_', '\t{{ 0x{0:08X}, sub_{0:08X} }},\n'),
                       ('gh3_register.cpp', r'  registrar->SetFunction\(0x([0-9A-F]{8}),', '  registrar->SetFunction(0x{0:08X}, sub_{0:08X});\n')):
    lines = open(G + name, encoding='utf-8').read().split('\n'); res = []; todo = sorted(found); first = True
    for line in lines:
        m = re.match(pat, line)
        if m:
            while todo and todo[0] < int(m[1], 16): res.append(fmt.format(todo.pop(0)).rstrip('\n'))
        res.append(line)
        if first and line.startswith('#include "gh3_init.h"'): res.append(decl.rstrip('\n')); first = False
    assert not todo and not first, name
    open(out + '/' + name, 'w', encoding='utf-8', newline='\n').write('\n'.join(res))
open(out + '/lista.txt', 'w').write('\n'.join(f'{a:08X}' for a in found) + '\n')
