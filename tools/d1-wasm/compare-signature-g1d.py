import json,re
from pathlib import Path
base=Path('artifacts/d1-wasm');out=base/'g1d'
native=json.loads((out/'native-signature.json').read_text())
def norm(p):return p.replace('\\','/').lower().rstrip('/')
n=[norm(o['path']) for o in native['openedFiles']]
results=[]
for platform in ['node','edge']:
 w=json.loads((out/f'g1d-{platform}-final.json').read_text());seq=[norm(o['path']) for o in w['openedFiles']]
 results.append(dict(platform=platform,all29FileOpensSameOrder=seq==n,nativeSequenceLength=len(n),wasmSequenceLength=len(seq),newFilesAfterIntro=[o for o in w['openedFiles'] if o['afterReportSeconds']>w['lastBinkWorkerExitSeconds']],menuVerified=False,titleVerified=False,reason='Natural native run reaches title prompt, not Carrera. Identical resource opens are not an independent active-screen signature.'))
(out/'signature-comparison.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
