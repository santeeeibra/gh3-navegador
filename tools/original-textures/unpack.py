"""Read-only GH3 X360 PAK/PAB inventory and selected texture extraction.

Header-relative offsets and type IDs follow MIT NeversoftMultitool PakArchive.cs.
This bounded adapter supports big-endian compact GH3 tables and raw DEFLATE.
Unknown layouts fail instead of guessing. Commercial outputs stay in artifacts.
"""
import hashlib
import json
import struct
import sys
import zlib
from pathlib import Path

def unwrap(raw):
    known = {0x43904241, 0xA7F505C4, 0xDAD5E950, 0x8BFA5E8E, 0x64112E85, 0x2C3B5ADC, 0x745DCD45}
    if len(raw) >= 4 and struct.unpack_from('>I', raw)[0] in known:
        return raw
    d = zlib.decompressobj(-15)
    body = d.decompress(raw, 256*1024*1024)
    if not d.eof or d.unconsumed_tail:
        raise ValueError('Incomplete or oversized DEFLATE')
    return body

source = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
if output == source.parent or source.parent in output.parents:
    raise ValueError('Outputs must be outside source folder')
output.mkdir(parents=True, exist_ok=True)
pakraw = source.read_bytes()
pak = unwrap(pakraw)
pabpath = source.with_name(source.name.replace('.pak.', '.pab.'))
pab = None
if pabpath.exists():
    pabraw = pabpath.read_bytes()
    try:
        pab = zlib.decompress(pabraw, -15)
    except zlib.error:
        pab = pabraw
rows = []
pos = 0
while pos + 32 <= len(pak):
    typ, offset, size, context, full, short, parent, flags = struct.unpack_from('>8I', pak, pos)
    if typ in (0xB524565F, 0x2CB3EF3B):
        break
    if flags & ~0x37:
        raise ValueError(f'Unsupported flags {flags:x} at {pos:x}')
    name = ''
    stride = 192 if flags & 32 else 32
    if stride == 192:
        name = pak[pos+32:pos+192].split(b'\0')[0].decode('utf-8', errors='replace')
    start = pos + offset
    data = pak
    companion = False
    if start + size > len(pak):
        data = pab
        start -= len(pak)
        companion = True
    if data is None or start < 0 or size <= 0 or start + size > len(data):
        raise ValueError(f'Invalid payload range at {pos:x}')
    row = dict(index=len(rows), type=f'{typ:08X}', fullHash=f'{full:08X}', shortHash=f'{short:08X}',
               name=name, size=size, offset=start, companion=companion)
    if typ in (0xDAD5E950, 0x8BFA5E8E):
        ext = 'img' if typ == 0xDAD5E950 else 'tex'
        dest = output / f'{len(rows):04d}_{full:08X}_{short:08X}.{ext}.xen'
        payload = data[start:start+size]
        dest.write_bytes(payload)
        row.update(extracted=str(dest), sha256=hashlib.sha256(payload).hexdigest())
    rows.append(row)
    pos += stride
else:
    raise ValueError('Missing PAK sentinel')
report = dict(source=str(source), sha256=hashlib.sha256(pakraw).hexdigest(), entries=rows)
(output/'pak-manifest.json').write_text(json.dumps(report, indent=2))
from collections import Counter
print(source.name, len(rows), dict(Counter(r['type'] for r in rows)))
