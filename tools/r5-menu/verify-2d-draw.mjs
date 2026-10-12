import fs from 'node:fs';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const turn=fs.readFileSync('artifacts/PRUEBAS-EN-CURSO.md','utf8');
if(!turn.includes('Estado: OCUPADO')||!turn.includes('Quién: Codex'))throw Error('Reserve Codex test turn');
const dir='artifacts/r5-menu/isolated-draw-395';
const m=JSON.parse(fs.readFileSync(`${dir}/manifest.json`));
const assets=new Map();
for(const name of ['system.bin','fetch.bin','float-vs.bin','memory.bin','texture.bin','indices.bin'])assets.set('/'+name,fs.readFileSync(`${dir}/${name}`));
for(const [stage,hash] of [['vert',m.vs],['frag',m.ps]])assets.set('/'+stage,fs.readFileSync(`artifacts/r4-shaders/wgsl-repacked/shader_${hash}.ucode.bin.${stage}.spv.wgsl`));
const server=createServer((req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<style>html,body{margin:0;background:transparent}canvas{display:block}</style><canvas width="1280" height="720"></canvas>');}
 else if(assets.has(req.url))res.end(assets.get(req.url));else{res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
const report={scope:m.scope,pageErrors:[]};
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 report.browser=browser.version();
 report.result=await page.evaluate(async m=>{
  const adapter=await navigator.gpu.requestAdapter();
  if(!adapter?.features.has('texture-compression-bc'))throw Error('BC unavailable');
  const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});
  const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  device.pushErrorScope('validation');
  const get=async name=>new Uint8Array(await (await fetch('/'+name)).arrayBuffer());
  const vs=device.createShaderModule({code:await (await fetch('/vert')).text()});
  const ps=device.createShaderModule({code:await (await fetch('/frag')).text()});
  const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha'};
  const ops={0:'add',1:'subtract',2:'min',3:'max',4:'reverse-subtract'},b=m.blend;
  const blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:vs,entryPoint:'main'},fragment:{module:ps,entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:15}]},
   primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
  const buffers=[];
  const buffer=async(name,usage)=>{const raw=await get(name);const v=device.createBuffer({size:Math.max(4,raw.length),usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(v,0,raw);buffers.push(v);return v;};
  const memory=await buffer('memory.bin',GPUBufferUsage.STORAGE),system=await buffer('system.bin',GPUBufferUsage.UNIFORM),floats=await buffer('float-vs.bin',GPUBufferUsage.UNIFORM),fetches=await buffer('fetch.bin',GPUBufferUsage.UNIFORM),indices=await buffer('indices.bin',GPUBufferUsage.INDEX);
  const groups=[device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:memory}}]}),
   device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:system}},{binding:1,resource:{buffer:floats}},{binding:4,resource:{buffer:fetches}}]}),
   device.createBindGroup({layout:pipeline.getBindGroupLayout(2),entries:[]})];
  const t=m.texture,texture=device.createTexture({size:[t.width,t.height,1],format:t.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  device.queue.writeTexture({texture},await get('texture.bin'),{bytesPerRow:t.bytesPerRow,rowsPerImage:t.rowsPerImage},[t.width,t.height,1]);
  const view=texture.createView({dimension:'2d-array'}),s=m.sampler,address=['repeat','mirror-repeat','clamp-to-edge'];
  // Read the hardware BC decoder separately from filtering and the original shaders.
  const decoderModule=device.createShaderModule({code:`@group(0) @binding(0) var tex: texture_2d_array<f32>;
@group(0) @binding(1) var<storage, read_write> pixels: array<vec4<f32>>;
@compute @workgroup_size(8,8) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
 let size=textureDimensions(tex); if(id.x>=size.x || id.y>=size.y){return;}
 pixels[id.y*size.x+id.x]=textureLoad(tex,vec2<i32>(id.xy),0,0);
}`});
  const decoder=device.createComputePipeline({layout:'auto',compute:{module:decoderModule,entryPoint:'main'}});
  const decoded=device.createBuffer({size:t.width*t.height*16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
  const decodedRead=device.createBuffer({size:t.width*t.height*16,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const decoderGroup=device.createBindGroup({layout:decoder.getBindGroupLayout(0),entries:[{binding:0,resource:view},{binding:1,resource:{buffer:decoded}}]});
  const decodeEncoder=device.createCommandEncoder(),decodePass=decodeEncoder.beginComputePass();
  decodePass.setPipeline(decoder);decodePass.setBindGroup(0,decoderGroup);decodePass.dispatchWorkgroups(Math.ceil(t.width/8),Math.ceil(t.height/8));decodePass.end();
  decodeEncoder.copyBufferToBuffer(decoded,0,decodedRead,0,t.width*t.height*16);device.queue.submit([decodeEncoder.finish()]);
  await decodedRead.mapAsync(GPUMapMode.READ);const decodedBytes=new Uint8Array(decodedRead.getMappedRange()).slice();decodedRead.unmap();
  const sampler=device.createSampler({magFilter:s.mag?'linear':'nearest',minFilter:s.min?'linear':'nearest',mipmapFilter:s.mip?'linear':'nearest',addressModeU:address[s.clampX],addressModeV:address[s.clampY]});
  groups.push(device.createBindGroup({layout:pipeline.getBindGroupLayout(3),entries:[{binding:0,resource:view},{binding:1,resource:view},{binding:2,resource:sampler}]}));
  const target=device.createTexture({size:[m.width,m.height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const depth=device.createTexture({size:[m.width,m.height],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  const read=device.createBuffer({size:m.width*m.height*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const enc=device.createCommandEncoder(),pass=enc.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,0],loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1}});
  pass.setPipeline(pipeline);groups.forEach((g,i)=>pass.setBindGroup(i,g));pass.setViewport(0,0,m.width,m.height,0,1);pass.setScissorRect(0,0,m.width,m.height);pass.setIndexBuffer(indices,'uint32');pass.drawIndexed(m.indices);pass.end();
  enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:m.width*4},[m.width,m.height]);device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
  const rgba=new Uint8ClampedArray(read.getMappedRange()).slice();read.unmap();
  const validation=await device.popErrorScope();if(validation)throw Error(validation.message);
  let visible=0;let minX=m.width,minY=m.height,maxX=-1,maxY=-1;
  for(let y=0;y<m.height;y++)for(let x=0;x<m.width;x++)if(rgba[(y*m.width+x)*4+3]){visible++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const nonzero=rgba.reduce((n,v)=>n+(v!==0),0);
  document.querySelector('canvas').getContext('2d').putImageData(new ImageData(rgba,m.width,m.height),0,0);
  read.destroy();decoded.destroy();decodedRead.destroy();target.destroy();depth.destroy();texture.destroy();buffers.forEach(b=>b.destroy());await device.queue.onSubmittedWorkDone();device.destroy();
  let binary='';for(let offset=0;offset<rgba.length;offset+=32768)binary+=String.fromCharCode(...rgba.subarray(offset,offset+32768));
  let decodedBinary='';for(let offset=0;offset<decodedBytes.length;offset+=32768)decodedBinary+=String.fromCharCode(...decodedBytes.subarray(offset,offset+32768));
  return {visible,nonzero,bounds:{minX,minY,maxX,maxY},errors,blend,rgbaBase64:btoa(binary),decodedBase64:btoa(decodedBinary)};
 },m);
 fs.writeFileSync(`${dir}/gpu-readback.rgba`,Buffer.from(report.result.rgbaBase64,'base64'));
 delete report.result.rgbaBase64;
 fs.writeFileSync(`${dir}/gpu-decoded.f32`,Buffer.from(report.result.decodedBase64,'base64'));
 delete report.result.decodedBase64;
 await page.locator('canvas').screenshot({path:`${dir}/original-draw.png`,omitBackground:true});
 report.ok=report.result.visible>0&&report.result.errors.length===0&&report.pageErrors.length===0;
 if(!report.ok)throw Error('GPU/page errors');
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(`${dir}/edge-result.json`,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
