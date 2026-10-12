import json,re,shutil,hashlib
from pathlib import Path
base=Path(__file__).resolve().parents[2]/'artifacts/d1-wasm';out=base/'g1d';checks=[]
for platform,folder in [('node','d3'),('edge','d4')]:
 for gpu in ['none','null']:
  for xma in ['silent-consume','decode']:
   label=f'g1d-reg-{platform}-{gpu}-{xma}';stem=base/folder/label
   if not stem.with_suffix('.json').exists():continue
   run=json.loads(stem.with_suffix('.json').read_text());text=stem.with_suffix('.log').read_text(errors='replace');exit=run.get('exitCode',run.get('exit'))
   vd=all(v in text for v in ['VdSetGraphicsInterruptCallback','VdInitializeRingBuffer','VdEnableRingBufferRPtrWriteBack']);passed=exit==0 and vd and not run.get('pageErrors') and not run.get('timedOut')
   checks.append(dict(label=label,exit=exit,vdAll=vd,passed=passed))
   for ext in ['.log','.json']:shutil.copyfile(stem.with_suffix(ext),out/(label+ext))
 label=f'g1d-control-{platform}-nop';stem=base/folder/label
 if stem.with_suffix('.json').exists():
  run=json.loads(stem.with_suffix('.json').read_text());text=stem.with_suffix('.log').read_text(errors='replace');trap='lr=827C593C ctr=00000000' in text;checks.append(dict(label=label,oldNullTrap=trap,passed=trap))
  for ext in ['.log','.json']:shutil.copyfile(stem.with_suffix(ext),out/(label+ext))
label='g1d-control-node-consume';stem=base/'d3'/label
if stem.with_suffix('.json').exists():
 run=json.loads(stem.with_suffix('.json').read_text());text=stem.with_suffix('.log').read_text();ok=run['exitCode']==0 and 'streamall.fsb.xen' in text and 'atvi.bik.xen' not in text and 'frames=0 pcmBytes=0' in text
 checks.append(dict(label=label,streamallWaitReproduced=ok,passed=ok))
 for ext in ['.log','.json']:shutil.copyfile(stem.with_suffix(ext),out/(label+ext))
(out/'regressions.json').write_text(json.dumps(checks,indent=2));print(json.dumps(checks,indent=2));assert len(checks)==11 and all(c['passed'] for c in checks)
