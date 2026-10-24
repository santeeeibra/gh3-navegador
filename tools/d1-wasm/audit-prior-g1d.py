import json,re,hashlib
from pathlib import Path
root=Path('D:/guitar hero');base=root/'artifacts/d1-wasm';out=base/'g1d'
audit=[]
for stage in ['g1','g1b','g1c']:
 for platform in ['node','edge']:
  for i in [1,2,3]:
   label=f'{stage}-{platform}-final{i}';log=base/stage/(label+'.log');text=log.read_text(errors='replace')
   rows=[json.loads(m.group(1)) for m in re.finditer(r'^\[g1\] (\{.*\})',text,re.M)]
   audit.append({'label':label,'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'samples':len(rows),'lastSample':rows[-1] if rows else None,'vdAll':all(v in text for v in ['VdSetGraphicsInterruptCallback','VdInitializeRingBuffer','VdEnableRingBufferRPtrWriteBack']),'oldNullTrap':'lr=827C593C ctr=00000000' in text,'bikFiles':re.findall(r'\[g1-file\] path=(.*?\.bik\.xen) status=',text)})
(out/'prior-evidence-audit.json').write_text(json.dumps(audit,indent=2));print('18 logs previos revisados: G1 trap, G1b espera streamall, G1c peliculas')
