// Preserve Claude's delivered shaders/renderer/mobile fixes; add only the hook
// to independent consumer copies. No runtime/CP/wasm/defaults/deploy changes.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
const source=path.resolve(process.env.READY_SOURCE||'artifacts/d1-wasm/optim/b4/demo');
const root=path.resolve('artifacts/r5-live-ready'),out=root+'/demo';
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(source===out)throw Error('Source must be independent');
fs.mkdirSync(out+'/chunks',{recursive:true});
const before={};
for(const name of fs.readdirSync(source)){
 const p=source+'/'+name;if(!fs.statSync(p).isFile())continue;
 before[name]=sha(p);fs.copyFileSync(p,out+'/'+name);
}
for(const name of fs.readdirSync(source+'/chunks'))if(!fs.existsSync(out+'/chunks/'+name))fs.linkSync(source+'/chunks/'+name,out+'/chunks/'+name);
const helper=(await transform(fs.readFileSync('tools/r5-live-song/live-ready.mjs','utf8').replace('export function','function'),{target:'es2022'})).code;
const names=['r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js'];
for(const name of names){
 let text=fs.readFileSync(out+'/'+name,'utf8');
 const anchor='  globalThis.__r5liveConsumer =';
 if(text.split(anchor).length!==2||text.includes('__r5liveReady'))throw Error('Consumer anchor changed: '+name);
 const threaded=name!=='r5snap-song-scene.js';
 const getters=threaded?'initializing: () => initializing, busy: () => Atomics.load(busy, 0), pending: () => Atomics.load(presentationPending, 0)':'initializing: () => init, busy: () => busy, pending: () => Atomics.load(pending, 0)';
 text=text.replace(anchor,helper+(threaded?'\n  const presentationPending = new Int32Array(presentation);':'')+`\n  globalThis.__r5liveReady = createLiveReady({ready: () => state.ready, fatal: () => state.fatal, ${getters}});\n`+anchor);
 fs.writeFileSync(out+'/'+name,text);
}
for(const [name,hash] of Object.entries(before))if(sha(source+'/'+name)!==hash)throw Error('Source changed: '+name);
const changed=Object.keys(before).filter(name=>sha(out+'/'+name)!==before[name]);
if(changed.length!==names.length||changed.some(n=>!names.includes(n)))throw Error('Unexpected changed files');
const report={source,out,changed,before,after:Object.fromEntries(Object.keys(before).map(n=>[n,sha(out+'/'+n)]))};
fs.writeFileSync(root+'/build.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({out,changed,wasmUnchanged:report.before['gh3-web.wasm']===report.after['gh3-web.wasm']}));
