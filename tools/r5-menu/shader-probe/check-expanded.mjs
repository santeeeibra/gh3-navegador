import fs from 'node:fs';
import assert from 'node:assert/strict';
import {prepareExpandedPrimitive} from '../expanded-primitive.mjs';
import {readFrameCapture,replayEvents} from '../frame-reader.mjs';
import {createHash} from '../hash.mjs';
const d={issued:1,primitive:8,indexSource:0,indexCount:3};
// Fixed sequence from SDK built-in two-triangle strip buffer, including restart.
assert.deepEqual([...prepareExpandedPrimitive({...d,indexCount:6}).indices],[0,1,2,3,0xffffffff,4,5,6,7]);
assert.deepEqual([...prepareExpandedPrimitive({...d,indexCount:2}).indices],[]);
assert.deepEqual([...prepareExpandedPrimitive({...d,primitive:1,indexCount:1}).indices],[0,1,2,3]);
assert.throws(()=>prepareExpandedPrimitive({...d,indexSource:1}),/DMA/);
assert.throws(()=>prepareExpandedPrimitive({...d,indexCount:-1}),/count/);
assert.throws(()=>prepareExpandedPrimitive({...d,indexCount:3.5}),/count/);
assert.throws(()=>prepareExpandedPrimitive({...d,indexCount:1000001}),/count/);
const c=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()});
const results=[];
for(const draw of replayEvents(c,3))if(draw.type==='draw'&&[1,8].includes(draw.primitive)){
  const p=prepareExpandedPrimitive(draw);results.push({draw:draw.index,profile:p.profile,guestCount:draw.indexCount,hostIndexCount:p.indices.length});
}
assert.equal(results.filter(r=>r.profile==='rectangle').length,15);
assert.equal(results.filter(r=>r.profile==='point').length,48);
fs.writeFileSync('artifacts/r5-menu/shader-probe/expanded-indices.json',JSON.stringify({passed:true,results,scope:'CPU indices only; no GPU or pixel equivalence claim'},null,2)+'\n');
console.log(JSON.stringify({passed:true,rectangles:15,points:48}));
