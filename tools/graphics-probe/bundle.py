"""Create a store-only BottleShip bundle containing only our original probe."""
import json, pathlib, zipfile, hashlib
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'artifacts/graphics-probe'
manifest={'formatVersion':2,'gameId':'app:local.independent.dx9-probe','name':'Independent DirectX 9 Probe','entrypoint':'rom/dx9-probe.exe','rom':'rom','registry':'registry.json','emulator':{'osVersion':'winxp','screenResolution':{'width':640,'height':480,'bpp':32},'memory':{'ram':128*1024*1024}}}
registry={'root':'HKLM','path':'Software','values':[]}
for name,data in [('manifest.json',manifest),('registry.json',registry)]:
 (out/'bundle-files'/name).write_text(json.dumps(data,indent=2),encoding='utf8')
exe=(out/'dx9-probe.exe').read_bytes()
assert exe[:2]==b'MZ'
pe=int.from_bytes(exe[60:64],'little')
assert exe[pe:pe+4]==b'PE\x00\x00' and int.from_bytes(exe[pe+4:pe+6],'little')==0x14c
with zipfile.ZipFile(out/'dx9-probe.wgb','w',compression=zipfile.ZIP_STORED) as z:
 z.writestr('manifest.json',json.dumps(manifest,indent=2))
 z.writestr('registry.json',json.dumps(registry,indent=2))
 z.writestr('rom/dx9-probe.exe',exe)
evidence={'machine':'PE I386 (0x014c)','exeBytes':len(exe),'exeSha256':hashlib.sha256(exe).hexdigest(),'bundleSha256':hashlib.sha256((out/'dx9-probe.wgb').read_bytes()).hexdigest(),'entries':[]}
with zipfile.ZipFile(out/'dx9-probe.wgb') as z:
 for x in z.infolist():
  assert x.compress_type==zipfile.ZIP_STORED
  evidence['entries'].append({'name':x.filename,'bytes':x.file_size})
(out/'bundle-evidence.json').write_text(json.dumps(evidence,indent=2),encoding='utf8')
print(json.dumps(evidence,indent=2))
