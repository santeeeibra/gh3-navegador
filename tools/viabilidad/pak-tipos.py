"""Viabilidad (Claude 2026-10-16): cuenta tipos de recurso dentro de todos los PAK de la copia Xbox 360 (solo lectura).
Tabla de 32 bytes big-endian como tools/original-textures/unpack.py (Codex, basada en NeversoftMultitool).
Uso: python -I tools/viabilidad/pak-tipos.py <carpeta DATA> <salida.json>"""
import json, struct, sys, zlib
from pathlib import Path
EXT = ['.tex', '.scn', '.skin', '.ska', '.ske', '.col', '.qb', '.img', '.fnt', '.mqb', '.rag', '.nav', '.fam', '.note', '.pimg',
       '.last', '.perm', '.cam', '.mdl', '.geom', '.pfx', '.shd', '.stex', '.oba', '.clt', '.hkc', '.nqb', '.tvx', '.wav', '.dbg',
       '.qs', '.qs.en', '.qs.fr', '.qs.de', '.qs.it', '.qs.es', '.sqb', '.mqb', '.anim', '.fsb', '.trkm', '.cif', '.png', '.xml', '.pak', '.dat', '.bnk', '.lst']
key = lambda s: zlib.crc32(s.encode()) ^ 0xFFFFFFFF
NAMES = {key(e): e for e in EXT}
def unwrap(raw):
    try:
        d = zlib.decompressobj(-15); b = d.decompress(raw, 512 << 20)
        if d.eof: return b
    except zlib.error: pass
    return raw
data = Path(sys.argv[1]); res = {'porTipo': {}, 'archivos': {}, 'errores': []}
for f in sorted(data.rglob('*.pak.xen')):
    try:
        pak = unwrap(f.read_bytes()); pos = 0; cnt = {}
        while pos + 32 <= len(pak):
            typ, off, size, ctx, full, short, parent, flags = struct.unpack_from('>8I', pak, pos)
            if typ in (0xB524565F, 0x2CB3EF3B): break
            n = NAMES.get(typ, hex(typ)); cnt[n] = cnt.get(n, 0) + 1
            t = res['porTipo'].setdefault(n, {'entradas': 0, 'bytes': 0, 'paks': 0}); t['entradas'] += 1; t['bytes'] += size
            pos += 192 if flags & 32 else 32
        for n in cnt: res['porTipo'][n]['paks'] += 1
        res['archivos'][str(f.relative_to(data))] = cnt
    except Exception as e:
        res['errores'].append(f'{f.name}: {e}')
json.dump(res, open(sys.argv[2], 'w'), indent=1)
for n, t in sorted(res['porTipo'].items(), key=lambda x: -x[1]['bytes']): print(f"{n:12} entradas {t['entradas']:6} en {t['paks']:4} paks  {t['bytes']/1048576:8.1f} MB")
print('paks', len(res['archivos']), 'errores', len(res['errores']), res['errores'][:3])
