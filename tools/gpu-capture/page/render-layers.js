// Renders Codex's captured 2D menu layers (artifacts/r5-menu/menu-layers.json)
// with the same pipeline/bind/blend logic as tools/r5-menu/verify-menu-layers.mjs,
// adding a GPU readback after every DRAW so each operation has its own image.
// Runs in the main thread or in a dedicated worker (same code).
// Never substitutes resources: a missing asset is a hard error.
const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha'};
const ops={0:'add',1:'subtract',2:'min',3:'max',4:'reverse-subtract'};

export async function renderLayers({layers,perDraw=true,present=null,nextFrame=null,fetchBase=''}){
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter?.features.has('texture-compression-bc'))throw Error('BC unavailable');
 const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});
 const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
 device.pushErrorScope('validation');
 const text=async u=>{const r=await fetch(fetchBase+u);if(!r.ok)throw Error('missing '+u);return r.text();};
 const bin=async u=>{const r=await fetch(fetchBase+u);if(!r.ok)throw Error('missing '+u);return new Uint8Array(await r.arrayBuffer());};
 const vs=device.createShaderModule({label:'vs_B43CF443883B8351',code:await text('/vert')});
 const ps=device.createShaderModule({label:'ps_526B394DE2AB8891',code:await text('/frag')});
 const W=1280,H=720,size=W*H*4;
 const target=device.createTexture({label:'target',size:[W,H],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const depth=device.createTexture({label:'depth',size:[W,H],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
 const resources=[target,depth],out=[];
 let ctx=null;
 if(present){
  // Frame 0 = setup + one empty present; all DRAWs then land in frame 1, which
  // frame-based tools (RenderDoc, GFXReconstruct screenshots) can select.
  ctx=present.getContext('webgpu');ctx.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'premultiplied'});
  const enc=device.createCommandEncoder({label:'warmup'});enc.beginRenderPass({colorAttachments:[{view:ctx.getCurrentTexture().createView(),clearValue:[0,0,0,1],loadOp:'clear',storeOp:'store'}]}).end();device.queue.submit([enc.finish()]);
  await nextFrame();
 }
 const readback=async()=>{
  const read=device.createBuffer({size,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:W*4},[W,H]);
  device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
  const rgba=new Uint8Array(read.getMappedRange()).slice();read.unmap();read.destroy();return rgba;
 };
 for(const m of layers){
  const get=n=>bin(`/${m.draw}/${n}`);
  const buffer=async(n,usage)=>{const raw=await get(n);const v=device.createBuffer({label:`${m.draw}/${n}`,size:Math.max(4,raw.length),usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(v,0,raw);resources.push(v);return v;};
  const b=m.blend,blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
  const pipeline=await device.createRenderPipelineAsync({label:`draw${m.draw}`,layout:'auto',vertex:{module:vs,entryPoint:'main'},fragment:{module:ps,entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:15}]},primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
  const memory=await buffer('memory.bin',GPUBufferUsage.STORAGE),system=await buffer('system.bin',GPUBufferUsage.UNIFORM),floats=await buffer('float-vs.bin',GPUBufferUsage.UNIFORM),fetches=await buffer('fetch.bin',GPUBufferUsage.UNIFORM),indices=await buffer('indices.bin',GPUBufferUsage.INDEX);
  const groups=[device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:memory}}]}),device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:system}},{binding:1,resource:{buffer:floats}},{binding:4,resource:{buffer:fetches}}]}),device.createBindGroup({layout:pipeline.getBindGroupLayout(2),entries:[]})];
  const t=m.texture,texture=device.createTexture({label:`${m.draw}/texture`,size:[t.width,t.height,1],format:t.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});resources.push(texture);
  device.queue.writeTexture({texture},await get('texture.bin'),{bytesPerRow:t.bytesPerRow,rowsPerImage:t.rowsPerImage},[t.width,t.height,1]);
  const view=texture.createView({dimension:'2d-array'}),s=m.sampler,address=['repeat','mirror-repeat','clamp-to-edge'];
  const sampler=device.createSampler({magFilter:s.mag?'linear':'nearest',minFilter:s.min?'linear':'nearest',mipmapFilter:s.mip?'linear':'nearest',addressModeU:address[s.clampX],addressModeV:address[s.clampY]});
  groups.push(device.createBindGroup({layout:pipeline.getBindGroupLayout(3),entries:[{binding:0,resource:view},{binding:1,resource:view},{binding:2,resource:sampler}]}));
  const encoder=device.createCommandEncoder({label:`draw${m.draw}`}),first=out.length===0;
  const pass=encoder.beginRenderPass({label:`draw${m.draw}`,colorAttachments:[{view:target.createView(),clearValue:[0,0,0,0],loadOp:first?'clear':'load',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:first?'clear':'load',depthStoreOp:'store',depthClearValue:1}});
  pass.setPipeline(pipeline);groups.forEach((g,i)=>pass.setBindGroup(i,g));pass.setViewport(0,0,W,H,0,1);pass.setScissorRect(0,0,W,H);pass.setIndexBuffer(indices,'uint32');pass.drawIndexed(m.indices);pass.end();device.queue.submit([encoder.finish()]);
  out.push({draw:m.draw,rgba:perDraw?await readback():null});
 }
 const final=await readback();
 if(present){
  // Optional: copy the final target to a WebGPU canvas so native replays have a
  // presented frame (screenshot-capable tools key on present).
  const enc=device.createCommandEncoder({label:'present'});enc.copyTextureToTexture({texture:target},{texture:ctx.getCurrentTexture()},[W,H]);device.queue.submit([enc.finish()]);
 }
 const validation=await device.popErrorScope();if(validation)errors.push('validation: '+validation.message);
 await device.queue.onSubmittedWorkDone();
 resources.forEach(r=>r.destroy());
 const info=adapter.info?{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description}:null;
 device.destroy();
 return {draws:out,final,errors,adapter:info};
}
