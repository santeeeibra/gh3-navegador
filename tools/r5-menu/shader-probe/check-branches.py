"""Bounded block-termination sanity check, not a substitute for spirv-val."""
import struct, json
from pathlib import Path
folder=Path(__file__).resolve().parents[3] / 'artifacts/r5-menu/shader-probe'
results=[]
for file in sorted((folder/'repacked').glob('*.spv')):
    raw=file.read_bytes()
    words=struct.unpack('<'+'I'*(len(raw)//4),raw)
    pos=5; block=None; terminated=False; blocks=0; errors=[]; branches=[]
    while pos<len(words):
        size=words[pos]>>16; op=words[pos]&65535
        if size==0 or pos+size>len(words): raise ValueError('Invalid instruction extent')
        if op==248:
            if block is not None and not terminated: errors.append(f'Unterminated block {block}')
            block=words[pos+1];terminated=False;blocks+=1
        elif op==56:
            if block is not None and not terminated: errors.append(f'Unterminated final block {block}')
            block=None
        elif block is not None:
            if terminated: errors.append(f'Instruction {op} after terminator in {block}')
            if op in (249,250,251,252,253,254,255): terminated=True
        pos+=size
    results.append(dict(file=file.name,blocks=blocks,errors=errors))
(folder/'branch-check.json').write_text(json.dumps(dict(scope='Block termination only; no dominance/type/structured-CFG certification',results=results),indent=2)+'\n')
print(json.dumps(dict(total=len(results),bad=sum(bool(r['errors']) for r in results))))
if not results or any(r['errors'] for r in results): raise SystemExit(1)
