import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
const out=path.resolve('artifacts/all-songs'),demo=path.join(out,'demo');
execFileSync(process.execPath,['tools/local-loader/build.mjs','--reuse-data'],{env:{...process.env,GH3_LOADER_OUT:out},stdio:'pipe'});
// Rebuild our copy from the current own renderer source, including star notes.
// Claude's live quality/tails copies and their shader filters are never edited.
const manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const valid=new Set(edge.results.filter(r=>r.moduleValid).map(r=>r.name.split('_')[1].split('.')[0])),shaders={};
for(const [id,s] of Object.entries(manifest))if(valid.has(id))shaders[id]={id,stage:s.stage,constants:s.constants,code:fs.readFileSync(s.wgsl,'utf8')};
if(!shaders['19815E13AC0DCC92'])throw Error('Falta shader de notas estrella.');
const options={bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_SHADERS__:JSON.stringify(shaders)}};
await build({...options,entryPoints:['tools/r5-live-song/thread-consumer.mjs'],outfile:demo+'/r5snap-song-render.js'});
await build({...options,entryPoints:['tools/r5-live-song/live-consumer.mjs'],outfile:demo+'/r5snap-song-scene.js',define:{...options.define,__SONG_MODE__:'"scene"'}});
await build({...options,entryPoints:['tools/r5-live-song/gpu-worker.mjs'],outfile:demo+'/r5snap-song-gpu.js'});
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const assets=JSON.parse(fs.readFileSync(out+'/assets.json'));
for(const name of Object.keys(assets.static))assets.static[name]={hash:hash(path.join(demo,name))};
fs.writeFileSync(out+'/assets.json',JSON.stringify(assets));
fs.writeFileSync(out+'/renderer-build.json',JSON.stringify({shaders:Object.keys(shaders).length,starNotes:true,otherSongsGameplay:'pending',static:assets.static},null,2));
console.log(JSON.stringify({out,shaders:Object.keys(shaders).length,starNotes:true,localOnly:true}));
