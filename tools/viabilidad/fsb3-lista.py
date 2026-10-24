"""Viabilidad (Claude 2026-10-16): lista el banco FSB3 sin cifrar (streamall.fsb.xen), solo lectura.
Uso: python -I tools/viabilidad/fsb3-lista.py <fsb3> <salida.json>"""
import json, struct, sys
b = open(sys.argv[1], 'rb').read(4 << 20)
assert b[:4] == b'FSB3'
n, shdr, data, ver, mode = struct.unpack_from('<5I', b, 4)
pos, out = 24, []
for i in range(n):
    size, = struct.unpack_from('<H', b, pos); name = b[pos+2:pos+32].split(b'\0')[0].decode('latin-1')
    length, csize, ls, le, smode, freq = struct.unpack_from('<6I', b, pos + 32)
    out.append({'nombre': name, 'muestras': length, 'bytes': csize, 'modo': hex(smode), 'hz': freq}); pos += size
modos = {}
for s in out: modos[s['modo']] = modos.get(s['modo'], 0) + 1
json.dump({'sonidos': n, 'version': hex(ver), 'datosMB': round(data / 1048576, 1), 'modos': modos, 'primeros': out[:10]}, open(sys.argv[2], 'w'), indent=1)
print(n, 'sonidos', hex(ver), round(data/1048576,1), 'MB', modos, [s['nombre'] for s in out[:6]], out[0])
