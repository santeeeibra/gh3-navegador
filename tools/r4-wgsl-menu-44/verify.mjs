// Local GPU verification only: never launch GH3 or modify the producer/runtime.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {sha256,png,compareRgba} from '../gpu-capture/lib.mjs';
const out='artifacts/r4-wgsl-menu-44',logs=`${out}/logs`;
const wgsl=`${out}/naga/repacked/wgsl`;
const fixturePath='artifacts/gpu-capture/r5f-v2/prep-new/menu-layers.json';
const fixture=JSON.parse(fs.readFileSync(fixturePath));
const reference='artifacts/gpu-capture/runs/v2-44';
const baseline=JSON.parse(fs.readFileSync(`${reference}/edge-manifest.json`));
if(sha256(fs.readFileSync(fixturePath))!==baseline.fixture.sha256)throw Error('Fixture differs from recorded replay');
if(fixture.layers.length!==44||fixture.layers.some((m,i)=>m.draw!==395+i||m.captureIndex!==954+(m.draw-144)))throw Error('44-draw positional alignment mismatch');
const turnFile='artifacts/PRUEBAS-EN-CURSO.md',token=`codex-wgsl-${process.pid}-${crypto.randomBytes(5).toString('hex')}`;
if(!fs.readFileSync(turnFile,'utf8').includes('Estado: LIBRE'))throw Error('Test turn occupied');
fs.writeFileSync(turnFile,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: módulos WGSL y 44 dibujos de captura fija; SIN GH3\nDesde: ${new Date().toISOString()}\n`);
let browser,server;
const report={at:new Date().toISOString(),scope:fixture.scope,fixture:fixturePath,fixtureSha256:baseline.fixture.sha256,reference,pageErrors:[],console:[],draws:[]};
try{
 if(!fs.readFileSync(turnFile,'utf8').includes(`Reserva: ${token}`))throw Error('Lost reservation race');
 const v=spawnSync(process.execPath,['tools/r4-shaders/validate-edge.mjs',wgsl,`${out}/edge-modules.json`],{encoding:'utf8',timeout:120000,windowsHide:true});
 fs.writeFileSync(`${logs}/edge-modules.stdout.txt`,v.stdout??'');fs.writeFileSync(`${logs}/edge-modules.stderr.txt`,v.stderr??'');
 report.moduleValidationExit=v.status;
 const modules=JSON.parse(fs.readFileSync(`${out}/edge-modules.json`));
 if(modules.total!==71||modules.fatal||modules.pageErrors.length||modules.uncapturedErrors.length)throw Error('Module validation harness failed');
 report.modules={total:modules.total,valid:modules.valid,rejected:modules.results.filter(r=>!r.moduleValid).map(r=>({name:r.name,messages:r.messages,scope:r.scope}))};
 const assets=new Map(),uploads=new Set(['final.rgba',...fixture.layers.map(m=>`draw-${m.draw}.rgba`)]);
 const names=['system.bin','fetch.bin','float-vs.bin','memory.bin','texture.bin','indices.bin'];
 for(const m of fixture.layers)for(const n of names){
  const b=fs.readFileSync(`${fixture.assetDir}/isolated-draw-${m.draw}/${n}`);
  if(sha256(b)!==baseline.resources[`${m.draw}/${n}`].sha256)throw Error('Resource differs: '+m.draw+'/'+n);
  assets.set(`/${m.draw}/${n}`,b);
 }
 report.shaders={};
 for(const [stage,h] of Object.entries({vert:'B43CF443883B8351',frag:'526B394DE2AB8891'})){
  const file=`${wgsl}/shader_${h}.ucode.bin.${stage}.spv.wgsl`,b=fs.readFileSync(file);
  assets.set('/'+stage,b);report.shaders[stage]={file,sha256:sha256(b),sameAsReplay:sha256(b)===baseline.resources[`shader/${stage}`].sha256};
 }
 // Read-only reuse of the recorded renderer. Freshly converted WGSL is supplied via /vert,/frag.
 const renderer='tools/gpu-capture/page/render-layers.js';
 report.renderer={file:renderer,sha256:sha256(fs.readFileSync(renderer))};
 assets.set('/render-layers.js',fs.readFileSync(renderer));
 assets.set('/layers.json',Buffer.from(JSON.stringify(fixture.layers)));
 const images=`${out}/edge-44`;fs.mkdirSync(images,{recursive:true});
 server=createServer((req,res)=>{
  if(req.method==='POST'&&req.url.startsWith('/upload/')){
   const name=req.url.slice(8);if(!uploads.has(name)){res.statusCode=400;return res.end();}
   const chunks=[];req.on('data',c=>chunks.push(c));req.on('end',()=>{const b=Buffer.concat(chunks);if(b.length!==1280*720*4){res.statusCode=400;return res.end();}fs.writeFileSync(`${images}/${name}`,b);res.end('ok');});return;
  }
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>44 capas originales</title>');}
  const b=assets.get(req.url);if(!b){res.statusCode=404;return res.end();}res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'application/octet-stream');res.end(b);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
 const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>report.console.push({type:m.type(),text:m.text()}));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 report.gpu=await page.evaluate(async()=>{
  const {renderLayers}=await import('/render-layers.js');const layers=await(await fetch('/layers.json')).json();
  const r=await renderLayers({layers,perDraw:true});
  for(const d of r.draws){const response=await fetch(`/upload/draw-${d.draw}.rgba`,{method:'POST',body:d.rgba});if(!response.ok)throw Error('Readback upload failed');}
  if(!(await fetch('/upload/final.rgba',{method:'POST',body:r.final})).ok)throw Error('Final upload failed');
  return {draws:r.draws.map(d=>d.draw),errors:r.errors,adapter:r.adapter};
 });
 const rd=JSON.parse(fs.readFileSync(`${reference}/rdoc/rdoc-state.json`));
 const actions=rd.actions.filter(a=>a.target?.name==='Dawn_InternalTexture_target');
 if(actions.length!==44||report.gpu.draws.length!==44)throw Error('Draw count mismatch');
 for(const [i,m] of fixture.layers.entries()){
  const a=actions[i];if(!a.pixelReadOnly.some(t=>t.name===`Dawn_InternalTexture_${m.draw}/texture`)||a.numIndices!==m.indices)throw Error('D3D12 draw association mismatch');
  const current=fs.readFileSync(`${images}/draw-${m.draw}.rgba`),prior=fs.readFileSync(`${reference}/draw-${m.draw}.rgba`),native=fs.readFileSync(`${reference}/rdoc/draw-${String(a.index).padStart(3,'0')}.rgba`);
  report.draws.push({draw:m.draw,captureIndex:m.captureIndex,rdocIndex:a.index,sha256:sha256(current),vsEdgeRecorded:compareRgba(current,prior,1280,720),vsD3D12:compareRgba(current,native,1280,720)});
 }
 const final=fs.readFileSync(`${images}/final.rgba`);fs.writeFileSync(`${images}/final.png`,png(final,1280,720));
 const bmp=fs.readFileSync(`${reference}/gfxr/screenshot_frame_2.bmp`),off=bmp.readUInt32LE(10),w=bmp.readInt32LE(18),h=bmp.readInt32LE(22),bits=bmp.readUInt16LE(28);
 if(w!==1280||Math.abs(h)!==720||![24,32].includes(bits)||bmp.readUInt32LE(30)!==0)throw Error('Unsupported reference BMP');
 const stride=Math.ceil(w*bits/8/4)*4,vk=Buffer.alloc(final.length),rgb=Buffer.from(final);
 for(let y=0;y<720;y++)for(let x=0;x<1280;x++){const p=(y*1280+x)*4,q=off+((h>0?719-y:y)*stride)+x*bits/8;vk[p]=bmp[q+2];vk[p+1]=bmp[q+1];vk[p+2]=bmp[q];vk[p+3]=rgb[p+3]=255;}
 report.final={sha256:sha256(final),vulkanRGB:compareRgba(rgb,vk,1280,720),alphaComparison:'Not available in Vulkan screenshot'};
 report.ok=report.gpu.errors.length===0&&report.pageErrors.length===0&&report.draws.every(r=>r.vsEdgeRecorded.identical&&r.vsD3D12.identical)&&report.final.vulkanRGB.identical;
 if(!report.ok)process.exitCode=1;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{
 await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(fs.readFileSync(turnFile,'utf8').includes(`Reserva: ${token}`))fs.writeFileSync(turnFile,'Estado: LIBRE\nQuién: Codex\nQué: validación de shaders y replay fijo cerrados; sin GH3\n');
 fs.writeFileSync(`${out}/edge-44.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({ok:report.ok,modules:report.modules&&{total:report.modules.total,valid:report.modules.valid},draws:report.draws.length,d3d12Exact:report.draws.filter(r=>r.vsD3D12.identical).length,vulkanExact:report.final?.vulkanRGB.identical,error:report.error}));
