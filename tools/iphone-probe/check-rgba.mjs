import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {decodeBCTexture} from './bc-rgba.mjs';
import {requireTurn} from '../gpu-capture/lib.mjs';
requireTurn();
const out='artifacts/mobile-private/rgba-check-'+Date.now();fs.mkdirSync(out,{recursive:true});
const report={pageErrors:[],cases:[]},cases=[],payloads=[];
const formats={'bc1-rgba-unorm':8,'bc2-rgba-unorm':16,'bc3-rgba-unorm':16,'bc5-rg-unorm':16};
let seed=21;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed>>>24;};
for(const [format,bytes] of Object.entries(formats))for(let mode=0;mode<4;mode++){
 const width=mode===3?5:8,height=mode===3?7:8,bytesPerRow=2*bytes+16,data=Uint8Array.from({length:bytesPerRow*2},next);
 // Force both endpoint orders; exercise transparency and both alpha palettes.
 for(let y=0;y<2;y++)for(let x=0;x<2;x++){const at=y*bytesPerRow+x*bytes;if(mode!==2&&(format==='bc1-rgba-unorm'||format==='bc2-rgba-unorm'||format==='bc3-rgba-unorm')){const co=at+(format==='bc1-rgba-unorm'?0:8);if(mode&1){data[co]=0;data[co+1]=0;data[co+2]=255;data[co+3]=255;}else{data[co]=255;data[co+1]=255;data[co+2]=0;data[co+3]=0;}}if(mode!==2&&(format==='bc3-rgba-unorm'||format==='bc5-rg-unorm')){data[at]=mode&1?0:255;data[at+1]=mode&1?255:0;}}
 // Measured GPU interpolation differs up to 5/255 for BC1 green and 7/255
 // for BC5 channels. This is an approximate comparison, not byte identity.
 const t={width,height,format,bytesPerRow,rowsPerImage:2,data},decoded=decodeBCTexture(t),id=cases.length;cases.push({id,width,height,format,bytesPerRow,nativeWidth:8,nativeHeight:8,maxDifference:8/255+1e-6});payloads.push({native:data,rgba:decoded.data});assert.equal(decoded.data.length,width*height*4);assert.equal(decoded.bytesPerRow,width*4);
}
assert.throws(()=>decodeBCTexture({width:4,height:4,format:'bc1-rgba-unorm',bytesPerRow:8,data:new Uint8Array(7)}),/incompletos/);
assert.throws(()=>decodeBCTexture({width:8192,height:8192,format:'bc1-rgba-unorm',bytesPerRow:16384,data:new Uint8Array(32*1048576)}),/límite/);
const nonBC={format:'rgba8unorm'};assert.equal(decodeBCTexture(nonBC),nonBC);
const transparent=decodeBCTexture({width:4,height:4,format:'bc1-rgba-unorm',bytesPerRow:8,data:new Uint8Array([0,0,255,255,255,255,255,255])});assert.ok(transparent.data.every(x=>x===0));
const middle=decodeBCTexture({width:4,height:4,format:'bc1-rgba-unorm',bytesPerRow:8,data:new Uint8Array([255,255,0,0,170,170,170,170])});assert.deepEqual([...middle.data.slice(0,4)],[170,170,170,255]);
const explicit=decodeBCTexture({width:4,height:4,format:'bc2-rgba-unorm',bytesPerRow:16,data:new Uint8Array([16,50,84,118,152,186,220,254,0,248,0,0,0,0,0,0])});assert.deepEqual([...explicit.data].filter((_,i)=>i%4===3),Array.from({length:16},(_,i)=>i*17));
function alphaBlock(a,b){const bytes=new Uint8Array(8);bytes[0]=a;bytes[1]=b;for(let i=0;i<16;i++){const value=i%8,bit=i*3,k=2+(bit>>>3);bytes[k]|=(value<<(bit&7))&255;if(k+1<8)bytes[k+1]|=value>>>(8-(bit&7));}return bytes;}
const rg=decodeBCTexture({width:4,height:4,format:'bc5-rg-unorm',bytesPerRow:16,data:new Uint8Array([...alphaBlock(0,255),...alphaBlock(255,0)])});
assert.deepEqual([...rg.data].filter((_,i)=>i%4===0).slice(0,8),[0,255,51,102,153,204,0,255]);
assert.deepEqual([...rg.data].filter((_,i)=>i%4===1).slice(0,8),[255,0,219,182,146,109,73,36]);
const server=http.createServer((req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');const m=/^\/data\/(\d+)\/(native|rgba)$/.exec(req.url);if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<title>Own BC/RGBA comparison</title>');}else if(m&&payloads[+m[1]])res.end(payloads[+m[1]][m[2]]);else res.writeHead(404).end();});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port+'/');
 report.cases=await page.evaluate(async cases=>{
  const ad=await navigator.gpu.requestAdapter(),native=await ad.requestDevice({requiredFeatures:['texture-compression-bc']}),rgba=await(await navigator.gpu.requestAdapter()).requestDevice(),errors=[];native.addEventListener('uncapturederror',e=>errors.push(e.error.message));rgba.addEventListener('uncapturederror',e=>errors.push(e.error.message));if(rgba.features.has('texture-compression-bc'))throw Error('RGBA device unexpectedly has BC');
  const code='@group(0) @binding(0) var t: texture_2d<f32>; @group(0) @binding(1) var<storage,read_write> out: array<vec4<f32>>; @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id:vec3<u32>) { out[id.x] = textureLoad(t,vec2<i32>(i32(id.x % WIDTHu),i32(id.x / WIDTHu)),0); }';
  async function sample(dev,c,kind){const bytes=new Uint8Array(await(await fetch('/data/'+c.id+'/'+kind)).arrayBuffer()),format=kind==='native'?c.format:'rgba8unorm',w=kind==='native'?c.nativeWidth:c.width,h=kind==='native'?c.nativeHeight:c.height,tex=dev.createTexture({size:[w,h],format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});dev.queue.writeTexture({texture:tex},bytes,{bytesPerRow:kind==='native'?c.bytesPerRow:c.width*4,rowsPerImage:kind==='native'?2:c.height},[w,h]);const module=dev.createShaderModule({code:code.replaceAll('WIDTH',String(c.width))}),pipeline=await dev.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),size=c.width*c.height*16,out=dev.createBuffer({size,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),read=dev.createBuffer({size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),group=dev.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:tex.createView()},{binding:1,resource:{buffer:out}}]});const e=dev.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(c.width*c.height);pass.end();e.copyBufferToBuffer(out,0,read,0,size);dev.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const v=Array.from(new Float32Array(read.getMappedRange()));read.unmap();tex.destroy();out.destroy();read.destroy();return v;}
  try{const rows=[];for(const c of cases){const a=await sample(native,c,'native'),b=await sample(rgba,c,'rgba'),max=Math.max(...a.map((v,i)=>Math.abs(v-b[i])));if(max>c.maxDifference)throw Error(c.format+' case '+c.id+' max difference '+max+' samples '+JSON.stringify(a.map((v,i)=>({i,native:Math.round(v*255),rgba:Math.round(b[i]*255)})).filter(x=>Math.abs(x.native-x.rgba)>2).slice(0,10)));rows.push({format:c.format,width:c.width,height:c.height,maxDifference:max});}if(errors.length)throw Error(errors.join('\n'));return rows;}finally{native.destroy();rgba.destroy();}
 },cases);
 assert.equal(report.cases.length,16);assert.deepEqual(report.pageErrors,[]);report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,...report}));
