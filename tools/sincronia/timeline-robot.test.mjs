import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('native robot ignores loading timer and does not follow moving window edges',()=>{
  const sab=new SharedArrayBuffer(16*1024*1024),seg=128,base=4096,dv=new DataView(sab);
  dv.setUint32(seg+0x82*4,(-0x82000000+base)>>>0,true);
  const host=a=>(a-0x82000000+base)>>>0;
  dv.setFloat64(host(0x82BD7C38),12.5,false);
  dv.setFloat32(host(0x829B56C0),50,false);dv.setFloat32(host(0x829A0438),.116,false);
  const src=fs.readFileSync('tools/sincronia/robot-timeline.mjs','utf8'),start=src.indexOf('      const clock = () =>'),end=src.indexOf('      const nap =',start);
  const ctx=vm.createContext({M:{sab,seg},Uint32Array,DataView,Math});
  vm.runInContext(src.slice(start,end)+';globalThis.read=clock;',ctx);
  assert.ok(Number.isNaN(ctx.read()));
  dv.setFloat32(host(0x829B57B0),12766,false);
  const a=ctx.read();assert.ok(Math.abs(a-12434)<.001);
  dv.setFloat32(host(0x829B57B0),12666,false);
  assert.equal(ctx.read(),a);
});
