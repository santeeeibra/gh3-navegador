import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('real local input bridge keeps keydown timestamp through a short keyup and a repeated strum',()=>{
  const sab=new SharedArrayBuffer(16*1024*1024),ptr=2048,queue=4096,seg=512,dv=new DataView(sab);
  dv.setUint32(queue,0x53594e31,true);new Uint32Array(sab,seg,256)[0x82]=(-0x82000000)>>>0;
  dv.setFloat64(0xBD7C38,4.25,false);
  const listeners=new Map(),channels=[];let now=100;const micro=[];
  const ctx={console,Atomics,SharedArrayBuffer,Int32Array,Uint32Array,Float64Array,DataView,URLSearchParams,
    location:{search:'?padtype=guitar&syncpress=0'},performance:{timeOrigin:1700000000000,now:()=>now},
    navigator:{getGamepads:()=>[]},localStorage:{getItem:()=>null},setInterval:()=>0,setTimeout:()=>0,queueMicrotask:fn=>micro.push(fn),
    document:{getElementById:()=>null,activeElement:null},addEventListener:(type,fn,capture)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push({fn,capture});},
    BroadcastChannel:class{constructor(){this.listeners=[];channels.push(this);}addEventListener(_,fn){this.listeners.push(fn);}},
  };ctx.window=ctx;ctx.g1mem={sab,seg};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync('artifacts/sincronia-rea/pulsacion/demo/press-page.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('artifacts/sincronia-rea/pulsacion/demo/gh3-input.js','utf8'),ctx);
  ctx.gh3Input.songMode=()=>true;ctx.gh3Input.attach(sab,ptr);
  for(const c of channels)for(const fn of c.listeners)fn({data:{type:'syncPressMemory',ptr:queue}});
  const key=(type,code,timeStamp)=>{const e={code,timeStamp,target:{tagName:'BODY'},preventDefault(){}};
    for(const {fn} of [...(listeners.get(type)||[])].sort((a,b)=>Number(!!b.capture)-Number(!!a.capture)))fn(e);
    while(micro.length)micro.shift()();};
  key('keydown','Digit1',95);key('keydown','ArrowDown',97.125);
  now=105;key('keyup','ArrowDown',104);now=110;key('keydown','ArrowDown',108.5);
  assert.equal(dv.getUint32(queue+4,true),2);assert.equal(dv.getFloat64(queue+32,true),1700000000097.125);
  assert.equal(dv.getFloat64(queue+32+64,true),1700000000108.5);
  assert.equal(dv.getUint32(queue+32+32,true),0x1002);assert.equal(ctx.syncPress.events.length,2);
  assert.equal(ctx.syncPress.events[0].flags,1);assert.equal(ctx.syncPress.events[0].writtenAt,1700000000100);
  // C1 t_write changed on release, but the earlier event retained its time.
  assert.equal(new Float64Array(sab,ptr+32,1)[0],1700000000110);
  now=115;key('keyup','ArrowDown',114);key('keyup','Digit1',114);
  now=120;
  for(const {fn} of listeners.get('pointerdown'))fn({timeStamp:116.75});
  ctx.gh3Input.setTouch(2,2);while(micro.length)micro.shift()();
  now=122;ctx.gh3Input.setTouch(0,0);
  assert.equal(dv.getUint32(queue+4,true),3);
  assert.equal(dv.getFloat64(queue+32+128,true),1700000000116.75);
  assert.equal(dv.getUint32(queue+32+128+32,true),0x2002);
});
