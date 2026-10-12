import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {tiledOffset2D,prepareTextureBase} from './texture-layout.mjs';
import {readFrameCapture} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const expected=execFileSync('artifacts/r5-menu/layout-reference/reference.exe',{maxBuffer:4*1024*1024,windowsHide:true}).toString().trim().split('\n').map(Number);
let pos=0;for(let l=0;l<=4;l++)for(const pitch of [32,64,96,320])for(let y=0;y<70;y++)for(let x=0;x<70;x++)assert.equal(tiledOffset2D(x,y,pitch,l),expected[pos++]);
assert.equal(pos,98000);
const t={format:6,dimension:1,depth:0,raw:[2,0],status:0,baseDependency:0,endian:0,tiled:0,width:1,height:1,pitch:32,baseBytes:512,packedMips:0,mipMax:0};
const raw=new Uint8Array(512);raw.set([1,2,3,4,5,6,7,8]);raw.set([9,10,11,12,13,14,15,16],256);
assert.deepEqual([...prepareTextureBase(t,raw).data],[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
assert.deepEqual([...prepareTextureBase({...t,endian:2},raw).data].slice(0,8),[4,3,2,1,8,7,6,5]);
assert.throws(()=>prepareTextureBase({...t,baseDependency:2},raw),/unresolved/);
assert.throws(()=>prepareTextureBase({...t,baseBytes:4},raw.subarray(0,4)),/missing guest bytes/);
const c=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()});
const seen=new Set(),results=[],pending=[];
for(const f of c.frames)for(const e of f.events.filter(e=>e.type==='draw'))for(const t of e.textures){
  const key=[t.baseBlob,t.format,t.width,t.height,t.pitch,t.endian,t.tiled,t.packedMips,t.baseDependency].join('/');if(seen.has(key))continue;seen.add(key);
  if(!t.baseBlob)continue;
  try{const p=prepareTextureBase(t,c.blobs.get(t.baseBlob).data);results.push({key,format:t.format,width:p.width,height:p.height,layers:p.layers,gpu:p.format,mipsPending:p.mipsPending});}
  catch(error){pending.push({key,format:t.format,draw:e.index,basePhys:t.basePhys,baseBytes:t.baseBytes,requiredBytes:error.requiredBytes??null,raw:[...t.raw],width:t.width+1,height:t.height+1,pitch:t.pitch,endian:t.endian,packedMips:t.packedMips,mipMin:t.mipMin,mipMax:t.mipMax,mipPhys:t.mipPhys,mipBytes:t.mipBytes,reason:error.message});}
}
const report={passed:true,nativeOffsetsCompared:pos,linearRows:true,endian:true,unknownRejected:true,boundsRejected:true,converted:results,pending};
fs.writeFileSync('artifacts/r5-menu/texture-layout-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,nativeOffsetsCompared:pos,converted:results.length,pending:pending.length,pendingReasons:[...new Set(pending.map(p=>p.reason))]}));
