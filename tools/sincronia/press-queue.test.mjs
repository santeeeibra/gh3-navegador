import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPressWriter,eventEpoch,QUEUE} from './press-queue.mjs';
function fixture(){const sab=new SharedArrayBuffer(16*1024*1024),dv=new DataView(sab),ptr=4096,seg=512;
  new Uint32Array(sab,seg,256)[0x82]=(-0x82000000)>>>0;
  dv.setFloat64(0xBD7C38,12.125,false);const h=new Int32Array(sab,ptr,8);h[0]=QUEUE.magic;
  return {sab,dv,ptr,h,write:createPressWriter(sab,ptr,seg)};}
test('quick release and later fret changes cannot overwrite the original strum time/state',()=>{
  const {write,h,dv,ptr}=fixture();const a={eventAt:1000.125,writtenAt:1007,buttons:0x1002,source:1};
  assert.equal(write(a),1);assert.equal(write({...a,eventAt:1030,buttons:0x2002}),2);
  // The later event is independent, even when both pulses precede a read.
  assert.equal(Atomics.load(h,1),2);assert.equal(dv.getFloat64(ptr+32,true),1000.125);
  assert.equal(dv.getUint32(ptr+32+32,true),0x1002);assert.equal(dv.getFloat64(ptr+32+64,true),1030);
  assert.equal(dv.getFloat64(ptr+32+16,true),12.125);
});
test('bounded queue reports overflow and never overwrites an unread event; consumed slots can be reused',()=>{
  const {write,h,dv,ptr}=fixture();for(let i=0;i<64;i++)assert.equal(write({eventAt:i,writtenAt:i,buttons:2}),i+1);
  assert.equal(write({eventAt:99,writtenAt:99,buttons:2}),null);assert.equal(h[3],1);
  assert.equal(dv.getFloat64(ptr+32,true),0);Atomics.store(h,2,1);
  assert.equal(write({eventAt:65,writtenAt:65,buttons:2}),65);assert.equal(dv.getFloat64(ptr+32,true),65);
});
test('queue sequence wraps at uint32 without treating a full queue as empty',()=>{
  const {write,h}=fixture();h[1]=-2;h[2]=-2;
  write({eventAt:1,writtenAt:1,buttons:2});write({eventAt:2,writtenAt:2,buttons:2});
  assert.equal(h[1],0);for(let i=0;i<62;i++)write({eventAt:3,writtenAt:3,buttons:2});
  assert.equal(write({eventAt:4,writtenAt:4,buttons:2}),null);
});
test('DOM timestamps preserve delayed event delivery; unknown timestamps are explicitly observations',()=>{
  const origin=1700000000000;assert.deepEqual(eventEpoch(10.25,origin,90),{at:origin+10.25,flags:1});
  assert.deepEqual(eventEpoch(origin+10.25,origin,90),{at:origin+10.25,flags:1});
  assert.deepEqual(eventEpoch(0,origin,90),{at:origin+90,flags:2});
  assert.deepEqual(eventEpoch(500,origin,90),{at:origin+90,flags:2});
});
test('unknown ABI cannot silently write into an old C1 allocation',()=>{
  assert.throws(()=>createPressWriter(new SharedArrayBuffer(4096),0,256),/ABI/);
});
