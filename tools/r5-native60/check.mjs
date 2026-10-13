// Same real snapshot, native WGSL, exact pixels at dt=0 and after restoration.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {png} from '../gpu-capture/lib.mjs';
const out='artifacts/r5-native60/check';fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='native60-check-'+Date.now();
assert.ok(fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'),'Turno ocupado');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex native60\nReserva: ${token}\nQué: shaders originales, replay sin juego\n`);
let browser,server;const report={errors:[]};
try{
 server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  const u=new URL(req.url,'http://x').pathname;if(u==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><canvas width="1280" height="720"></canvas>');}
  const f=path.resolve('.'+u);if(!f.startsWith(path.resolve('tools')+path.sep)&&!f.startsWith(path.resolve('artifacts/r5-native60')+path.sep))return res.writeHead(403).end();
  res.setHeader('Content-Type',/\.(mjs|js)$/.test(f)?'text/javascript':'application/octet-stream');fs.createReadStream(f).on('error',()=>res.destroy()).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');
 console.log('snapshot-check');
 const result=await page.evaluate(async()=>{
  const f=await(await fetch('/artifacts/r5-native60/fixture/fixture.json')).json(),shaders=await(await fetch('/artifacts/r5-native60/shaders.json')).json(),cache=new Map();
  const load=(p,h)=>{if(!cache.has(h))cache.set(h,fetch('/artifacts/r5-native60/fixture/'+p).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)));return cache.get(h);};
  const inputs=[];
  for(let k=0;k<f.ops.length;k+=8)await Promise.all(f.ops.slice(k,k+8).map(async o=>{
   const assets=Object.fromEntries(await Promise.all(Object.entries(o.assets).map(async([n,a])=>[n,await load(a.file,a.sha256)])));
   const textures=await Promise.all(o.textures.map(async t=>({...t,texture:{...t.texture,data:await load(t.texture.file,t.texture.sha256)}})));
   inputs[o.manifest.draw]={manifest:o.manifest,assets,textures};
  }));
  const compact=inputs.filter(Boolean),adapter=await navigator.gpu.requestAdapter(),bc=adapter.features.has('texture-compression-bc');
  const device=await adapter.requestDevice({requiredFeatures:bc?['texture-compression-bc']:[]}),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const {sceneTexture}=await import('/tools/r5-scene-mobile/src/texture-policy.mjs'),{createTemporalFrame}=await import('/tools/r5-native60/temporal.mjs');
  const {createLiveSongRenderer:base}=await import('/tools/r5-scene-mobile/src/renderer.mjs'),{createLiveSongRenderer:candidate}=await import('/tools/r5-native60/renderer.mjs');
  const targets=[],create=device.createTexture.bind(device);device.createTexture=d=>{const t=create(d);if(d.format==='rgba8unorm'&&(d.usage&GPUTextureUsage.RENDER_ATTACHMENT)&&(d.usage&GPUTextureUsage.COPY_SRC))targets.push(t);return t;};
  const context=document.querySelector('canvas').getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  const prepareTexture=t=>sceneTexture(t,bc),reference=await base(device,shaders,{prepareTexture}),native=await candidate(device,shaders,{prepareTexture});
  const read=async target=>{
   const b=device.createBuffer({size:1280*720*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyTextureToBuffer({texture:target},{buffer:b,bytesPerRow:1280*4},[1280,720]);device.queue.submit([e.finish()]);await b.mapAsync(GPUMapMode.READ);const bytes=new Uint8Array(b.getMappedRange()).slice();b.unmap();b.destroy();return bytes;
  };
  const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const a=await reference.render(compact,context),ra=await read(targets[0]);
  const temporal=createTemporalFrame(compact,shaders),immutable=await hash(new Uint8Array(compact.flatMap(i=>Array.from(i.assets['memory.bin']))));
  const b=await native.render(temporal.inputs,context),rb=await read(targets[1]);
  const advanced=await native.render(temporal.inputs,context,{reuse:true,dirty:temporal.animate(1/60)}),rc=await read(targets[1]);
  const restored=await native.render(temporal.inputs,context,{reuse:true,dirty:temporal.animate(0)}),rd=await read(targets[1]);
  // Simulate large movie/menu vertex allocations occupying slots later used
  // by small song draws. Extra unused bytes must not change pixels, and the
  // following small frame must release the inflated buffer layout.
  const inflated=temporal.inputs.map(i=>({...i,assets:{...i.assets}}));
  for(const index of [0,Math.floor(inflated.length/2)]){const original=inflated[index].assets['memory.bin'],large=new Uint8Array(10*1024*1024);large.set(original);inflated[index].assets['memory.bin']=large;}
  await native.render(inflated,context);const peakBufferBytes=native.stats.bufferBytes;
  await native.render(temporal.inputs,context);const smallBufferBytes=native.stats.bufferBytes,afterCompaction=await read(targets[1]);
  const start=performance.now();let count=0;
  while(performance.now()-start<3000){await native.render(temporal.inputs,context,{reuse:true,dirty:temporal.animate((count%6)/60)});count++;}
  const elapsed=performance.now()-start;
  const immutableAfter=await hash(new Uint8Array(compact.flatMap(i=>Array.from(i.assets['memory.bin']))));
  window.nativeTest={inputs:compact,shaders};
  return {hashes:{reference:await hash(ra),candidate:await hash(rb),advanced:await hash(rc),restored:await hash(rd),compacted:await hash(afterCompaction)},compaction:{peakBufferBytes,smallBufferBytes},sourceUnchanged:immutable===immutableAfter,draws:{reference:a.accepted,candidate:b.accepted,advanced:advanced.accepted,restored:restored.accepted},rejected:b.rejected,plans:temporal.planCount,speed:temporal.speed,tableRows:temporal.table?.y.length,benchmark:{fps:count*1000/elapsed,frames:count,elapsedMs:elapsed},stats:{...native.stats},errors,rgba:{reference:Array.from(ra),candidate:Array.from(rb),advanced:Array.from(rc)}};
 });
 for(const [n,bytes] of Object.entries(result.rgba))fs.writeFileSync(out+'/'+n+'.png',png(new Uint8Array(bytes),1280,720));delete result.rgba;
 report.result=result;
 assert.equal(result.hashes.candidate,result.hashes.reference,'Zero-delta pixels differ');assert.equal(result.hashes.restored,result.hashes.reference,'Restoration pixels differ');
 assert.notEqual(result.hashes.advanced,result.hashes.reference,'No movement observed');assert.ok(result.sourceUnchanged);assert.equal(result.errors.length,0);assert.equal(report.errors.length,0);assert.ok(result.plans>0);
 assert.equal(result.hashes.compacted,result.hashes.reference);assert.ok(result.compaction.smallBufferBytes<result.compaction.peakBufferBytes/2);
 console.log('direct-port-check');
 report.direct=await page.evaluate(async()=>{
  const worker=new Worker('/artifacts/r5-native60/demo/r5snap-native60-gpu.js'),ch=new MessageChannel(),presentation=new SharedArrayBuffer(8),transport=new SharedArrayBuffer(4),latch=new Int32Array(presentation),times=[],errors=[],stats=[];
  const cv=document.createElement('canvas');cv.width=1280;cv.height=720;document.body.appendChild(cv);
  ch.port2.onmessage=({data:m})=>{try{cv.getContext('bitmaprenderer').transferFromImageBitmap(m.bitmap);times.push(performance.now());Atomics.add(latch,1,1);}catch(e){errors.push(e.message);}finally{Atomics.store(latch,0,0);}};
  const ready=new Promise((resolve,reject)=>{worker.onmessage=({data:m})=>{if(m.type==='ready')resolve();if(m.type==='error'){errors.push(m.error);reject(Error(m.error));}if(m.type==='stats')stats.push(m);};worker.onerror=e=>{errors.push(e.message);reject(Error(e.message));};});
  worker.postMessage({type:'init',shaders:nativeTest.shaders,presentation,transport,port:ch.port1,sceneMotion:false},[ch.port1]);await Promise.race([ready,new Promise((_,reject)=>setTimeout(()=>reject(Error('GPU worker ready timeout')),15000))]);
  const sent=new Map();let seq=0;
  const send=()=>{
   if(Atomics.compareExchange(new Int32Array(transport),0,0,1)!==0)return;
   const buffers=new Set(),inputs=nativeTest.inputs.map(i=>({...i,assets:Object.fromEntries(Object.entries(i.assets).map(([n,b])=>{const c=b.slice();buffers.add(c.buffer);return [n,c];})),textures:i.textures.map(t=>{const {data,...s}=t.texture,texture={...s};if(sent.get(s.key)!==s.revision){texture.data=data.slice();buffers.add(texture.data.buffer);sent.set(s.key,s.revision);}return {...t,texture};})}));
   worker.postMessage({type:'snapshot',inputs,info:{seq:seq++},at:performance.timeOrigin+performance.now(),timing:{}},[...buffers]);
  };
  send();const timer=setInterval(send,100);await new Promise(r=>setTimeout(r,5000));clearInterval(timer);worker.terminate();ch.port2.close();
  const start=times[0]+1000,steady=times.filter(t=>t>=start),elapsed=steady.at(-1)-steady[0];
  return {images:times.length,sourceSnapshots:seq,steadyFPS:(steady.length-1)*1000/elapsed,errors,last:stats.at(-1)?.temporal,gpu:stats.at(-1)?.gpu};
 });
 assert.equal(report.direct.errors.length,0);assert.ok(report.direct.images>30,'Direct port did not present');
 report.ok=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex native60\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
