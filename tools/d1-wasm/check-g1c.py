import json,re,hashlib,gzip,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2];base=root/'artifacts/d1-wasm';out=base/'g1c'
checks=[]
for platform,folder in [('node','d3'),('edge','d4')]:
 for gpu in ['none','null']:
  for xma in ['silent-consume','decode']:
   label=f'g1c-reg-{platform}-{gpu}-{xma}';stem=base/folder/label
   run=json.loads(stem.with_suffix('.json').read_text());log=stem.with_suffix('.log').read_text()
   vd=all(v in log for v in ['VdSetGraphicsInterruptCallback','VdInitializeRingBuffer','VdEnableRingBufferRPtrWriteBack'])
   rc=run.get('exitCode',run.get('exit'));ok=rc==0 and vd and not run.get('pageErrors') and not run.get('timedOut',False)
   shutil.copyfile(stem.with_suffix('.log'),out/(label+'.log'));shutil.copyfile(stem.with_suffix('.json'),out/(label+'.json'))
   checks.append(dict(label=label,exit=rc,vdAll=vd,passed=ok))
 for label in [f'g1c-control-{platform}-nop']:
  stem=base/folder/label;run=json.loads(stem.with_suffix('.json').read_text());log=stem.with_suffix('.log').read_text()
  trap=bool(re.search(r'\[g1-fault\] lr=827C593C ctr=00000000',log))
  shutil.copyfile(stem.with_suffix('.log'),out/(label+'.log'));shutil.copyfile(stem.with_suffix('.json'),out/(label+'.json'))
  checks.append(dict(label=label,exit=run.get('exitCode',run.get('exit')),oldNullTrap=trap,passed=trap))
label='g1c-control-node-consume';stem=base/'d3'/label;run=json.loads(stem.with_suffix('.json').read_text());log=stem.with_suffix('.log').read_text()
checks.append(dict(label=label,exit=run['exitCode'],oldStreamWait='streamall.fsb.xen' in log and 'atvi.bik.xen' not in log,zeroDecodedFrames='frames=0 pcmBytes=0' in log,passed=run['exitCode']==0 and 'atvi.bik.xen' not in log and 'frames=0 pcmBytes=0' in log))
for ext in ['.log','.json']:shutil.copyfile(stem.with_suffix(ext),out/(label+ext))
checks.append(dict(label='Node link',passed=(base/'d2/undefined.txt').read_text().strip()==''))
checks.append(dict(label='Edge link',passed=(base/'d4/undefined.txt').read_text().strip()==''))
(out/'regressions.json').write_text(json.dumps(checks,indent=2))
print(json.dumps(checks,indent=2));assert all(c['passed'] for c in checks)
