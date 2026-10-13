// CPU only: same actual R5 frame, same draw inputs and texture revisions.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import * as reference from '../r5-scene-mobile/src/prepare.mjs';
import * as candidate from './snapshot-prepare.mjs';
const cap='artifacts/r5-scene-mobile/runs/fixed2-pc-capture/capture-1';
const meta=JSON.parse(fs.readFileSync(cap+'/capture.json'));
const ranges=meta.resources.map(r=>({...r,data:new Uint8Array(fs.readFileSync(cap+`/${r.phys}-${r.length}.bin`))}));
const read=(p,n)=>{const r=ranges.find(r=>r.phys<=p&&p+n<=r.phys+r.length);if(!r)throw Error('Missing resource '+p);return r.data.subarray(p-r.phys,p-r.phys+n);};
const shaders=JSON.parse(fs.readFileSync('artifacts/r5-native60/shaders.json'));
const bytes=new Uint8Array(fs.readFileSync(cap+'/frame.r5f')),hash=await createHash();
const project=(module,resources)=>{
 resources.begin();const inputs=[],errors=[];
 for(const d of readLiveDraws(bytes,{hash,verifyShaders:new Set()})){
  try{inputs.push(module.prepareLiveSongDraw(d,resources,shaders));}
  catch(e){errors.push([d.index,e.message]);}
 }
 return {inputs,errors};
};
const refResources=reference.createResourceReader(read),newResources=candidate.createResourceReader(read);
const ref=project(reference,refResources),got=project(candidate,newResources);
assert.deepEqual(got.errors,ref.errors);assert.equal(got.inputs.length,ref.inputs.length);
let sharedGeometry=0,sharedIndices=0;const geometry=new Set(),indices=new Set();
for(let i=0;i<ref.inputs.length;i++){
 const a=ref.inputs[i],b=got.inputs[i];assert.deepEqual(b.manifest,a.manifest);
 assert.deepEqual(b.assets,a.assets);assert.deepEqual(b.textures,a.textures);
 const m=b.assets['memory.bin'].buffer,j=b.assets['indices.bin'].buffer;
 if(geometry.has(m))sharedGeometry++;if(indices.has(j))sharedIndices++;geometry.add(m);indices.add(j);
}
// Memoized data must be discarded at begin(); a changed next frame is read anew.
const first=got.inputs[0].assets['memory.bin'];
const next=project(candidate,newResources);assert.notEqual(next.inputs[0].assets['memory.bin'],first);
const times={reference:[],candidate:[]};
for(let n=0;n<12;n++)for(const [name,module,resources] of [['reference',reference,refResources],['candidate',candidate,newResources]]){
 const t=performance.now();project(module,resources);times[name].push(performance.now()-t);
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const report={ok:true,capture:cap,accepted:ref.inputs.length,rejected:ref.errors.length,allAssetsAndTexturesEqual:true,frameMemoReset:true,sharedGeometry,sharedIndices,medianMs:{reference:median(times.reference),candidate:median(times.candidate)},times};
fs.mkdirSync('artifacts/r5-native60/check',{recursive:true});fs.writeFileSync('artifacts/r5-native60/check/prepare.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
