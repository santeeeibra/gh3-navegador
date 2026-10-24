import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const base='artifacts/d1-wasm/hw60/demo', out='artifacts/hw60-codex/demo';
fs.mkdirSync(out,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const integrity={};
for(const ent of fs.readdirSync(base,{withFileTypes:true})){
 if(!ent.isFile())continue;
 const from=path.join(base,ent.name),to=path.join(out,ent.name);
 integrity[ent.name]=sha(from);
 if(ent.name.endsWith('.wasm')){if(!fs.existsSync(to))fs.linkSync(from,to);}
 else fs.copyFileSync(from,to);
}
fs.mkdirSync(out+'/chunks',{recursive:true});
for(const n of fs.readdirSync(base+'/chunks'))if(!fs.existsSync(out+'/chunks/'+n))fs.linkSync(base+'/chunks/'+n,out+'/chunks/'+n);
fs.copyFileSync('tools/hw60/codex/hw60.js',out+'/hw60.js');
await build({entryPoints:['tools/hw60/codex/tap.mjs'],bundle:true,format:'iife',outfile:out+'/hw60-tap.js'});
const hooks=[];
for(const n of ['r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js']){
 const p=out+'/'+n;let text=fs.readFileSync(p,'utf8');
 const matches=[...text.matchAll(/const input = prepareLiveSongDraw\((d|next.value), resources, shaders\);/g)];
 if(matches.length!==1)throw Error('Expected exactly one R5 preparation hook in '+n);
 const d=matches[0][1];
 text=text.replace(matches[0][0],`if (globalThis.__hw60DrawFilter && !globalThis.__hw60DrawFilter(${d})) { skips['HW60 owns draw'] = (skips['HW60 owns draw'] || 0) + 1; continue; }\n          ${matches[0][0]}`);
 fs.writeFileSync(p,text);hooks.push(n);
}
for(const [n,hash] of Object.entries(integrity))if(sha(base+'/'+n)!==hash)throw Error('Base changed: '+n);
fs.writeFileSync('artifacts/hw60-codex/build.json',JSON.stringify({base,out,hooks,baseIntegrity:integrity},null,2));
console.log(JSON.stringify({out,hooks,baseUnchanged:true}));
