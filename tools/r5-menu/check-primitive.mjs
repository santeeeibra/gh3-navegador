import fs from 'node:fs';
import assert from 'node:assert/strict';
import {preparePrimitive} from './primitive.mjs';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const d={issued:true,unsupported:0,indexCount:4,indexSource:0,primitive:6};
assert.deepEqual([...preparePrimitive(d).indices],[0,1,2,2,1,3]);
assert.deepEqual([...preparePrimitive({...d,primitive:13}).indices],[0,1,2,0,2,3]);
assert.deepEqual([...preparePrimitive({...d,primitive:5}).indices],[0,1,2,0,2,3]);
assert.throws(()=>preparePrimitive({...d,primitive:8}),/unsupported type/);
const raw=new Uint8Array([0,4,0,5,0,6,0,7]),dma={...d,indexSource:1,indexFormat:0,indexEndian:1,indexBytes:8,indexPhys:100,registers:new Uint32Array(0x5003)};
assert.deepEqual([...preparePrimitive(dma,{phys:100,data:raw}).indices],[4,5,6,6,5,7]);
assert.deepEqual([...preparePrimitive({...dma,indexCount:3,indexEndian:2,indexBytes:6},{phys:100,data:raw.subarray(0,6)}).indices],[4,5,6]);
assert.throws(()=>preparePrimitive({...dma,indexCount:5},{phys:100,data:raw}),/endian-aligned/);
const restartRaw=new Uint8Array([0,0,1,0,2,0,255,255,3,0,4,0,5,0]),registers=dma.registers.slice();registers[0x2205]=1<<21;registers[0x2103]=0xffff;
assert.deepEqual([...preparePrimitive({...dma,indexCount:7,indexEndian:0,indexBytes:14,registers},{phys:100,data:restartRaw}).indices],[0,1,2,3,4,5]);
const c=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()}),accepted=[],pending=[];
for(const draw of replayEvents(c,3)){
  if(draw.type!=='draw')continue;
  try{const p=preparePrimitive(draw,c.blobs.get(draw.indexBlob));accepted.push({draw:draw.index,primitive:draw.primitive,source:draw.indexSource,indices:p.indices.length});}
  catch(error){pending.push({draw:draw.index,primitive:draw.primitive,source:draw.indexSource,format:draw.indexFormat,endian:draw.indexEndian,count:draw.indexCount,bytes:draw.indexBytes,reason:error.message});}
}
const report={passed:true,accepted,pending,limitations:'No post-VS rectangles, tessellation or rasterization certification yet; quad diagonal matches SDK CPU conversion, not GS path'};
fs.writeFileSync('artifacts/r5-menu/primitive-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,accepted:accepted.length,pending:pending.length,reasons:[...new Set(pending.map(p=>p.reason))]}));
