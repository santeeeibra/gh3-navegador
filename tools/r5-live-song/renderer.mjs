// Selected original song shader pairs on an isolated target.
const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha'};
const ops=['add','subtract','min','max','reverse-subtract'];
const compares=['never','less','equal','less-equal','greater','not-equal','greater-equal','always'];
const stencilOps=['keep','zero','replace','increment-clamp','decrement-clamp','invert','increment-wrap','decrement-wrap'];
export async function createSongRenderer(device,shaders){
 const modules={},bindings={};
 for(const [id,s] of Object.entries(shaders)){
  modules[id]=device.createShaderModule({code:s.code});
  const errors=(await modules[id].getCompilationInfo()).messages.filter(m=>m.type==='error');
  if(errors.length)throw Error(id+': '+errors.map(e=>e.message).join(';'));
  bindings[id]=[...s.code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/g)].filter(m=>s.code.split(m[3]).length>2).map(m=>({group:+m[1],binding:+m[2],name:m[3],type:m[4]}));
 }
 const target=device.createTexture({size:[1280,720],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
 const depth=device.createTexture({size:[1280,720],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
 const pipelines=new Map();let initialized=false;
 async function pipeline(m){
  const key=JSON.stringify([m.vs,m.ps,m.blend,m.raster,m.depth,m.stencil]);if(pipelines.has(key))return pipelines.get(key);
  const b=m.blend,d=m.depth,st=m.stencil;
  const blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
  if(Object.values(blend.color).includes(undefined)||Object.values(blend.alpha).includes(undefined))throw Error('Unsupported blend');
  const front=d&1?{compare:compares[d>>>8&7],failOp:stencilOps[d>>>11&7],passOp:stencilOps[d>>>14&7],depthFailOp:stencilOps[d>>>17&7]}:{compare:'always'};
  const p=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules[m.vs],entryPoint:'main'},fragment:{module:modules[m.ps],entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:15}]},primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':'none'},depthStencil:{format:'depth24plus-stencil8',depthWriteEnabled:!!(d&4),depthCompare:d&2?compares[d>>>4&7]:'always',stencilFront:front,stencilBack:front,stencilReadMask:st>>>8&255,stencilWriteMask:st>>>16&255}});
  pipelines.set(key,p);return p;
 }
 async function render(inputs,{context=null}={}){
  const owned=[];
  try{
   for(const [i,input] of inputs.entries()){
    const m=input.manifest,a=input.assets,p=await pipeline(m),buffers={};
    for(const [name,bytes] of Object.entries(a))if(name!=='texture.bin'){
     const usage=name==='memory.bin'?GPUBufferUsage.STORAGE:name==='indices.bin'?GPUBufferUsage.INDEX:GPUBufferUsage.UNIFORM;
     const b=device.createBuffer({size:Math.max(4,(bytes.length+3)&~3),usage:usage|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(b,0,bytes);buffers[name]=b;owned.push(b);
    }
    const t=m.texture,texture=device.createTexture({size:[t.width,t.height],format:t.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});owned.push(texture);
    device.queue.writeTexture({texture},a['texture.bin'],{bytesPerRow:t.bytesPerRow,rowsPerImage:t.rowsPerImage},[t.width,t.height]);
    const view=texture.createView({dimension:'2d-array'}),q=m.sampler,addresses=['repeat','mirror-repeat','clamp-to-edge'];
    const sampler=device.createSampler({magFilter:q.mag?'linear':'nearest',minFilter:q.min?'linear':'nearest',mipmapFilter:q.mip?'linear':'nearest',addressModeU:addresses[q.clampX],addressModeV:addresses[q.clampY]});
    const groups=new Map();
    const used=new Map([...bindings[m.vs],...bindings[m.ps]].map(b=>[b.group+':'+b.binding,b]));
    for(const b of used.values()){
     const names={xe_shared_memory:'memory.bin',xe_system_constants:'system.bin',xe_float_constants_vs:'float-vs.bin',xe_float_constants_ps:'float-ps.bin',xe_bool_loop_constants:'bool.bin',xe_fetch_constants:'fetch.bin'};
     const bufferName=b.group===0&&b.binding===0?'memory.bin':b.group===1?['system.bin','float-vs.bin','float-ps.bin','bool.bin','fetch.bin'][b.binding]:null;let resource;if(bufferName)resource={buffer:buffers[bufferName]};else if(b.type.startsWith('sampler'))resource=sampler;else if(b.type.startsWith('texture_'))resource=view;else throw Error('Unknown binding '+b.name);
     if(!groups.has(b.group))groups.set(b.group,[]);groups.get(b.group).push({binding:b.binding,resource});
    }
    const e=device.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,1],loadOp:i===0?'clear':'load',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:i===0?'clear':'load',depthStoreOp:'store',depthClearValue:1,stencilLoadOp:i===0?'clear':'load',stencilStoreOp:'store',stencilClearValue:0}});
    pass.setPipeline(p);for(let g=0;g<=Math.max(...groups.keys());g++)pass.setBindGroup(g,device.createBindGroup({layout:p.getBindGroupLayout(g),entries:groups.get(g)||[]}));
    pass.setStencilReference(m.stencil&255);pass.setIndexBuffer(buffers['indices.bin'],'uint32');pass.drawIndexed(m.indices);pass.end();device.queue.submit([e.finish()]);initialized=true;
   }
   if(context&&initialized){const e=device.createCommandEncoder();e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[1280,720]);device.queue.submit([e.finish()]);}
   await device.queue.onSubmittedWorkDone();return {draws:inputs.length,pipelines:pipelines.size};
  }finally{owned.forEach(r=>r.destroy());}
 }
 return {render,dispose(){target.destroy();depth.destroy();}};
}
