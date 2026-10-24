import importlib.util,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,root/file);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
normal=load('r4normal','tools/r4-shaders/normalize-spirv.py')
repack=load('r4repack','tools/r4-shaders/repack-spirv.py')
out=root/'artifacts/r5-live-song/shaders'
naga=root/'toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe'
manifest=json.loads((out/'manifest.json').read_text())
for id,m in manifest.items():
 name=f"shader_{id}.ucode.bin.{m['stage']}.spv"
 data,info=normal.normalize((out/'spv'/name).read_bytes());data,mapping=repack.repack(data)
 spv=out/'repacked'/name;spv.write_bytes(data);wgsl=out/'wgsl'/(name+'.wgsl')
 log=[]
 for args in ([str(spv)],[str(spv),str(wgsl)],[str(wgsl)]):
  p=subprocess.run([str(naga),*args],capture_output=True,text=True,timeout=60)
  log.append(p.stdout+'\n'+p.stderr)
  if p.returncode:raise RuntimeError(f'Naga failed {id}: {p.stderr}')
 (out/'logs'/(id+'.naga.txt')).write_text('\n'.join(log))
 m['systemLayout']=mapping
 m['wgsl']='artifacts/r5-live-song/shaders/wgsl/'+wgsl.name
(out/'manifest.json').write_text(json.dumps(manifest,indent=2))
print(json.dumps(dict(converted=len(manifest))))
