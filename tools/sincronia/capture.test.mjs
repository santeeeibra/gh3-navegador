import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('capture uses guest big endian double timer, separate input margins, and live-input layout', () => {
  const sab=new SharedArrayBuffer(16*1024*1024),dv=new DataView(sab),seg=128,base=4096;
  dv.setUint32(seg+0x82*4,(-0x82000000+base)>>>0,true);
  const host=a=>(a-0x82000000+base)>>>0;
  dv.setFloat64(host(0x82BD7C38),12.5,false);
  for(const [a,v] of [[0x829B57B0,12850],[0x829B56C0,-200],[0x829A0438,.1],[0x829AD418,.25]]) dv.setFloat32(host(a),v,false);
  dv.setUint32(host(0x829B5748),7,false);
  const ptr=2048, live=new Int32Array(sab,ptr,11);live[0]=3;live[1]=0x1002;live[10]=2;dv.setFloat64(ptr+32,123456.5,true);
  let receive;
  const code=fs.readFileSync('tools/sincronia/tap-probe.mjs','utf8');
  const start=code.indexOf('let syncSeg ='),end=code.indexOf('const sameBytes =',start);
  assert.ok(start>=0 && end>start);
  const ctx=vm.createContext({chan:{addEventListener:(_,f)=>receive=f},performance:{timeOrigin:123000,now:()=>10},DataView,Int32Array,Atomics});
  vm.runInContext(code.slice(start,end)+';globalThis.capture=syncRead;',ctx);
  assert.equal(ctx.capture({}),null);
  receive({data:{type:'syncMemory',seg,livePtr:ptr}});
  const row=ctx.capture({readPhysical:()=>new Uint8Array(sab,0,4)});
  assert.equal(row.baseSec,12.5); assert.equal(row.legacyEdgeMs,12850); assert.equal(row.inputOffsetMs,-200);
  assert.equal(row.noteIndex,7);assert.equal(row.input.seq,3);assert.equal(row.input.buttons,0x1002);assert.equal(row.input.writtenAt,123456.5);
  assert.equal(row.baseSecAfter,row.baseSec);assert.equal(row.error,undefined);
});
