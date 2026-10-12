import json,math
from pathlib import Path
out=Path('artifacts/d1-wasm/g1d');checks=[]
for platform in ['node','edge']:
 r=json.loads((out/f'g1d-{platform}-final.json').read_text());f=r['frames'];run=r['run'];errors=[]
 for field in ['main','caller']:
  for i,row in enumerate(f):
   difference=abs(row[field+'OutsideWaitMs']+row[field+'WaitMs']-row['intervalMs'])
   if difference>0.002:errors.append({'frame':i,'field':field,'conservationErrorMs':difference})
 checks.append({'platform':platform,'frames':len(f),'stableRenderCallerAfterStartup':all(row['caller']==11 for row in f[2:]),'initialCallerIds':list(dict.fromkeys(row['caller'] for row in f)), 'transitionCallerSamplesExcluded':not f[0]['callerSampleValid'] and not f[1]['callerSampleValid'],'elapsedDecompositionsConserved':not errors,'decompositionErrors':errors[:10],'mainSpinObserved':sum(row.get('mainGuestSpinMs',0) for row in f)>0,'renderSpinObserved':sum(row.get('callerGuestSpinMs',0) for row in f)>0,'exit0':run.get('exitCode',run.get('exit'))==0,'noPageErrors':not run.get('pageErrors'),'menuVerified':r['menuVerified']})
 assert all(checks[-1][k] for k in ['stableRenderCallerAfterStartup','transitionCallerSamplesExcluded','elapsedDecompositionsConserved','mainSpinObserved','renderSpinObserved','exit0','noPageErrors'])
(out/'metric-validation.json').write_text(json.dumps(checks,indent=2));print(json.dumps(checks,indent=2))
