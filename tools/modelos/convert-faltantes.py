"""Copia de tools/r5-live-song/convert-slowride.py (Claude 2026-10-22, modelos): convierte los 8 shaders faltantes de la banda."""
import importlib.util, json, subprocess, hashlib, re
from pathlib import Path
root=Path(__file__).resolve().parents[2]
out=root/'artifacts/d1-wasm/modelos/shaders'
for d in ['spv','repacked','wgsl','logs']: (out/d).mkdir(parents=True,exist_ok=True)
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,root/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
normal=load('normal','tools/r4-shaders/normalize-spirv.py')
repack=load('repack','tools/r4-shaders/repack-spirv.py')
tool=root/'artifacts/r4-shaders/build/xenos-to-spirv.exe'
naga=root/'toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe'
freq={s['hash']:s['drawsInSong'] for s in json.loads((root/'artifacts/manifest/manifest-slowride-completo.json').read_text())['shaders']['list']}
sources=sorted((root/'artifacts/d1-wasm/modelos/ucode').glob('shader_*.ucode.bin.*'),key=lambda p:-freq.get(p.name.split('_')[1].split('.')[0],0))
manifest={};errors=[]
def run(id,step,args,cwd=None):
    p=subprocess.run([str(a) for a in args],cwd=cwd,capture_output=True,text=True,timeout=60)
    (out/'logs'/f'{id}.{step}.stdout.txt').write_text(p.stdout)
    (out/'logs'/f'{id}.{step}.stderr.txt').write_text(p.stderr)
    if p.returncode: raise RuntimeError(f'{step}: exit {p.returncode}, see logs')
    return p
for source in sources:
    id=source.name.split('_')[1].split('.')[0];stage=source.suffix[1:]
    try:
        spv=out/'spv'/(source.name+'.spv')
        p=run(id,'xenos',[tool,source,spv,'--single-memory'],tool.parent)
        if 'memexport=0' not in p.stdout: raise RuntimeError('memexport unsupported')
        constants=[int(v) for v in re.search(r'^constants=(.*)$',p.stdout,re.M)[1].split(',') if v]
        data,_=normal.normalize(spv.read_bytes());data,mapping=repack.repack(data)
        spv=out/'repacked'/spv.name;spv.write_bytes(data)
        wgsl=out/'wgsl'/(spv.name+'.wgsl')
        run(id,'spv-validation',[naga,spv]);run(id,'conversion',[naga,spv,wgsl]);run(id,'wgsl-validation',[naga,wgsl])
        manifest[id]=dict(id=id,stage=stage,constants=constants,source=str(source.relative_to(root)).replace('\\','/'),sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),wgsl=str(wgsl.relative_to(root)).replace('\\','/'),systemLayout=mapping,drawsInSong=freq.get(id,0))
    except Exception as e: errors.append(dict(id=id,stage=stage,error=str(e)))
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2))
    (out/'conversion.json').write_text(json.dumps(dict(total=len(sources),converted=len(manifest),errors=errors),indent=2))
print(json.dumps(dict(total=len(sources),converted=len(manifest),errors=errors)))
