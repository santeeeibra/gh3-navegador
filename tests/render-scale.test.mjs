import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validRenderScale,cappedRenderScale} from '../tools/r5-native60/render-scale-policy.mjs';

test('resolution selection caps GPU policy and never raises protective resolution',()=>{
  for(const auto of [1,.75,.5])for(const selected of [1,.75,.5])assert.equal(cappedRenderScale(auto,selected),Math.min(auto,selected));
  for(const bad of [0,2,NaN,'0.5',undefined,null])assert.equal(validRenderScale(bad),false);
  assert.equal(cappedRenderScale(.75,2),.75);
});

test('UI remembers choice, sends it to the real port and distinguishes requested from applied',()=>{
  const listeners={},storage=new Map([['gh3-render-scale','0.75']]),sent=[],portListeners=[];
  class Worker{addEventListener(name,fn){listeners[name]=fn;}}
  const ctx={window:null,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{search:'?r5liveconsumer=r5snap-native60-colas.js'},URLSearchParams,document:{documentElement:{},querySelector:()=>null},MutationObserver:class{observe(){}disconnect(){}},Worker};ctx.window=ctx;
  vm.runInNewContext(fs.readFileSync('tools/ui-layout/render-scale.js','utf8'),ctx);
  assert.equal(ctx.gh3RenderScale.requested,.75);
  new ctx.Worker();
  const port={addEventListener:(name,fn)=>portListeners.push(fn),start(){},postMessage:m=>sent.push(m)};
  listeners.message({data:{type:'r5NativePort',port}});
  assert.equal(sent[0].scale,.75);assert.equal(ctx.gh3RenderScale.connected,true);
  portListeners[0]({data:{type:'render-scale-status',requested:.75,applied:.5,width:640,height:360}});
  assert.equal(ctx.gh3RenderScale.applied,.5);
  assert.equal(ctx.gh3RenderScale.set(.5),true);assert.equal(storage.get('gh3-render-scale'),'0.5');
  assert.equal(ctx.gh3RenderScale.applied,null,'a new choice waits for confirmation');
  assert.equal(ctx.gh3RenderScale.set(10),false);assert.equal(sent.at(-1).scale,.5);
  // Ignore stale confirmations from an older selection.
  portListeners[0]({data:{type:'render-scale-status',requested:.75,applied:1,width:1280,height:720}});
  assert.equal(ctx.gh3RenderScale.applied,null);
});
