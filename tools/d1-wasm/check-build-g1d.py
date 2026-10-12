import json,hashlib
from pathlib import Path
root=Path('D:/guitar hero');base=root/'artifacts/d1-wasm';out=base/'g1d';sdk=root/'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090';rt=base/'rtsrc'
files=['core/threading_posix.cpp','system/xthread.cpp','graphics/command_processor.cpp','kernel/xboxkrnl/xboxkrnl_video.cpp','audio/audio_system.cpp','audio/xma_context.cpp','audio/xma_decoder.cpp']
checks=[]
for rel in files:
 original=sdk/'src'/rel;backup=rt/'src.orig'/rel
 a=hashlib.sha256(original.read_bytes()).hexdigest();b=hashlib.sha256(backup.read_bytes()).hexdigest() if backup.exists() else None
 checks.append({'source':rel,'sdkSha256':a,'backupSha256':b,'byteIdentical':a==b,'normalizedTextIdentical':original.read_text()==backup.read_text() if backup.exists() else False})
results=hashlib.sha256((base/'rt-obj/results.tsv').read_bytes()).hexdigest();expected=(out/'results-before.sha256').read_text()
r={'runtimeResultsTsvPreserved':results==expected,'runtimeResultsSha256':results,'sourceBackups':checks,'nodeUndefinedSymbols':(base/'d2/undefined.txt').read_text().strip(),'edgeUndefinedSymbols':(base/'d4/undefined.txt').read_text().strip(),'generatedSourceEdits':False,'sdkEdits':False}
(out/'build-verification.json').write_text(json.dumps(r,indent=2));print(json.dumps(r,indent=2));assert r['runtimeResultsTsvPreserved'] and all(c['normalizedTextIdentical'] for c in checks) and not r['nodeUndefinedSymbols'] and not r['edgeUndefinedSymbols']
