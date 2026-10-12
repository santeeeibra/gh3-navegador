// Persistent partial menu renderer. Does not reconstruct missing DRAW/COPY.
const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha'};
const ops={0:'add',1:'subtract',2:'min',3:'max',4:'reverse-subtract'};
const same=(a,b)=>a?.length===b.length&&a.every((v,i)=>v===b[i]);
export async function createMenuRenderer(device,{vertexWGSL,fragmentWGSL,width=1280,height=720}){
 if(width!==1280||height!==720)throw Error('Menu renderer: unsupported dimensions');
 const shaders=[device.createShaderModule({code:vertexWGSL}),device.createShaderModule({code:fragmentWGSL})];
 const messages=(await Promise.all(shaders.map(s=>s.getCompilationInfo()))).flatMap(s=>s.messages);
 if(messages.some(m=>m.type==='error'))throw Error('Menu shader compilation failed');
 const target=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const depth=device.createTexture({size:[width,height],format:'depth32float',usage:GPUTextureUsage.RENDER_ATTACHMENT});
 const pipelines=new Map(),slots=[];
 const stats={frames:0,draws:0,pipelineBuilds:0,slotBuilds:0,textureUploads:0,textureReuses:0,readbacks:0};
 let busy=false,disposed=false,initialized=false;
 async function pipeline(m){
  const key=JSON.stringify([m.blend,m.raster]);
  if(pipelines.has(key))return pipelines.get(key);
  if(pipelines.size>=64)throw Error('Menu pipeline limit');
  const b=m.blend,blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
  if(Object.values(blend.color).includes(undefined)||Object.values(blend.alpha).includes(undefined))throw Error('Unsupported menu blending');
  const p=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shaders[0],entryPoint:'main'},fragment:{module:shaders[1],entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:15}]},primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':'none'},depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
  pipelines.set(key,p);stats.pipelineBuilds++;return p;
 }
 function destroySlot(s){if(!s)return;for(const b of Object.values(s.buffers))b.destroy();s.texture.destroy();}
 function slot(i,p,input){
  const {manifest:m,assets}=input,t=m.texture;
  const key=JSON.stringify([m.texture,m.sampler,Object.entries(assets).filter(([n])=>n!=='texture.bin').map(([n,b])=>[n,b.length])]);
  let s=slots[i];
  if(!s||s.key!==key||s.pipeline!==p){
   destroySlot(s);
   const buffers={};
   for(const [name,usage] of Object.entries({'memory.bin':GPUBufferUsage.STORAGE,'system.bin':GPUBufferUsage.UNIFORM,'float-vs.bin':GPUBufferUsage.UNIFORM,'fetch.bin':GPUBufferUsage.UNIFORM,'indices.bin':GPUBufferUsage.INDEX})){
    buffers[name]=device.createBuffer({size:Math.max(4,(assets[name].length+3)&~3),usage:usage|GPUBufferUsage.COPY_DST});
   }
   const texture=device.createTexture({size:[t.width,t.height,1],format:t.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
   const view=texture.createView({dimension:'2d-array'}),a=['repeat','mirror-repeat','clamp-to-edge'],q=m.sampler;
   const sampler=device.createSampler({magFilter:q.mag?'linear':'nearest',minFilter:q.min?'linear':'nearest',mipmapFilter:q.mip?'linear':'nearest',addressModeU:a[q.clampX],addressModeV:a[q.clampY]});
   const group=(g,entries)=>device.createBindGroup({layout:p.getBindGroupLayout(g),entries});
   const binding=(n,name)=>({binding:n,resource:{buffer:buffers[name]}});
   const groups=[group(0,[binding(0,'memory.bin')]),group(1,[binding(0,'system.bin'),binding(1,'float-vs.bin'),binding(4,'fetch.bin')]),group(2,[]),group(3,[{binding:0,resource:view},{binding:1,resource:view},{binding:2,resource:sampler}])];
   s=slots[i]={key,pipeline:p,buffers,texture,groups,textureBytes:null};stats.slotBuilds++;
  }
  for(const [name,b] of Object.entries(s.buffers))device.queue.writeBuffer(b,0,assets[name]);
  if(!same(s.textureBytes,assets['texture.bin'])){
   device.queue.writeTexture({texture:s.texture},assets['texture.bin'],{bytesPerRow:t.bytesPerRow,rowsPerImage:t.rowsPerImage},[t.width,t.height,1]);
   s.textureBytes=assets['texture.bin'].slice();stats.textureUploads++;
  }else stats.textureReuses++;
  return s;
 }
 async function render(inputs,{context=null}={}){
  if(disposed||busy)throw Error('Menu renderer unavailable');
  if(!Array.isArray(inputs)||inputs.length>512)throw Error('Menu draw limit');
  busy=true;
  try{
   if(inputs.length){
    const targetKey=JSON.stringify(inputs[0].manifest.target);
    if(inputs.some(i=>JSON.stringify(i.manifest.target)!==targetKey))throw Error('Mixed menu targets');
    for(const [i,input] of inputs.entries()){
     const p=await pipeline(input.manifest),s=slot(i,p,input),enc=device.createCommandEncoder();
     const pass=enc.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,0],loadOp:i===0?'clear':'load',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:i===0?'clear':'load',depthStoreOp:'store',depthClearValue:1}});
     pass.setPipeline(p);s.groups.forEach((g,k)=>pass.setBindGroup(k,g));pass.setViewport(0,0,width,height,0,1);pass.setScissorRect(0,0,width,height);pass.setIndexBuffer(s.buffers['indices.bin'],'uint32');pass.drawIndexed(input.manifest.indices);pass.end();device.queue.submit([enc.finish()]);stats.draws++;
    }
    // Submitted command buffers retain resources; release unused pool entries.
    for(let i=inputs.length;i<slots.length;i++)destroySlot(slots[i]);slots.length=inputs.length;
    initialized=true;
   }
   if(context&&initialized){const e=device.createCommandEncoder();e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[width,height]);device.queue.submit([e.finish()]);}
   await device.queue.onSubmittedWorkDone();stats.frames++;return {...stats,initialized};
  }finally{busy=false;}
 }
 return {stats,render,
  async readback(){
   if(disposed||busy||!initialized)throw Error('Readback unavailable');busy=true;
   const read=device.createBuffer({size:width*height*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
   try{const e=device.createCommandEncoder();e.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:width*4},[width,height]);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);stats.readbacks++;const bytes=new Uint8Array(read.getMappedRange()).slice();read.unmap();return bytes;}
   finally{read.destroy();busy=false;}
  },
  dispose(){if(busy)throw Error('Renderer busy');if(disposed)return;disposed=true;slots.forEach(destroySlot);target.destroy();depth.destroy();}
 };
}
