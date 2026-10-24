import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const hash=await createHash(), root='artifacts/r5-runtime-claude/r5f-fixture/';
// Fixtures now follow the contract BE shader hash; test originals directly.
const source=fs.readFileSync(root+'r5f-min-valido.r5f');
const valid=new Uint8Array(source), c=readFrameCapture(valid,{hash});
assert.equal(c.frames.length,2);assert(c.frames.every(f=>f.declaredExact));
const events=[...replayEvents(c,0)], again=[...replayEvents(c,0)];
assert.equal(events[0].registers[0x2100],0);assert.equal(events[1].registers[0x2100],0x55);
assert.equal([...replayEvents(c,1)][0].registers[0x2100],0x55);
events[1].registers[0x2100]=99;assert.equal(again[1].registers[0x2100],0x55);
valid.fill(0);assert.equal(c.bytes[0],0x52); // caller mutation cannot corrupt capture
let invalid=0;
for(const name of fs.readdirSync(root).filter(n=>n.endsWith('.r5f')&&!n.includes('valido'))){
  const data=fs.readFileSync(root+name);
  assert.throws(()=>readFrameCapture(data,{hash}),undefined,name);invalid++;
}
// Valid outer hash cannot hide a record whose advertised body crosses its bounds.
const short=new Uint8Array(source);new DataView(short.buffer).setUint32(64+4,16,true);
assert.throws(()=>readFrameCapture(short,{hash}),/short begin/);
const real=[];
for(const p of ['artifacts/d1-wasm/r5frame/runs/r5frame-s8908.r5f','artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f']){
  const r=readFrameCapture(fs.readFileSync(p),{hash});
  assert.equal(r.frames.length,4);assert(r.frames.every(f=>!f.declaredExact));
  const j=JSON.parse(fs.readFileSync(p.replace('.r5f','.json')));
  assert.equal(r.shaders.size,j.shaders);assert.equal(r.blobs.size,j.blobs);
  r.frames.forEach((f,i)=>{assert.equal(f.events.filter(e=>e.type==='draw').length,j.frames[i].draws);assert.equal(f.events.filter(e=>e.type==='copy').length,j.frames[i].copies);});
  real.push({file:p,shaders:r.shaders.size,blobs:r.blobs.size,draws:r.frames.map(f=>f.endCounters[1]),copies:r.frames.map(f=>f.endCounters[4])});
}
const report={passed:true,invalidFixturesRejected:invalid,ownership:true,registerIsolation:true,shortRecordRejected:true,fixtures:'originals accepted/rejected directly; BE shader hash now corrected',real};
fs.writeFileSync('artifacts/r5-menu/reader-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
