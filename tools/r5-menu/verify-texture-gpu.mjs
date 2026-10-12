import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {readFrameCapture} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
import {prepareTextureBase} from './texture-layout.mjs';
const turn=fs.readFileSync('artifacts/PRUEBAS-EN-CURSO.md','utf8');
if(!turn.includes('Estado: OCUPADO')||!turn.includes('Quién: Codex'))throw Error('Reserve Codex test turn before GPU replay');
const capture=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()});
const cases=[], payloads=[];
function add(label,p,expected=null){const id=cases.length;cases.push({label,id,width:p.width,height:p.height,layers:p.layers??1,format:p.format,bytesPerRow:p.bytesPerRow,rowsPerImage:p.rowsPerImage,expected,mipsPending:p.mipsPending??false});payloads.push(p.data);}
const color=new Uint8Array([0,248,0,0,0,0,0,0]);
add('own-bc1-red',{width:4,height:4,format:'bc1-rgba-unorm',bytesPerRow:8,rowsPerImage:1,data:color},[1,0,0,1]);
add('own-bc2-red',{width:4,height:4,format:'bc2-rgba-unorm',bytesPerRow:16,rowsPerImage:1,data:new Uint8Array([...new Uint8Array(8).fill(255),...color])},[1,0,0,1]);
add('own-bc3-red',{width:4,height:4,format:'bc3-rgba-unorm',bytesPerRow:16,rowsPerImage:1,data:new Uint8Array([255,0,0,0,0,0,0,0,...color])},[1,0,0,1]);
add('own-bc5-red',{width:4,height:4,format:'bc5-rg-unorm',bytesPerRow:16,rowsPerImage:1,data:new Uint8Array([255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0])},[1,0,0,1]);
const cubeBytes=new Uint8Array(6*16384),cubeExpected=[];
for(let face=0;face<6;face++){const pixel=[face*40,255-face*40,face*20,255];cubeBytes.set(pixel,face*16384);cubeExpected.push(...pixel.map(x=>x/255));}
const ownCube=prepareTextureBase({format:6,dimension:3,depth:5,width:63,height:63,pitch:64,raw:[2,0],status:0,baseDependency:0,endian:0,tiled:0,baseBytes:cubeBytes.length,packedMips:0,mipMax:0},cubeBytes);
add('own-six-faces',ownCube,cubeExpected);
const seen=new Set();
for(const f of capture.frames)for(const e of f.events.filter(e=>e.type==='draw'))for(const t of e.textures){
  const key=[t.baseBlob,t.format,t.width,t.height,t.pitch,t.endian,t.tiled,t.packedMips,t.baseDependency].join('/');if(seen.has(key))continue;seen.add(key);
  try{const p=prepareTextureBase(t,capture.blobs.get(t.baseBlob)?.data);if(p.blockWidth===4&&(p.width%4||p.height%4))continue;add(key,p);}catch{}
}
// Only in-memory prepared payloads on loopback; no arbitrary filesystem route.
const server=createServer((req,res)=>{
  const m=/^\/texture\/(\d+)$/.exec(req.url);
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>R5 texture probe</title>');}
  else if(m&&payloads[Number(m[1])]){res.setHeader('Content-Type','application/octet-stream');res.end(payloads[Number(m[1])]);}
  else{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const report={purpose:'base texture upload/sampling only; no menu rendering, mip chain, swizzle or resolve certification',results:[],pageErrors:[]};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
  const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const result=await page.evaluate(async cases=>{
    const adapter=await navigator.gpu.requestAdapter();if(!adapter?.features.has('texture-compression-bc'))throw Error('BC compression unavailable');
    const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});
    const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    const shader=device.createShaderModule({code:'@group(0) @binding(0) var t: texture_2d_array<f32>; @group(0) @binding(1) var<storage,read_write> out: array<vec4<f32>>; @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3<u32>) { out[id.x] = textureLoad(t,vec2<i32>(0,0),i32(id.x),0); }'});
    const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:shader,entryPoint:'main'}});const results=[];
    try{for(const c of cases){
      device.pushErrorScope('validation');let texture,out,read;
      try{
        const data=new Uint8Array(await (await fetch('/texture/'+c.id)).arrayBuffer());
        texture=device.createTexture({size:[c.width,c.height,c.layers],format:c.format,usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING});
        device.queue.writeTexture({texture},data,{bytesPerRow:c.bytesPerRow,rowsPerImage:c.rowsPerImage},[c.width,c.height,c.layers]);
        out=device.createBuffer({size:16*c.layers,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});read=device.createBuffer({size:16*c.layers,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
        const bg=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView({dimension:'2d-array'})},{binding:1,resource:{buffer:out}}]});
        const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bg);pass.dispatchWorkgroups(c.layers);pass.end();encoder.copyBufferToBuffer(out,0,read,0,16*c.layers);device.queue.submit([encoder.finish()]);
        await read.mapAsync(GPUMapMode.READ);const pixel=Array.from(new Float32Array(read.getMappedRange()));read.unmap();
        const error=(await device.popErrorScope())?.message??null;
        results.push({label:c.label,format:c.format,layers:c.layers,mipsPending:c.mipsPending,pixel,error,expected:c.expected});
      }catch(e){const scope=(await device.popErrorScope())?.message;throw Error(c.label+': '+e.message+' '+(scope??''));}
      finally{texture?.destroy();out?.destroy();read?.destroy();}
    }}finally{device.destroy();}
    return {results,errors,gpu:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}};
  },cases);
  Object.assign(report,result);assert.equal(result.errors.length,0);assert.equal(report.pageErrors.length,0);
  for(const r of result.results){assert.equal(r.error,null);if(r.expected)r.expected.forEach((x,i)=>assert(Math.abs(r.pixel[i]-x)<0.001));}
  report.passed=true;console.log(JSON.stringify({passed:true,textures:result.results.length,ownControls:5,gpu:result.gpu}));
}catch(e){report.passed=false;report.error=e.message;process.exitCode=1;console.error(e.message);}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync('artifacts/r5-menu/texture-gpu-check.json',JSON.stringify(report,null,2));}
