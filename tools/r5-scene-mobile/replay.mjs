// Scene extension of gpu-capture: same WebGPUReconstruct + Dawn/RenderDoc tools.
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {chromium} from 'playwright';import {createHash} from 'node:crypto';import {spawnSync} from 'node:child_process';
import {png,sha256,compareRgba} from '../gpu-capture/lib.mjs';
const label=process.argv[2]||'scene-baseline',fixture=process.argv[3]||'artifacts/r5-scene-mobile/fixture',fixed=label.includes('fixed');
const out='artifacts/gpu-capture/runs/'+label;fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-scene-replay-'+createHash('sha256').update(label+Date.now()).digest('hex').slice(0,12);
if(process.argv.includes('--wait'))while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))await new Promise(r=>setTimeout(r,5000));
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: escena capturada, gpu-capture/Dawn/RenderDoc ${label}, SIN ejecutar GH3\nDesde: ${new Date().toISOString()}\nFin: estimado 6 min\n`);
let browser,server;const report={label,fixture,fixed,errors:[]};
try{
 server=createServer((req,res)=>{
  const url=new URL(req.url,'http://local').pathname;
  if(url==='/'){res.setHeader('Content-Type','text/html');return res.end('<canvas width="1280" height="720"></canvas>');}
  let file=path.resolve('.'+url);
  if(url==='/wgpur.js')file=path.resolve('toolchain/gpu-capture/webgpureconstruct-2.1/capture/module/WebGPUReconstruct.js');
  if(!file.startsWith(path.resolve('tools')+path.sep)&&!file.startsWith(path.resolve('artifacts/r5-scene-mobile')+path.sep)&&url!=='/wgpur.js'){res.writeHead(403).end();return;}
  res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':'application/octet-stream');fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({acceptDownloads:true});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port+'/');const dl=page.waitForEvent('download',{timeout:120000});
 report.result=await page.evaluate(async({fixture,fixed})=>{
  const W=(await import('/wgpur.js')).default;W.start({captureFilename:'capture.wgpur'});
  const {createLiveSongRenderer}=await import(fixed?'/tools/r5-scene-mobile/src/renderer.mjs':'/tools/r5-live-song/live-renderer.mjs');
  const shaders=await(await fetch('/artifacts/r5-scene-mobile/shaders.json')).json();
  const f=await(await fetch('/'+fixture+'/fixture.json')).json(),cache=new Map(),get=(p,h)=>{if(!cache.has(h))cache.set(h,fetch('/'+fixture+'/'+p).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)));return cache.get(h);};
  const inputs=[];for(let i=0;i<f.ops.length;i+=8)await Promise.all(f.ops.slice(i,i+8).map(async o=>{const assets=Object.fromEntries(await Promise.all(Object.entries(o.assets).map(async([k,a])=>[k,await get(a.file,a.sha256)])));const textures=await Promise.all(o.textures.map(async t=>({...t,texture:{...t.texture,data:await get(t.texture.file,t.texture.sha256)}})));inputs[o.manifest.draw]={manifest:o.manifest,assets,textures};}));const compact=inputs.filter(Boolean);inputs.length=0;inputs.push(...compact);
  const adapter=await navigator.gpu.requestAdapter(),bc=adapter.features.has('texture-compression-bc');const device=await adapter.requestDevice({requiredFeatures:bc?['texture-compression-bc']:[]});const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  let target;const createTexture=device.createTexture.bind(device);device.createTexture=desc=>{if(!target&&desc.format==='rgba8unorm'&&(desc.usage&GPUTextureUsage.RENDER_ATTACHMENT)&&(desc.usage&GPUTextureUsage.COPY_SRC)){desc={...desc,label:'target'};target=createTexture(desc);return target;}return createTexture(desc);};
  const canvas=document.querySelector('canvas'),context=canvas.getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST|GPUTextureUsage.COPY_SRC,alphaMode:'opaque'});
  const e=device.createCommandEncoder();e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]}).end();device.queue.submit([e.finish()]);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const renderer=await createLiveSongRenderer(device,shaders);const result=await renderer.render(inputs,context);
  const read=device.createBuffer({size:1280*720*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:1280*4},[1280,720]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);const rgba=Array.from(new Uint8Array(read.getMappedRange()));read.unmap();read.destroy();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));W.finish();return {result,errors,rgba,adapter:{vendor:adapter.info?.vendor,device:adapter.info?.device,description:adapter.info?.description},features:[...adapter.features]};
 },{fixture,fixed});
 await (await dl).saveAs(out+'/capture.wgpur');const rgba=new Uint8Array(report.result.rgba);delete report.result.rgba;fs.writeFileSync(out+'/final.rgba',rgba);fs.writeFileSync(out+'/final.png',png(rgba,1280,720));report.imageSha256=sha256(rgba);
 await browser.close();browser=null;await new Promise(r=>server.close(r));server=null;
 if(!process.env.SCENE_SKIP_NATIVE){
  const f=JSON.parse(fs.readFileSync(fixture+'/fixture.json')),indices=f.ops.flatMap((o,i)=>['E77D87A4B2DF7DC5','3B5AB72644231777','5F085A5F92EBBB72'].includes(o.manifest.vs)?[i]:[]);indices.push(f.ops.length-1);
  const r=spawnSync(process.execPath,['tools/r5-scene-mobile/replay-native.mjs',label,'dawn','rdoc'],{encoding:'utf8',windowsHide:true,timeout:300000,env:{...process.env,GPUCAP_TURN:token,GPUCAP_DRAW_INDICES:indices.join(',')},maxBuffer:4*1024*1024});report.native={status:r.status,stdout:r.stdout,stderr:r.stderr};
  const statePath=out+'/rdoc/rdoc-state.json';if(fs.existsSync(statePath)){const state=JSON.parse(fs.readFileSync(statePath)),last=state.actions.at(-1);if(last&&last.index===f.ops.length-1){const native=fs.readFileSync(out+'/rdoc/draw-'+String(last.index).padStart(3,'0')+'.rgba');report.nativeCompare=compareRgba(fs.readFileSync(out+'/final.rgba'),native,1280,720);}}
 }
 report.ok=report.errors.length===0&&report.result.errors.length===0;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: ${label} terminado, procesos propios cerrados\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/scene-report.json',JSON.stringify(report,null,1));}
console.log(JSON.stringify({label,ok:report.ok,image:report.imageSha256,error:report.error,result:report.result?.result,errors:report.result?.errors,native:report.native?.status}));
