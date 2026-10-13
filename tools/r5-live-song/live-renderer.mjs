// Persistent WebGPU resources and one command submission per original frame.
const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha',12:'constant',13:'one-minus-constant',14:'src-alpha-saturated'};
const ops=['add','subtract','min','max','reverse-subtract'],compares=['never','less','equal','less-equal','greater','not-equal','greater-equal','always'],stencilOps=['keep','zero','replace','increment-clamp','decrement-clamp','invert','increment-wrap','decrement-wrap'];
export async function createLiveSongRenderer(device,shaders,{prepareTexture=t=>t}={}){
 const modules={},bindings={},pipelines=new Map(),slots=[],textures=new Map(),samplers=new Map();let frame=0;
 const stats={frames:0,draws:0,pipelineBuilds:0,bufferBuilds:0,textureUploads:0,readbacks:0,rejectedPipelines:{}};
 for(const [id,s] of Object.entries(shaders)){modules[id]=device.createShaderModule({label:id,code:s.code});bindings[id]=[...s.code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/g)].filter(m=>s.code.split(m[3]).length>2).map(m=>({group:+m[1],binding:+m[2],name:m[3],type:m[4]}));}
 const target=device.createTexture({size:[1280,720],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}),depth=device.createTexture({size:[1280,720],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
 function pipeline(m){
  const key=JSON.stringify([m.vs,m.ps,m.blend,m.raster&7,m.depth,m.stencil>>>8,m.writeMask]);if(pipelines.has(key))return pipelines.get(key);
  const promise=(async()=>{
   const b=m.blend,d=m.depth,st=m.stencil,blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
   if(Object.values(blend.color).includes(undefined)||Object.values(blend.alpha).includes(undefined))throw Error('Blend unsupported');
   for(const part of [blend.color,blend.alpha])if(part.operation==='min'||part.operation==='max')part.srcFactor=part.dstFactor='one';
   const front=d&1?{compare:compares[d>>>8&7],failOp:stencilOps[d>>>11&7],passOp:stencilOps[d>>>14&7],depthFailOp:stencilOps[d>>>17&7]}:{compare:'always'};
   const p=await device.createRenderPipelineAsync({label:m.vs+'/'+m.ps,layout:'auto',vertex:{module:modules[m.vs],entryPoint:'main'},fragment:{module:modules[m.ps],entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:m.writeMask}]},primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':(m.raster&3)===1?'front':'none'},depthStencil:{format:'depth24plus-stencil8',depthWriteEnabled:!!(d&4),depthCompare:d&2?compares[d>>>4&7]:'always',stencilFront:front,stencilBack:front,stencilReadMask:st>>>8&255,stencilWriteMask:st>>>16&255}});
   p.cacheId=++stats.pipelineBuilds;return p;
  })().catch(e=>{stats.rejectedPipelines[key]=e.message;return null;});pipelines.set(key,promise);return promise;
 }
 function texture(t){let gpu=textures.get(t.key);if(!gpu){const u=prepareTexture(t);gpu=device.createTexture({size:[u.width,u.height],format:u.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});device.queue.writeTexture({texture:gpu},u.data,{bytesPerRow:u.bytesPerRow,rowsPerImage:u.rowsPerImage},[u.width,u.height]);gpu.view=gpu.createView({dimension:'2d-array'});textures.set(t.key,gpu);gpu.cacheId=++stats.textureUploads;}else if(t.video&&gpu.used!==frame){const u=prepareTexture(t);device.queue.writeTexture({texture:gpu},u.data,{bytesPerRow:u.bytesPerRow,rowsPerImage:u.rowsPerImage},[u.width,u.height]);}gpu.used=frame;return gpu;}
 function slot(i,input,p){
  let s=slots[i];if(!s)s=slots[i]={buffers:{},groupKey:null};
  for(const [name,b] of Object.entries(input.assets))if(!s.buffers[name]||s.buffers[name].size<b.length){s.buffers[name]?.destroy();s.buffers[name]=device.createBuffer({size:Math.max(16,2**Math.ceil(Math.log2(Math.max(1,b.length)))),usage:GPUBufferUsage.COPY_DST|(name==='memory.bin'?GPUBufferUsage.STORAGE:name==='indices.bin'?GPUBufferUsage.INDEX:GPUBufferUsage.UNIFORM)});s.groupKey=null;stats.bufferBuilds++;}
  for(const [name,b] of Object.entries(input.assets))device.queue.writeBuffer(s.buffers[name],0,b);
  const groupKey=JSON.stringify([p.cacheId,input.textures.map(t=>[t.slot,texture(t.texture).cacheId,t.sampler])]);if(s.groupKey===groupKey)return s;
  const used=new Map([...bindings[input.manifest.vs],...bindings[input.manifest.ps]].map(b=>[b.group+':'+b.binding,b])),groups=new Map();
  for(const b of used.values()){
   const name=b.group===0&&b.binding===0?'memory.bin':b.group===1?['system.bin','float-vs.bin','float-ps.bin','bool.bin','fetch.bin'][b.binding]:null;let resource;
   if(name)resource={buffer:s.buffers[name]};else{
    const match=/xe_(?:texture|sampler)(\d+)/.exec(b.name),t=input.textures.find(t=>t.slot===Number(match?.[1]));if(!t)throw Error('Missing texture binding '+b.name);
    if(b.type==='sampler'){
     const q=t.sampler,k=JSON.stringify(q),a=['repeat','mirror-repeat','clamp-to-edge'];if(!samplers.has(k))samplers.set(k,device.createSampler({magFilter:q.mag?'linear':'nearest',minFilter:q.min?'linear':'nearest',mipmapFilter:q.mip?'linear':'nearest',addressModeU:a[q.clampX],addressModeV:a[q.clampY],lodMaxClamp:0}));resource=samplers.get(k);
    }else if(b.type.startsWith('texture_2d_array'))resource=texture(t.texture).view;else throw Error('Unsupported binding '+b.name);
   }
   if(!groups.has(b.group))groups.set(b.group,[]);groups.get(b.group).push({binding:b.binding,resource});
  }
  s.groups=Array.from({length:Math.max(...groups.keys())+1},(_,g)=>device.createBindGroup({layout:p.getBindGroupLayout(g),entries:groups.get(g)||[]}));s.groupKey=groupKey;return s;
 }
 return {stats,async render(inputs,context){
  frame++;const t0=performance.now(),ps=await Promise.all(inputs.map(i=>pipeline(i.manifest))),pipelineMs=performance.now()-t0,resourcesAt=performance.now(),ready=[],rejected={};
  for(let i=0;i<inputs.length;i++){if(!ps[i]){rejected.pipeline=(rejected.pipeline||0)+1;continue;}try{ready.push({input:inputs[i],p:ps[i],s:slot(i,inputs[i],ps[i])});}catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}}
  const resourceMs=performance.now()-resourcesAt,replayAt=performance.now();
  if(ready.length){
   const e=device.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,1],loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1,stencilLoadOp:'clear',stencilStoreOp:'store',stencilClearValue:0}});
   for(const {input,p,s} of ready){const m=input.manifest;pass.setPipeline(p);s.groups.forEach((g,i)=>pass.setBindGroup(i,g));pass.setStencilReference(m.stencil&255);pass.setScissorRect(...m.scissor);pass.setIndexBuffer(s.buffers['indices.bin'],'uint32');pass.drawIndexed(m.indices);stats.draws++;}pass.end();
   e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[1280,720]);device.queue.submit([e.finish()]);
  }
  const replayMs=performance.now()-replayAt,waitAt=performance.now();await device.queue.onSubmittedWorkDone();stats.frames++;
  for(const [key,g] of textures)if(frame-g.used>120){g.destroy();textures.delete(key);}
  return {accepted:ready.length,rejected,pipelineMs,resourceMs,replayMs,gpuWaitMs:performance.now()-waitAt,...stats};
 }};
}
