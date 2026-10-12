"""Canonicalize unordered struct declarations without moving memory fields.

Restricted to XeSystemConstants and constant-index uniform AccessChains.
Fails closed on unsupported uses; preserves member offsets and original input.
"""
import json
from pathlib import Path
import struct
import sys

ROOT = Path(__file__).resolve().parents[2]

def normalize(data):
    if len(data) % 4 or len(data) < 20:
        raise ValueError('Truncated SPIR-V')
    words = list(struct.unpack('<' + 'I' * (len(data) // 4), data))
    if words[0] != 0x07230203:
        raise ValueError('Not SPIR-V')
    instructions = []
    i = 5
    while i < len(words):
        count = words[i] >> 16
        if not count or i + count > len(words):
            raise ValueError('Invalid instruction length')
        instructions.append(words[i:i + count])
        i += count
    types, names, offsets, constants, value_types = {}, {}, {}, {}, {}
    for ins in instructions:
        op = ins[0] & 65535
        if op == 5:
            names[ins[1]] = struct.pack('<' + 'I' * (len(ins) - 2), *ins[2:]).split(b'\0')[0].decode()
        if 19 <= op <= 33:
            types[ins[1]] = (op, ins[2:])
        if op == 72 and ins[3] == 35:
            offsets[(ins[1], ins[2])] = ins[4]
        if op == 43 and len(ins) == 4:
            constants[ins[2]] = (ins[1], ins[3])
        if op in (59, 61, 65, 66, 67, 70, 55):
            value_types[ins[2]] = ins[1]
    changed = {}
    for tid, (op, members) in types.items():
        if op != 30 or names.get(tid) != 'XeSystemConstants':
            continue
        order = sorted(range(len(members)), key=lambda n: offsets[(tid, n)])
        if order != list(range(len(members))):
            changed[tid] = {'order': order, 'mapping': {old: new for new, old in enumerate(order)}}
    if not changed:
        return data, {'structs': 0, 'accesses': 0}
    new_constants, accesses = [], 0
    def remap_constant(cid, index):
        nonlocal words
        ctype = constants[cid][0]
        for existing, pair in constants.items():
            if pair == (ctype, index):
                return existing
        fresh = words[3]
        words[3] += 1
        constants[fresh] = (ctype, index)
        new_constants.append([(4 << 16) | 43, ctype, fresh, index])
        return fresh
    def walk(tid, indexes, literal=False):
        nonlocal accesses
        output = []
        for index in indexes:
            op, args = types[tid]
            if op == 30:
                old = index if literal else constants.get(index, (None, None))[1]
                if old is None or old >= len(args):
                    raise ValueError('Nonconstant or invalid struct access')
                if tid in changed:
                    new = changed[tid]['mapping'][old]
                    index = new if literal else remap_constant(index, new)
                    accesses += 1
                tid = args[old]
            elif op in (23, 24, 28, 29):
                tid = args[0]
            else:
                raise ValueError(f'Unsupported indexed type {op}')
            output.append(index)
        return output
    output, constants_inserted = [], False
    # Collect rewritten instructions first so new constants precede functions.
    for original in instructions:
        ins = original.copy()
        op = ins[0] & 65535
        if op == 30 and ins[1] in changed:
            ins[2:] = [original[2 + old] for old in changed[ins[1]]['order']]
        elif op in (6, 72) and ins[1] in changed:
            ins[2] = changed[ins[1]]['mapping'][ins[2]]
        elif op in (65, 66):
            ptype = value_types.get(ins[3])
            if ptype is None or types[ptype][0] != 32:
                raise ValueError('Unknown access chain base')
            ins[4:] = walk(types[ptype][1][1], ins[4:])
        elif op in (67, 70):
            raise ValueError('PtrAccessChain not supported')
        elif op == 81:  # CompositeExtract, literal member indexes
            if ins[3] not in value_types:
                # Scalar/vector extracts don't reference the changed uniform struct.
                pass
            else:
                ins[4:] = walk(value_types[ins[3]], ins[4:], literal=True)
        elif op in (44, 80) and ins[1] in changed:
            raise ValueError('Constructed constants/structs not supported')
        output.append(ins)
    flattened = words[:5]
    for ins in output:
        if (ins[0] & 65535) == 54 and not constants_inserted:
            for const in new_constants:
                flattened.extend(const)
            constants_inserted = True
        flattened.extend(ins)
    return struct.pack('<' + 'I' * len(flattened), *flattened), {'structs': len(changed), 'accesses': accesses}

if __name__ == '__main__':
    single = '--single-memory' in sys.argv
    out = ROOT / 'artifacts/r4-shaders' / ('spirv-single-normalized' if single else 'spirv-normalized')
    out.mkdir(exist_ok=True)
    results = []
    for source in sorted((ROOT / 'artifacts/r4-shaders' / ('spirv-single' if single else 'spirv')).glob('*.spv')):
        try:
            data, info = normalize(source.read_bytes())
            (out / source.name).write_bytes(data)
            results.append({'input': source.name, 'ok': True, **info})
        except Exception as exc:
            results.append({'input': source.name, 'ok': False, 'error': str(exc)})
    (ROOT / 'artifacts/r4-shaders' / ('normalization-single.json' if single else 'normalization.json')).write_text(json.dumps(results, indent=2) + '\n')
    print(json.dumps({'total': len(results), 'normalized': sum(r['ok'] for r in results)}))
    if not results or not all(r['ok'] for r in results):
        raise SystemExit(1)
