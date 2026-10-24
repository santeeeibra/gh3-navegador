import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const base='artifacts/d1-wasm/hw60/demo',out='artifacts/r5-native60/demo';
fs.mkdirSync(out,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex'),integrity={};
for(const ent of fs.readdirSync(base,{withFileTypes:true})){
 if(!ent.isFile())continue;
 const src=path.join(base,ent.name),dst=path.join(out,ent.name);integrity[ent.name]=digest(fs.readFileSync(src));
 if(ent.name.endsWith('.wasm')){if(!fs.existsSync(dst))fs.linkSync(src,dst);}else fs.copyFileSync(src,dst);
}
fs.mkdirSync(out+'/chunks',{recursive:true});for(const n of fs.readdirSync(base+'/chunks'))if(!fs.existsSync(out+'/chunks/'+n))fs.linkSync(base+'/chunks/'+n,out+'/chunks/'+n);
const original=JSON.parse(fs.readFileSync('artifacts/r5-scene-mobile/shaders-before-shadowless.json'));
const latest=JSON.parse(fs.readFileSync('artifacts/r5-scene-mobile/shaders.json'));
const shaders={...Object.fromEntries(Object.entries(latest).filter(([id,s])=>!s.shadowless)),...original};
// Seven original sources were translated only during the previous shadow
// investigation. Load their untouched WGSL rather than the shadowless variants.
const manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json'));
for(const [id,m] of Object.entries(manifest))if(!shaders[id]&&m.wgsl&&fs.existsSync(m.wgsl))shaders[id]={id,stage:m.stage,constants:m.constants,code:fs.readFileSync(m.wgsl,'utf8')};
// Preserve useful menu/Bink pairs in the current, independently copied bundle.
const bundle=fs.readFileSync(base+'/r5snap-song-colas.js','utf8'),marker='var define_SONG_SHADERS_default = ',at=bundle.indexOf(marker),end=bundle.indexOf(';\n',at);
const inherited=vm.runInNewContext('('+bundle.slice(at+marker.length,end)+')');
for(const [id,s] of Object.entries(inherited))if(!shaders[id]&&!s.shadowless)shaders[id]=s;
fs.writeFileSync('artifacts/r5-native60/shaders.json',JSON.stringify(shaders));
const flags={bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module']};
for(const scene of [false,true])await build({...flags,entryPoints:['tools/r5-native60/consumer.mjs'],outfile:out+`/r5snap-native60-${scene?'scene':'colas'}.js`,define:{'import.meta.url':'globalThis.location.href',__NATIVE_SHADERS__:JSON.stringify(shaders),__NATIVE_SCENE__:String(scene)}});
fs.copyFileSync(out+'/r5snap-native60-colas.js',out+'/r5snap-native60-render.js');
await build({...flags,entryPoints:['tools/r5-native60/gpu-worker.mjs'],outfile:out+'/r5snap-native60-gpu.js'});
fs.copyFileSync('tools/r5-native60/page.js',out+'/native60-page.js');
let html=fs.readFileSync(out+'/index.html','utf8');
html=html.replace('<head>','<head><script src="native60-page.js"></script>').replace('<script src="hw60.js"></script>','');
html=html.replace("r5liveconsumer:q.get('hw60')==='0'?'r5snap-song-render.js':'hw60-render.js'","r5liveconsumer:'r5snap-native60-render.js'");
html=html.replace("const hw=q.get('hw60')==='0'?'r5snap-song-':'hw60-'","const hw='r5snap-native60-'");
fs.writeFileSync(out+'/index.html',html);
const runtimePath=out+'/gh3-web.js';let runtime=fs.readFileSync(runtimePath,'utf8');
const anchor="Module['r5SongFrame']=(bitmap,info,latch)=>self.postMessage({type:'r5SongFrame',bitmap,info,latch},[bitmap]);";
if(runtime.split(anchor).length!==2)throw Error('Expected one frame route anchor');
runtime=runtime.replace(anchor,anchor+"\nModule['r5NativePort']=(port,latch)=>self.postMessage({type:'r5NativePort',port,latch},[port]);");fs.writeFileSync(runtimePath,runtime);
for(const [name,hash] of Object.entries(integrity))if(digest(fs.readFileSync(base+'/'+name))!==hash)throw Error('Base changed: '+name);
const shaderAudit=Object.fromEntries(Object.entries(shaders).map(([id,s])=>[id,{sha256:digest(s.code),stage:s.stage,shadowless:!!s.shadowless}]));
const bundles=Object.fromEntries(['native60-page.js','gh3-web.js','r5snap-native60-colas.js','r5snap-native60-scene.js','r5snap-native60-gpu.js'].map(name=>[name,digest(fs.readFileSync(out+'/'+name))]));
fs.writeFileSync('artifacts/r5-native60/build.json',JSON.stringify({base,out,integrity,shaderAudit,bundles,originalPreserved:Object.keys(original).every(id=>original[id].code===shaders[id].code)},null,2));
console.log(JSON.stringify({out,shaders:Object.keys(shaders).length,originalUnchanged:true,baseUnchanged:true}));
