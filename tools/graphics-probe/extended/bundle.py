import pathlib,json,zipfile,hashlib
root=pathlib.Path(__file__).resolve().parents[3]
out=root/'artifacts/graphics-probe/extended'
for name in ['triangle','texture','shader']:
 d=out/name
 manifest={'formatVersion':2,'gameId':'app:local.graphics-probe.'+name,'name':'Independent DX9 '+name,'entrypoint':'rom/probe.exe','rom':'rom','registry':'registry.json','emulator':{'osVersion':'winxp','screenResolution':{'width':640,'height':480,'bpp':32},'memory':{'ram':128*1024*1024}}}
 with zipfile.ZipFile(d/'probe.wgb','w',compression=zipfile.ZIP_STORED) as z:
  z.writestr('manifest.json',json.dumps(manifest,indent=2));z.writestr('registry.json',json.dumps({'root':'HKLM','path':'Software','values':[]}));z.write(d/'probe.exe','rom/probe.exe')
 (d/'bundle.json').write_text(json.dumps({'manifest':manifest,'exeSha256':hashlib.sha256((d/'probe.exe').read_bytes()).hexdigest(),'bundleSha256':hashlib.sha256((d/'probe.wgb').read_bytes()).hexdigest()},indent=2))
 print(name,(d/'probe.wgb').stat().st_size)
