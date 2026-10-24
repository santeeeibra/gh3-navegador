"""Repack canonical XeSystemConstants into uniform-compatible offsets.
Original files are preserved. Emits an explicit map required by GPU uploads.
"""
import json, struct, hashlib
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def repack(data):
    if len(data)<20 or len(data)%4 or struct.unpack_from('<I',data)[0]!=0x07230203:
        raise ValueError('Invalid SPIR-V header')
    words = list(struct.unpack('<'+'I'*(len(data)//4), data))
    instructions, pos = [], 5
    while pos < len(words):
        count = words[pos] >> 16
        if not count or pos+count > len(words):
            raise ValueError('Malformed SPIR-V')
        instructions.append(words[pos:pos+count])
        pos += count
    types, names, member_names, offsets, constants, strides = {}, {}, {}, {}, {}, {}
    def decode(w): return struct.pack('<'+'I'*len(w), *w).split(b'\0')[0].decode()
    for s in instructions:
        op = s[0] & 65535
        if op == 5: names[s[1]] = decode(s[2:])
        elif op == 6: member_names[(s[1],s[2])] = decode(s[3:])
        elif 19 <= op <= 33: types[s[1]] = (op,s[2:])
        elif op == 43 and len(s)==4: constants[s[2]] = s[3]
        elif op == 71 and s[2]==6: strides[s[1]] = s[3]
        elif op == 72 and s[3]==35: offsets[(s[1],s[2])] = s[4]
    def layout(t):
        op,a = types[t]
        if op in (21,22):
            if a[0]!=32: raise ValueError('Only 32-bit scalars supported')
            return dict(align=4,size=4,wgsl='f32' if op==22 else 'i32' if a[1] else 'u32',kind='scalar')
        if op==23:
            b=layout(a[0]); n=a[1]
            if b['kind']!='scalar' or n not in (2,3,4): raise ValueError('Unsupported vector')
            return dict(align=8 if n==2 else 16,size=n*4,wgsl=f'vec{n}<{b["wgsl"]}>',kind='vector',base=b,count=n)
        if op==28:
            b=layout(a[0]); n=constants[a[1]]; stride=strides[t]; align=max(16,b['align'])
            if stride<b['size'] or stride%align: raise ValueError('Array stride needs separate repacking')
            return dict(align=align,size=stride*n,wgsl=f'array<{b["wgsl"]}, {n}>',kind='array',base=b,count=n,stride=stride)
        raise ValueError(f'Unsupported uniform type {op}')
    ids=[tid for tid,name in names.items() if name=='XeSystemConstants']
    if len(ids)!=1 or types[ids[0]][0]!=30: raise ValueError('Expected one constants struct')
    tid=ids[0]; members=[]; end=0; source_end=0
    for i,t in enumerate(types[tid][1]):
        info=layout(t); old=offsets[(tid,i)]
        if old<source_end: raise ValueError('Input overlaps or is unordered')
        new=(end+info['align']-1)//info['align']*info['align']
        members.append(dict(name=member_names[(tid,i)],index=i,sourceOffset=old,gpuOffset=new,**info))
        source_end=old+info['size']; end=new+info['size']
    for s in instructions:
        if (s[0]&65535)==72 and s[1]==tid and s[3]==35: s[4]=members[s[2]]['gpuOffset']
    out=words[:5]+[w for s in instructions for w in s]
    return struct.pack('<'+'I'*len(out),*out),dict(struct='XeSystemConstants',sourceBytes=source_end,gpuBytes=(end+15)//16*16,members=members)

if __name__=='__main__':
    out=ROOT/'artifacts/r4-shaders/spirv-repacked'; out.mkdir(exist_ok=True)
    maps={}; results=[]
    for source in sorted((ROOT/'artifacts/r4-shaders/spirv-single-normalized').glob('*.spv')):
        try:
            raw=source.read_bytes()
            binary,mapping=repack(raw)
            (out/source.name).write_bytes(binary); maps[source.name]=mapping
            results.append(dict(input=source.name,ok=True,inputSha256=hashlib.sha256(raw).hexdigest(),outputSha256=hashlib.sha256(binary).hexdigest()))
        except Exception as e: results.append(dict(input=source.name,ok=False,error=str(e)))
    (ROOT/'artifacts/r4-shaders/uniform-layouts.json').write_text(json.dumps(maps,indent=2)+'\n')
    (ROOT/'artifacts/r4-shaders/repacking.json').write_text(json.dumps(results,indent=2)+'\n')
    print(json.dumps(dict(total=len(results),repacked=sum(r['ok'] for r in results))))
    if not results or not all(r['ok'] for r in results): raise SystemExit(1)
