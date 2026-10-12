import json,re,math
from pathlib import Path
base=Path('artifacts/d1-wasm');text=(base/'d3/g1d-node-long.log').read_text()
frames=[json.loads(m.group(1)) for m in re.finditer(r'^\[g1d-frame\] (\{.*\})',text,re.M)]
threads=[json.loads(m.group(1)) for m in re.finditer(r'^\[g1d-thread\] (\{.*\})',text,re.M)]
for a,b in [(3,12),(20,60),(140,220)]:
 f=[r for r in frames if a<=r['t']<b];print(a,b,'swaps/s',len(f)/(b-a),'renderer CPU ms/frame',sum(r['callerCpuMs'] for r in f)/len(f))
 for id in [6,11,13,14,15,24,25,28,29]:
  rows=[r for r in threads if r['id']==id and a<=r['t']<b and r['cpuMs']>=0]
  if len(rows)>1:
   s,e=rows[0],rows[-1];dt=e['cpuAt']-s['cpuAt'];print(id,'entry',hex(e['entry']),'CPU core%',round((e['cpuMs']-s['cpuMs'])/dt/10,1) if dt>0 else 0)
