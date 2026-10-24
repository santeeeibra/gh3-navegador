// Replay a real captured frame: original reader vs safe fallback vs compiled full-range hash.
// Hash experiment keeps fixture bytes resident in the standalone XXH3 wasm; it is NOT game timing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash as cryptoHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import createXxh3 from '../d1-wasm/r5f-xxh3.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import * as candidate from './snapshot-prepare.mjs';
const out='artifacts/recursos-sin-copia',cap='artifacts/r5-scene-mobile/runs/fixed2-pc-capture/capture-1';
await build({stdin:{contents:fs.readFileSync('artifacts/respaldo/2026-10-16-recursos-sin-copia/snapshot-prepare.mjs','utf8'),resolveDir:path.resolve('tools/r5-native60')},bundle:true,format:'esm',platform:'node',outfile:out+'/reader-before.mjs'});
const before=await import(pathToFileURL(path.resolve(out,'reader-before.mjs')));
const ranges=JSON.parse(fs.readFileSync(cap+'/capture.json')).resources.map(r=>({...r,data:new Uint8Array(fs.readFileSync(cap+`/${r.phys}-${r.length}.bin`))}));
const read=(p,n)=>{const r=ranges.find(r=>r.phys<=p&&p+n<=r.phys+r.length);if(!r)throw Error('Missing resource '+p+':'+n);return r.data.subarray(p-r.phys,p-r.phys+n);};
const wasm=await createXxh3(),pointers=new Map();
const resourceHash=(p,n)=>{const key=p+':'+n;let ptr=pointers.get(key);if(ptr===undefined){ptr=wasm._malloc(Math.max(1,n));assert.ok(ptr);wasm.HEAPU8.set(read(p,n),ptr);pointers.set(key,ptr);}return BigInt.asUintN(64,wasm._r5f_xxh3(ptr,n)).toString(16).padStart(16,'0');};
const shaders=JSON.parse(fs.readFileSync('artifacts/r5-native60/shaders.json'));
const bytes=new Uint8Array(fs.readFileSync(cap+'/frame.r5f')),hash=await createHash();
const project=(module,reader)=>{reader.begin();const inputs=[],errors=[];for(const d of readLiveDraws(bytes,{hash,verifyShaders:new Set()})){try{inputs.push(module.prepareLiveSongDraw(d,reader,shaders));}catch(e){errors.push([d.index,e.message]);}}return {inputs,errors};};
const variants={before:{module:before,reader:before.createResourceReader(read)},fallback:{module:candidate,reader:candidate.createResourceReader(read)},compiledHash:{module:candidate,reader:candidate.createResourceReader(read,{resourceHash})}};
// The hash is internal cache metadata; all rendering inputs and resource bytes must match exactly.
const clean=result=>JSON.parse(JSON.stringify({...result,inputs:result.inputs.map(i=>({...i,textures:i.textures.map(t=>{const {hash:ignored,last:frame,...texture}=t.texture;return {...t,texture};})}))},(k,v)=>ArrayBuffer.isView(v)?{bytes:v.byteLength,sha256:cryptoHash('sha256').update(v).digest('hex')}:v));
const reference=project(before,variants.before.reader);
for(const v of Object.values(variants))assert.deepEqual(clean(project(v.module,v.reader)),clean(reference));
const times=Object.fromEntries(Object.keys(variants).map(k=>[k,[]])),initial={};
for(const [name,v] of Object.entries(variants))initial[name]={...v.reader.stats};
for(let i=0;i<15;i++)for(const [name,v] of Object.entries(variants)){const t=performance.now();project(v.module,v.reader);times[name].push(performance.now()-t);}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)],result={scope:'CPU replay of one immutable real frame; standalone compiled hash, not the running game',capture:cap,accepted:reference.inputs.length,rejected:reference.errors.length,renderInputsIdentical:true,medianMs:{},deltas:{},times};
for(const [name,v] of Object.entries(variants)){result.medianMs[name]=median(times[name]);result.deltas[name]=Object.fromEntries(Object.keys(v.reader.stats).map(k=>[k,v.reader.stats[k]-(initial[name][k]||0)]));}
assert.equal(result.deltas.compiledHash.comparedBytes,0);
assert.ok(result.deltas.compiledHash.hashReusedBytes>0);
assert.ok(result.deltas.fallback.copiedBytes<result.deltas.before.readBytes);
fs.writeFileSync(out+'/capture-check.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,times:undefined}));
for(const ptr of pointers.values())wasm._free(ptr);
