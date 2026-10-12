import json,re
from pathlib import Path
out=Path('artifacts/d1-wasm/g1d');native=out/'native-natural'
files=sorted(native.glob('native.*.log'),key=lambda p:int(p.name.split('.')[1]),reverse=True)+[native/'native.log']
logs='\n'.join(p.read_text(errors='replace') for p in files)
(native/'native-complete.log').write_text(logs)
opens=[]
first=re.search(r'^\[(.*?)\]',logs).group(1)
from datetime import datetime
t0=datetime.fromisoformat(first)
for m in re.finditer(r'^\[(.*?)\].*\[NtCreateFile\] path=(.*?) access=',logs,re.M):
 opens.append({'t':(datetime.fromisoformat(m[1])-t0).total_seconds(),'path':m[2]})
result={'runSeconds':185.0012331,'input':'none; first run in native/ discarded because user pressed Enter','terminalScreen':'PRESS ANY BUTTON TO ROCK...','menuVerified':False,'screenEvidence':'native-natural/desktop-observation.png','screenObstructed':False,'screenObservationSeconds':(datetime.fromtimestamp((native/'desktop-observation.png').stat().st_mtime)-t0).total_seconds(),'openedFiles':opens,'movieFiles':[o for o in opens if '.bik' in o['path'].lower()],'menuSpecificFileOrScript':None,'limitation':'No independent main-menu signature obtained: natural sequence stops at title prompt; shared resources and music are not sufficient to prove main menu.'}
(out/'native-signature.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k!='openedFiles'},indent=2));print('Opened files:',len(opens))
