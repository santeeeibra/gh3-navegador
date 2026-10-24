# Lista secciones de un PE y ubica RVAs dadas (solo lectura).
import struct, sys
b = open(sys.argv[1], 'rb').read()
pe = struct.unpack_from('<I', b, 0x3c)[0]; n = struct.unpack_from('<H', b, pe + 6)[0]; opt = struct.unpack_from('<H', b, pe + 20)[0]
base = struct.unpack_from('<I', b, pe + 24 + 28)[0]; ep = struct.unpack_from('<I', b, pe + 24 + 16)[0]
secs = []
for i in range(n):
    o = pe + 24 + opt + i * 40
    name = b[o:o + 8].rstrip(b'\0').decode('latin1'); vs, va, rs, ro = struct.unpack_from('<IIII', b, o + 8); ch = struct.unpack_from('<I', b, o + 36)[0]
    secs.append((name, va, vs, rs, ch)); print(f'{name:10} va=0x{va:08x} vsize=0x{vs:08x} rawsize=0x{rs:08x} chars=0x{ch:08x}')
print(f'imagebase=0x{base:x} entry rva=0x{ep:x}', [s[0] for s in secs if s[1] <= ep < s[1] + s[2]])
for a in sys.argv[2:]:
    r = int(a, 16); print(a, [s[0] for s in secs if s[1] <= r < s[1] + max(s[2], s[3])])
