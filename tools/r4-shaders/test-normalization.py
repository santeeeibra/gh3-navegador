"""Independent static check of member identity/offset for every uniform access.

Checks the actual shader corpus, not rendered equivalence. Never executes shaders.
"""
from pathlib import Path
import struct
import json

ROOT = Path(__file__).resolve().parents[2]

def signature(data):
    w = struct.unpack('<' + 'I' * (len(data) // 4), data)
    i, instructions = 5, []
    while i < len(w):
        n = w[i] >> 16
        if not n or i + n > len(w):
            raise ValueError('Bad instruction')
        instructions.append(w[i:i+n])
        i += n
    types, constants, pointers, names, offsets = {}, {}, {}, {}, {}
    for s in instructions:
        op = s[0] & 65535
        if 19 <= op <= 33:
            types[s[1]] = (op, s[2:])
        if op == 43 and len(s) == 4:
            constants[s[2]] = s[3]
        if op in (59, 65, 66):
            pointers[s[2]] = s[1]
        if op == 6:
            names[(s[1], s[2])] = struct.pack('<'+'I'*(len(s)-3), *s[3:]).split(b'\0')[0].decode()
        if op == 72 and s[3] == 35:
            offsets[(s[1], s[2])] = s[4]
    signatures = {}
    for s in instructions:
        if (s[0] & 65535) not in (65, 66):
            continue
        tid = types[pointers[s[3]]][1][1]
        path = []
        for cid in s[4:]:
            op, args = types[tid]
            if op == 30:
                index = constants[cid]
                path.append(('member', names.get((tid, index)), offsets.get((tid, index)), args[index]))
                tid = args[index]
            elif op in (23, 24, 28, 29):
                path.append(('index', constants.get(cid, ('dynamic', cid))))
                tid = args[0]
            else:
                raise ValueError(f'Unexpected access type {op}')
        signatures[s[2]] = (s[1], s[3], path)
    # All named members preserve both type and byte offset.
    member_layout = {(name, offsets.get(key)): types[key[0]][1][key[1]] for key, name in names.items()}
    return signatures, member_layout

results = []
for folder in ['spirv', 'spirv-single']:
    for source in sorted((ROOT / 'artifacts/r4-shaders' / folder).glob('*.spv')):
        dest = source.parent.with_name(folder + '-normalized') / source.name
        original = signature(source.read_bytes())
        converted = signature(dest.read_bytes())
        if original != converted:
            raise AssertionError(f'Member address/reference changed: {source}')
        results.append({'input': str(source.relative_to(ROOT)), 'accessChains': len(original[0]), 'ok': True})
if not results:
    raise AssertionError('Empty corpus')
report = {'purpose': 'Static member identity/type/byte-offset and access-chain reference preservation; not numerical/rendered equivalence',
          'total': len(results), 'accessChains': sum(r['accessChains'] for r in results), 'results': results}
(ROOT / 'artifacts/r4-shaders/normalization-verification.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'shaders': report['total'], 'accessChains': report['accessChains'], 'ok': True}))
