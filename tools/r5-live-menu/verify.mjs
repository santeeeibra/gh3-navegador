import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {prepareLiveMenuDraw} from './prepare.mjs';
import {createMenuConsumer} from './consumer.mjs';
import {physicalReader} from './memory.mjs';
import {png,sha256} from '../gpu-capture/lib.mjs';
const out='artifacts/r5-live-menu';fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync('artifacts/gpu-capture/r5f-v2/prep-new/menu-layers.json'));
const capture=readFrameCapture(fs.readFileSync(fixture.capture),{hash:await createHash()});
const draws=[...replayEvents(capture,3)].filter(d=>d.type==='draw');
const prepared=[],report={scope:'Persistent consumer tested on captured states/resources; NOT GH3 live',adapterDraws:0,assetComparisons:0};
for(const m of fixture.layers){
 const d=draws.find(d=>d.index===m.captureIndex);
 const read=(phys,bytes)=>{
  const candidates=[...d.vertices.map(v=>capture.blobs.get(v.blob)),...d.textures.map(t=>capture.blobs.get(t.baseBlob))];
  const b=candidates.find(b=>b.phys===phys&&b.data.length===bytes);
  if(!b)throw Error('Fixture address not found');return b.data;
 };
 const p=prepareLiveMenuDraw(d,read);
 for(const [name,b] of Object.entries(p.assets)){assert.deepEqual(b,new Uint8Array(fs.readFileSync(`${fixture.assetDir}/isolated-draw-${m.draw}/${name}`)));report.assetComparisons++;}
 prepared.push(p);report.adapterDraws++;
}
// Consumer backpressure + unsupported states must not stall the producer.
let unblock,released=0;
const fake={render:()=>new Promise(r=>unblock=r)};
const consumer=createMenuConsumer(fake,{readPhysical:()=>{throw Error('Unexpected resource read');}});
const first=consumer.submit({sequence:1,events:[{type:'copy'},{type:'draw',vs:0n,ps:0n}],release:()=>released++});
assert.deepEqual(await consumer.submit({sequence:2,events:[],release:()=>released++}),{dropped:true});
unblock({});await first;assert.equal(released,2);assert.equal(consumer.stats.unsupportedCopies,1);assert.equal(consumer.stats.unsupportedDraws,1);
await assert.rejects(consumer.submit({sequence:2,events:[]}),/out-of-order/);
const shared=new SharedArrayBuffer(2048),read=physicalReader(()=>shared,1024,1024);
assert.equal(read(8,4).byteOffset,1032);assert.throws(()=>read(1023,2),/outside/);
report.queueAndMapping='passed';
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`codex-live-menu-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Test turn occupied');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: renderer persistente, captura fija; SIN GH3\n`);
let browser,server;
try{
 const assets=new Map();
 assets.set('/inputs.json',Buffer.from(JSON.stringify(prepared.map(p=>({manifest:p.manifest,assets:Object.fromEntries(Object.entries(p.assets).map(([n,b])=>[n,Array.from(b)]))})))));
 const wgsl='artifacts/r4-wgsl-menu-44/naga/repacked/wgsl';
 assets.set('/vert',fs.readFileSync(`${wgsl}/shader_B43CF443883B8351.ucode.bin.vert.spv.wgsl`));
 assets.set('/frag',fs.readFileSync(`${wgsl}/shader_526B394DE2AB8891.ucode.bin.frag.spv.wgsl`));
 const workerDraw=draws.find(d=>d.index===fixture.layers[0].captureIndex);
 const workerResources=[...workerDraw.vertices.map(v=>capture.blobs.get(v.blob)),...workerDraw.textures.map(t=>capture.blobs.get(t.baseBlob))];
 assets.set('/worker-frame.json',Buffer.from(JSON.stringify({draw:workerDraw,resources:workerResources.map(b=>({phys:b.phys,data:Array.from(b.data)}))},(_,v)=>typeof v==='bigint'?'0x'+v.toString(16):v instanceof Uint32Array?Array.from(v):v)));
 const images=[];
 server=createServer((req,res)=>{
  if(req.method==='POST'&&req.url==='/image'){const chunks=[];req.on('data',b=>chunks.push(b));req.on('end',()=>{const bytes=Buffer.concat(chunks);if(bytes.length!==1280*720*4){res.statusCode=400;return res.end();}images.push(bytes);res.end('ok');});return;}
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><canvas width="1280" height="720"></canvas>');}
  if(assets.has(req.url))return res.end(assets.get(req.url));
  const filename=path.resolve('.'+req.url),base=path.resolve('tools/r5-live-menu');
  const dependencies=['tools/r5-menu/texture-layout.mjs','tools/r5-menu/primitive.mjs'].map(p=>path.resolve(p));
  if((!filename.startsWith(base+path.sep)&&!dependencies.includes(filename))||!filename.endsWith('.mjs')||!fs.existsSync(filename)){res.statusCode=404;return res.end();}
  res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(filename));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
 const page=await browser.newPage();report.pageErrors=[];page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 report.gpu=await page.evaluate(async()=>{
  const {createMenuRenderer}=await import('/tools/r5-live-menu/renderer.mjs');
  const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));device.pushErrorScope('validation');
  const text=async u=>(await fetch(u)).text();
  const inputs=await(await fetch('/inputs.json')).json();for(const p of inputs)for(const n of Object.keys(p.assets))p.assets[n]=Uint8Array.from(p.assets[n]);
  const renderer=await createMenuRenderer(device,{vertexWGSL:await text('/vert'),fragmentWGSL:await text('/frag')});
  const context=document.querySelector('canvas').getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
  const frames=[],upload=async()=>{const response=await fetch('/image',{method:'POST',body:await renderer.readback()});if(!response.ok)throw Error('Upload failed');};
  await renderer.render(inputs,{context});await upload();frames.push({...renderer.stats});
  await renderer.render(inputs,{context});await upload();frames.push({...renderer.stats});
  const changed=inputs.map(p=>({manifest:p.manifest,assets:{...p.assets,'texture.bin':new Uint8Array(p.assets['texture.bin'].length)}}));
  await renderer.render(changed,{context});await upload();frames.push({...renderer.stats});
  await renderer.render(inputs,{context});await upload();frames.push({...renderer.stats});
  await renderer.render([],{context});await upload();frames.push({...renderer.stats});
  renderer.dispose();const validation=await device.popErrorScope();if(validation)errors.push(validation.message);device.destroy();return {frames,errors};
 });
 report.worker=await page.evaluate(async()=>{
  const code=`import {installLiveMenu} from '${location.origin}/tools/r5-live-menu/worker.mjs';
   try {
    const base='${location.origin}',raw=await(await fetch(base+'/worker-frame.json')).json(),d=raw.draw;
    d.vs=BigInt(d.vs);d.ps=BigInt(d.ps);d.registers=Uint32Array.from(d.registers);d.vertices.forEach(v=>v.raw=Uint32Array.from(v.raw));d.textures.forEach(t=>t.raw=Uint32Array.from(t.raw));
    const resources=raw.resources.map(r=>({...r,data:Uint8Array.from(r.data)}));
    const text=async u=>(await fetch(base+u)).text();
    const live=await installLiveMenu({readPhysical:(phys,bytes)=>{const r=resources.find(r=>r.phys===phys&&r.data.length===bytes);if(!r)throw Error('Worker resource range');return r.data;}},{vertexWGSL:await text('/vert'),fragmentWGSL:await text('/frag'),onFrame:(bitmap,report)=>postMessage({bitmap,report},[bitmap])});
    await live.submit({sequence:1,events:[d]});live.dispose();
   } catch(e){postMessage({error:e.stack});}`;
  const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'})),worker=new Worker(url,{type:'module'});
  try{return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Worker timeout')),30000);
   worker.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};
   worker.onmessage=e=>{clearTimeout(timer);const {bitmap,report,error}=e.data;if(error)return reject(Error(error));const result={width:bitmap.width,height:bitmap.height,accepted:report.accepted,gpu:report.gpu};bitmap.close();resolve(result);};
  });}finally{worker.terminate();URL.revokeObjectURL(url);}
 });
 assert.equal(report.worker.accepted,1);assert.equal(report.worker.width,1280);assert.equal(report.worker.height,720);assert.equal(report.worker.gpu.readbacks,0);
 assert.equal(images.length,5);const expected=fs.readFileSync('artifacts/r4-wgsl-menu-44/edge-44/final.rgba');
 assert.deepEqual(images[0],expected);assert.deepEqual(images[1],expected);assert.notDeepEqual(images[2],expected);assert.deepEqual(images[3],expected);assert.deepEqual(images[4],expected);
 const frames=report.gpu.frames;assert.equal(frames[1].pipelineBuilds,frames[0].pipelineBuilds);assert.equal(frames[1].slotBuilds,frames[0].slotBuilds);assert.equal(frames[1].textureUploads,frames[0].textureUploads);assert.equal(frames[1].textureReuses,44);
 assert.deepEqual(report.gpu.errors,[]);assert.deepEqual(report.pageErrors,[]);
 fs.writeFileSync(`${out}/final.png`,png(images[3],1280,720));report.frameHashes=images.map(sha256);report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(`Reserva: ${token}`))fs.writeFileSync(turn,'Estado: LIBRE\nQuién: Codex\nQué: renderer persistente cerrado; SIN GH3\n');fs.writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify({ok:report.ok,adapterDraws:report.adapterDraws,assetComparisons:report.assetComparisons,gpu:report.gpu,error:report.error}));
