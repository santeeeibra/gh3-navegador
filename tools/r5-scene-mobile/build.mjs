import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const root='artifacts/r5-scene-mobile',base='artifacts/d1-wasm/memlazy/demo';
fs.mkdirSync(root,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const names=fs.readdirSync(base).filter(n=>fs.statSync(base+'/'+n).isFile());
const integrity=Object.fromEntries(names.map(n=>[n,{bytes:fs.statSync(base+'/'+n).size,sha256:sha(base+'/'+n)}]));
const backup='artifacts/respaldo/2026-10-12-scene-mobile-codex';fs.mkdirSync(backup,{recursive:true});
for(const n of names.filter(n=>n.endsWith('.js')||n==='index.html'))if(!fs.existsSync(backup+'/'+n))fs.copyFileSync(base+'/'+n,backup+'/'+n);
fs.writeFileSync(root+'/base-integrity.json',JSON.stringify({base,files:integrity},null,2));
for(const variant of ['baseline','demo']){
 const dest=root+'/'+variant;fs.mkdirSync(dest,{recursive:true});
 for(const n of names)fs.copyFileSync(base+'/'+n,dest+'/'+n);
 fs.mkdirSync(dest+'/chunks',{recursive:true});
 for(const n of fs.readdirSync(base+'/chunks'))if(!fs.existsSync(dest+'/chunks/'+n))fs.linkSync(base+'/chunks/'+n,dest+'/chunks/'+n);
 for(const n of ['r5snap-song-scene.js','r5snap-song-gpu.js']){
  let s=fs.readFileSync(dest+'/'+n,'utf8');
  s=s.replace('  // tools/',fs.readFileSync('tools/r5-scene-mobile/memory.js','utf8')+'\n  // tools/');
  s=s.replace('gpu: renderer?.stats','gpu: renderer?.stats, gpuMemory: globalThis.__sceneMemory');
  s=s.replace('const gpu = await renderer.render', 'const gpu = await renderer.render');
  if(n==='r5snap-song-gpu.js')s=s.replace('gpu,','gpu: {...gpu, gpuMemory:globalThis.__sceneMemory},');
  fs.writeFileSync(dest+'/'+n,s);
 }
 let scene=fs.readFileSync(dest+'/r5snap-song-scene.js','utf8');
 const tail=scene.lastIndexOf('})();');if(tail<0)throw Error('scene tail');
 fs.writeFileSync(dest+'/r5snap-scene-diagnostic.js',scene.slice(0,tail)+fs.readFileSync('tools/r5-scene-mobile/diagnostic.js','utf8')+scene.slice(tail));
}
const scene=fs.readFileSync(base+'/r5snap-song-scene.js','utf8');
const at=scene.indexOf('var define_SONG_SHADERS_default = '),end=scene.indexOf(';\n',at);
const shaders=vm.runInNewContext('('+scene.slice(at+'var define_SONG_SHADERS_default = '.length,end)+')',{}, {timeout:1000});
fs.writeFileSync(root+'/shaders.json',JSON.stringify(shaders));
console.log(JSON.stringify({base,files:names.length,shaders:Object.keys(shaders).length,variants:['baseline','demo']}));
