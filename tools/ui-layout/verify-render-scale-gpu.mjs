// Final bundle verification with a synthetic triangle: WebGPU worker/port/UI,
// no GH3 executable, assets, game clock or game startup retry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';
const root=path.resolve('artifacts/resolucion-interna/demo');
const server=http.createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<html><head><meta charset="utf-8"><script src="/gh3-render-scale.js"></script></head><body><aside id="gh3Panel"><section data-tab="gfx"></section></aside></body></html>');}
  const name=req.url.slice(1);if(!['gh3-render-scale.js','r5snap-native60-gpu.js'].includes(name))return res.writeHead(404).end();
  res.setHeader('Content-Type','application/javascript; charset=utf-8');fs.createReadStream(path.join(root,name)).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(async()=>{
    const worker=new Worker('/r5snap-native60-gpu.js'),channel=new MessageChannel(),presentation=new SharedArrayBuffer(128),ctl=new Int32Array(presentation),transport=new SharedArrayBuffer(4),errors=[],samples=[];
    Atomics.store(ctl,24,1);Atomics.store(ctl,26,1);
    worker.dispatchEvent(new MessageEvent('message',{data:{type:'r5NativePort',port:channel.port2}}));
    let frameCount=0,ready=false;
    channel.port2.addEventListener('message',({data})=>{if(data.type==='frame'){frameCount++;data.bitmap.close();Atomics.store(ctl,0,0);}});
    worker.onmessage=({data})=>{if(data.type==='error')errors.push(data.error);if(data.type==='ready')ready=true;};
    const shaders={v:{constants:[],code:'@vertex fn main(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2(-.8,-.8),vec2(.8,-.8),vec2(0.,.8));return vec4(p[i],0.,1.);}'},p:{constants:[],code:'@fragment fn main()->@location(0) vec4<f32>{return vec4(1.,.2,.3,1.);}'}};
    worker.postMessage({type:'init',shaders,presentation,transport,port:channel.port1,sceneMotion:false},[channel.port1]);
    const nap=ms=>new Promise(r=>setTimeout(r,ms)),start=performance.now();
    async function until(fn){while(!fn()){if(errors.length)throw Error(errors[0]);if(performance.now()-start>15000)throw Error('GPU test timeout');await nap(20);}}
    let timer;
    try{
      await until(()=>ready);
      const input={manifest:{vs:'v',ps:'p',blend:1|(1<<16),raster:0,depth:0,stencil:0,writeMask:15,scissor:[0,0,1280,720],indices:3,essential:true},assets:{'indices.bin':new Uint8Array(new Uint32Array([0,1,2]).buffer),'memory.bin':new Uint8Array(256)},textures:[]};
      let seq=0;const send=()=>worker.postMessage({type:'snapshot',inputs:[input],info:{seq:++seq},at:performance.timeOrigin+performance.now()});send();timer=setInterval(send,100);
      for(const scale of [.75,.5,1]){gh3RenderScale.set(scale);await until(()=>gh3RenderScale.applied===scale);samples.push({requested:scale,applied:gh3RenderScale.applied,status:document.querySelector('#gh3RenderScaleStatus').textContent});}
      Atomics.store(ctl,4,2);await until(()=>gh3RenderScale.applied===.5);
      const protectedStatus=document.querySelector('#gh3RenderScaleStatus').textContent;
      Atomics.store(ctl,4,0);await until(()=>gh3RenderScale.applied===1);
      return {samples,protectedStatus,frameCount,errors,synthetic:true,gameStarted:false};
    }finally{clearInterval(timer);worker.terminate();channel.port2.close();}
  });
  assert.ok(result.frameCount>0);assert.match(result.protectedStatus,/protección automática/);assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);
  fs.writeFileSync('artifacts/resolucion-interna/gpu-final-verification.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
