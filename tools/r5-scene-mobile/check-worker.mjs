// Regression of the actual delivered lightweight GPU worker and texture protocol.
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {chromium} from 'playwright';
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-worker-check-'+Date.now();
if(process.argv.includes('--wait'))while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))await new Promise(r=>setTimeout(r,5000));
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: regresión worker GPU entregado, sin GH3\nDesde: ${new Date().toISOString()}\nFin: estimado 1 min\n`);
let browser,server;const report={errors:[]};
try{
 server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<canvas width="1280" height="720"></canvas>');}
  if(req.url!=='/worker.js'){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','text/javascript');fs.createReadStream('artifacts/r5-scene-mobile/demo/r5snap-song-gpu.js').pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 report.result=await page.evaluate(async()=>{
  const busy=new Int32Array(new SharedArrayBuffer(4)),pending=new Int32Array(new SharedArrayBuffer(4));
  const worker=new Worker('/worker.js');let resolve,reject;const wait=()=>new Promise((a,b)=>{resolve=a;reject=b;});
  worker.onmessage=e=>e.data.type==='error'?reject(Error(e.data.error)):resolve(e.data);worker.onerror=e=>reject(Error(e.message));
  const shaders={V:{id:'V',stage:'vert',code:'@vertex fn main(@builtin(vertex_index)i:u32)->@builtin(position)vec4<f32>{return vec4(array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i],0.,1.);}'},P:{id:'P',stage:'frag',code:'@group(3) @binding(0) var xe_texture0_2d_u:texture_2d_array<f32>; @group(3) @binding(1) var xe_sampler0_fff:sampler; @fragment fn main()->@location(0)vec4<f32>{return textureSampleLevel(xe_texture0_2d_u,xe_sampler0_fff,vec2(.5,.5),0,0.);}'}};
  let response=wait();worker.postMessage({type:'init',shaders,busy:busy.buffer,presentation:pending.buffer});const init=await response;
  const results=[],ctx=document.querySelector('canvas').getContext('2d');
  for(let i=0;i<4;i++){
   const texture={key:'stable',revision:Math.min(i+1,3),width:4,height:4,format:'rgba8unorm',bytesPerRow:16,rowsPerImage:4};
   if(i<3){texture.data=new Uint8Array(64);for(let j=0;j<64;j+=4)texture.data.set(i===1?[0,255,0,255]:[255,0,0,255],j);}
   const inputs=[{manifest:{vs:'V',ps:'P',blend:65537,raster:0,depth:0,stencil:0,writeMask:15,scissor:[0,0,1280,720],indices:3},assets:{'indices.bin':new Uint8Array(new Uint32Array([0,1,2]).buffer)},textures:[{slot:0,sampler:{mag:0,min:0,mip:0,clampX:2,clampY:2},texture}]}];
   Atomics.store(pending,0,0);Atomics.store(busy,0,1);response=wait();worker.postMessage({type:'frame',inputs,info:{seq:i,swap:i},pairs:{'V/P':1},skips:{},timing:{},approximatedMips:0,startedAt:performance.timeOrigin+performance.now()});
   const frame=await response;ctx.drawImage(frame.bitmap,0,0);frame.bitmap.close();const pixel=[...ctx.getImageData(640,360,1,1).data];results.push({pixel,accepted:frame.gpu.accepted,busy:Atomics.load(busy,0),gpuErrors:frame.gpu.gpuErrors||0});
  }
  worker.terminate();return {ok:init.type==='ready'&&JSON.stringify(results.map(x=>x.pixel))==='[[255,0,0,255],[0,255,0,255],[255,0,0,255],[255,0,0,255]]'&&results.every(x=>x.accepted===1&&x.busy===0&&x.gpuErrors===0),results};
 });report.ok=report.result.ok&&report.errors.length===0;if(!report.ok)process.exitCode=1;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: worker GPU verificado, procesos propios cerrados\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync('artifacts/r5-scene-mobile/worker-check.json',JSON.stringify(report,null,1));}
console.log(JSON.stringify(report));
