// Persistent WebGPU resources and one command submission per original frame.
const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha',12:'constant',13:'one-minus-constant',14:'src-alpha-saturated'};
const ops=['add','subtract','min','max','reverse-subtract'],compares=['never','less','equal','less-equal','greater','not-equal','greater-equal','always'],stencilOps=['keep','zero','replace','increment-clamp','decrement-clamp','invert','increment-wrap','decrement-wrap'];
export async function createLiveSongRenderer(device,shaders,{prepareTexture=t=>t,onPipeline=null}={}){
 const modules={},bindings={},pipelines=new Map(),slots=[],arenas={},textures=new Map(),samplers=new Map(),packed={};let frame=0,generation=0,cacheInputs=null,cacheReady=null,cacheRejected=null;
 const stats={frames:0,draws:0,pipelineBuilds:0,bufferBuilds:0,textureUploads:0,readbacks:0,rejectedPipelines:{}};
 function useShader(id){if(modules[id])return;const s=shaders[id];if(!s)throw Error("Shader missing "+id);stats.shaderBuilds=(stats.shaderBuilds||0)+1;modules[id]=device.createShaderModule({label:id,code:s.code});bindings[id]=[...s.code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]*>)?\s+(\w+)\s*:\s*([^;]+);/g)].filter(m=>s.code.split(m[3]).length>2).map(m=>({group:+m[1],binding:+m[2],name:m[3],type:m[4]}));}
 // Claude 2026-10-13 (gobernador móvil): la escala de render cambia en marcha (1 = 1280×720, .75 = 960×540,
 // .5 = 640×360) con configure(). Reconstrucción espacial sencilla con nitidez moderada, sin filtros temporales que
 // dejen rastro en notas rápidas. Presupuesto de texturas inactivas configurable. Bajo presión no se convierten ni
 // suben texturas NUEVAS de dibujos de escena no esenciales (manifest.essential = pista/notas/colas/HUD): ese dibujo
 // se omite hasta que pase la presión; lo esencial nunca se omite por esto.
 const options=globalThis.__r5Options||{},cfg={scale:[0.5,0.75].includes(options.renderScale)?options.renderScale:1,gpuTextureBytes:67108864,deferSceneUploads:false,keepTextures:false};
 let scale=cfg.scale,renderWidth=1280,renderHeight=720,target=null,depth=null,upscalePipeline=null,upscaleGroup=null,upscaleSampler=null,upscaleReady=null;
 function upscale(){return upscaleReady??=(async()=>{
  const module=device.createShaderModule({label:'scene-upscale',code:`
   @group(0) @binding(0) var image:texture_2d<f32>;
   @group(0) @binding(1) var filtering:sampler;
   struct V { @builtin(position) p:vec4<f32>, @location(0) uv:vec2<f32> }
   @vertex fn vs(@builtin(vertex_index) i:u32)->V {let p=array<vec2<f32>,3>(vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.))[i];return V(vec4(p,0.,1.),vec2((p.x+1.)*.5,(1.-p.y)*.5));}
   @fragment fn fs(v:V)->@location(0) vec4<f32>{
    let size=vec2<f32>(textureDimensions(image));let px=1./size;
    let c=textureSampleLevel(image,filtering,v.uv,0.);
    let n=textureSampleLevel(image,filtering,v.uv+vec2(px.x,0.),0.)+textureSampleLevel(image,filtering,v.uv-vec2(px.x,0.),0.)+textureSampleLevel(image,filtering,v.uv+vec2(0.,px.y),0.)+textureSampleLevel(image,filtering,v.uv-vec2(0.,px.y),0.);
    let amount=select(.25,.15,size.x>800.);
    return vec4(clamp(c.rgb+(c.rgb*4.-n.rgb)*amount,vec3(0.),vec3(1.)),1.);}`});
  upscaleSampler=device.createSampler({minFilter:'linear',magFilter:'linear'});
  upscalePipeline=await device.createRenderPipelineAsync({label:'scene-upscale',layout:'auto',vertex:{module,entryPoint:'vs'},fragment:{module,entryPoint:'fs',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-list'}});
 })();}
 function allocateTargets(){
  target?.destroy();depth?.destroy();upscaleGroup=null;renderWidth=Math.round(1280*scale);renderHeight=Math.round(720*scale);
  target=device.createTexture({size:[renderWidth,renderHeight],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.TEXTURE_BINDING});depth=device.createTexture({size:[renderWidth,renderHeight],format:'depth24plus-stencil8',usage:GPUTextureUsage.RENDER_ATTACHMENT});
  stats.scale=scale;stats.renderWidth=renderWidth;stats.renderHeight=renderHeight;
 }
 if(scale!==1)await upscale();
 allocateTargets();
 // Se llama en cada cuadro del worker: no hace nada si no cambió. La escala nueva se aplica entre cuadros y, si
 // necesita el pipeline de reescalado, recién cuando está compilado (mientras tanto sigue la escala anterior).
 function configure(next={}){
  if(next.gpuTextureBytes>0)cfg.gpuTextureBytes=next.gpuTextureBytes;
  if('deferSceneUploads' in next)cfg.deferSceneUploads=!!next.deferSceneUploads;
  if('keepTextures' in next)cfg.keepTextures=!!next.keepTextures;
  if([0.5,0.75,1].includes(next.scale))cfg.scale=next.scale;
  if(cfg.scale===scale)return;
  if(cfg.scale!==1&&!upscalePipeline){if(!stats.upscaleError)upscale().catch(e=>{stats.upscaleError=String(e?.message||e);});return;}
  scale=cfg.scale;allocateTargets();stats.scaleChanges=(stats.scaleChanges||0)+1;
 }
 const scaledScissor=s=>{const x=Math.floor(s[0]*scale),y=Math.floor(s[1]*scale);return [x,y,Math.min(renderWidth,Math.ceil((s[0]+s[2])*scale))-x,Math.min(renderHeight,Math.ceil((s[1]+s[3])*scale))-y];};

 // Claude 2026-10-13 (precarga): onPipeline(m, preload) avisa cada pipeline compilado; prebuild() lo usa preload.mjs.
 const pipelineKey=m=>JSON.stringify([m.vs,m.ps,m.blend,m.raster&7,m.depth,m.stencil>>>8,m.writeMask]);
 function pipeline(m,preload=false){
  useShader(m.vs);useShader(m.ps);
  const key=pipelineKey(m);if(pipelines.has(key))return pipelines.get(key);
  const promise=(async()=>{
   const b=m.blend,d=m.depth,st=m.stencil,blend={color:{srcFactor:factors[b&31],dstFactor:factors[b>>>8&31],operation:ops[b>>>5&7]},alpha:{srcFactor:factors[b>>>16&31],dstFactor:factors[b>>>24&31],operation:ops[b>>>21&7]}};
   if(Object.values(blend.color).includes(undefined)||Object.values(blend.alpha).includes(undefined))throw Error('Blend unsupported');
   for(const part of [blend.color,blend.alpha])if(part.operation==='min'||part.operation==='max')part.srcFactor=part.dstFactor='one';
   const front=d&1?{compare:compares[d>>>8&7],failOp:stencilOps[d>>>11&7],passOp:stencilOps[d>>>14&7],depthFailOp:stencilOps[d>>>17&7]}:{compare:'always'};
   const p=await device.createRenderPipelineAsync({label:m.vs+'/'+m.ps,layout:'auto',vertex:{module:modules[m.vs],entryPoint:'main'},fragment:{module:modules[m.ps],entryPoint:'main',targets:[{format:'rgba8unorm',blend,writeMask:m.writeMask}]},primitive:{topology:'triangle-list',frontFace:m.raster&4?'cw':'ccw',cullMode:(m.raster&3)===2?'back':(m.raster&3)===1?'front':'none'},depthStencil:{format:'depth24plus-stencil8',depthWriteEnabled:!!(d&4),depthCompare:d&2?compares[d>>>4&7]:'always',stencilFront:front,stencilBack:front,stencilReadMask:st>>>8&255,stencilWriteMask:st>>>16&255}});
   p.cacheId=++stats.pipelineBuilds;if(preload)stats.preloadBuilds=(stats.preloadBuilds||0)+1;try{onPipeline?.(m,preload);}catch{}return p;
  })().catch(e=>{stats.rejectedPipelines[key]=e.message;return null;});pipelines.set(key,promise);return promise;
 }
 function texture(t,defer=false){let gpu=textures.get(t.key);if(!gpu&&defer&&t.scene&&!t.video){stats.sceneDeferred=(stats.sceneDeferred||0)+1;throw Error('Scene upload deferred');}if(!gpu){const u=prepareTexture(t);gpu=device.createTexture({size:[u.width,u.height,u.layers||1],format:u.format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});device.queue.writeTexture({texture:gpu},u.data,{bytesPerRow:u.bytesPerRow,rowsPerImage:u.rowsPerImage},[u.width,u.height,u.layers||1]);gpu.view=gpu.createView({dimension:u.cube?'cube':'2d-array'});textures.set(t.key,gpu);gpu.cacheId=++stats.textureUploads;gpu.revision=t.revision;gpu.byteSize=u.data.byteLength;stats.residentTextureBytes=(stats.residentTextureBytes||0)+gpu.byteSize;}else if((t.video||t.revision!==gpu.revision)&&gpu.used!==frame){if(defer&&t.scene){stats.sceneDeferred=(stats.sceneDeferred||0)+1;gpu.used=frame;return gpu;}const u=prepareTexture(t);device.queue.writeTexture({texture:gpu},u.data,{bytesPerRow:u.bytesPerRow,rowsPerImage:u.rowsPerImage},[u.width,u.height,u.layers||1]);}gpu.revision=t.revision;gpu.used=frame;return gpu;}
 function prepareArenas(inputs){
  let changed=false;
  // Draw slots change roles between movie/menu/gameplay. Keeping every slot's
  // historical maximum produces huge holes even when the active frame is small.
  let wanted=0,reserved=0;
  for(const [i,input] of inputs.entries())for(const [name,bytes] of Object.entries(input.assets)){const n=Math.max(256,Math.ceil(bytes.length/256)*256);wanted+=n;reserved+=slots[i]?.capacities[name]||n;}
  if(reserved>wanted*2){for(const [i,input] of inputs.entries())if(slots[i])for(const [name,bytes] of Object.entries(input.assets))slots[i].capacities[name]=Math.max(256,Math.ceil(bytes.length/256)*256);changed=true;stats.layoutCompactions=(stats.layoutCompactions||0)+1;}
  if(slots.length>inputs.length){slots.length=inputs.length;changed=true;}
  for(const [i,input] of inputs.entries()){
   let slot=slots[i];if(!slot){slot=slots[i]={capacities:{},offsets:{},buffers:{}};changed=true;}
   for(const [name,bytes] of Object.entries(input.assets))if(!slot.capacities[name]||slot.capacities[name]<bytes.length){slot.capacities[name]=Math.max(256,Math.ceil(bytes.length/256)*256);changed=true;}
  }
  if(changed){
   generation++;const extents={};
   for(const slot of slots)for(const [name,size] of Object.entries(slot.capacities)){slot.offsets[name]=extents[name]||0;extents[name]=(extents[name]||0)+size;}
   for(const [name,size] of Object.entries(extents))if(!arenas[name]||arenas[name].size<size||(arenas[name].size>4*1024*1024&&arenas[name].size>size*4)){arenas[name]?.destroy();arenas[name]=device.createBuffer({size:Math.max(256,2**Math.ceil(Math.log2(size))),usage:GPUBufferUsage.COPY_DST|(name==='memory.bin'?GPUBufferUsage.STORAGE:name==='indices.bin'?GPUBufferUsage.INDEX:GPUBufferUsage.UNIFORM)});stats.bufferBuilds++;}
   for(const slot of slots)slot.buffers=arenas;
  }
  for(const [name,buffer] of Object.entries(arenas))if(!packed[name]||packed[name].length!==buffer.size)packed[name]=new Uint8Array(buffer.size);
  for(const [i,input] of inputs.entries())for(const [name,bytes] of Object.entries(input.assets))packed[name].set(bytes,slots[i].offsets[name]);
  const ends={};for(const [i,input] of inputs.entries())for(const [name,bytes] of Object.entries(input.assets))ends[name]=Math.max(ends[name]||0,slots[i].offsets[name]+bytes.byteLength);
  for(const [name,end] of Object.entries(ends)){device.queue.writeBuffer(arenas[name],0,packed[name].buffer,0,end);stats.uploadBytes=(stats.uploadBytes||0)+end;}
  stats.bufferBytes=Object.values(arenas).reduce((n,b)=>n+b.size,0);stats.frameAssetBytes=wanted;stats.arenaBytes=Object.fromEntries(Object.entries(arenas).map(([n,b])=>[n,b.size]));
 }
 // Resource identities, pipelines and bind groups stay fixed between snapshots.
 // Repack only changed asset classes; keep staging arrays instead of allocating
 // arena-sized arrays sixty times per second.
 function updateAssets(inputs,dirty){
  const ranges=new Map();
  for(const [i,list] of dirty)for(const name of list){const bytes=inputs[i].assets[name],o=slots[i].offsets[name];packed[name].set(bytes,o);let r=ranges.get(name);if(!r)ranges.set(name,r={lo:o,hi:o+bytes.byteLength});else{r.lo=Math.min(r.lo,o);r.hi=Math.max(r.hi,o+bytes.byteLength);}}
  for(const [name,r] of ranges){device.queue.writeBuffer(arenas[name],r.lo,packed[name].buffer,r.lo,r.hi-r.lo);stats.uploadBytes=(stats.uploadBytes||0)+r.hi-r.lo;}
 }
 function slot(i,input,p){
  const s=slots[i],defer=cfg.deferSceneUploads&&!input.manifest.essential&&!input.manifest.video;
  const groupKey=JSON.stringify([generation,p.cacheId,input.textures.map(t=>[t.slot,texture(t.texture,defer).cacheId,t.sampler])]);if(s.groupKey===groupKey)return s;
  const used=new Map([...bindings[input.manifest.vs],...bindings[input.manifest.ps]].map(b=>[b.group+':'+b.binding,b])),groups=new Map();
  for(const b of used.values()){
   const name=b.group===0&&b.binding===0?'memory.bin':b.group===1?['system.bin','float-vs.bin','float-ps.bin','bool.bin','fetch.bin'][b.binding]:null;let resource;
   if(name)resource={buffer:s.buffers[name],offset:s.offsets[name],size:s.capacities[name]};else{
    const match=/xe_(?:texture|sampler)(\d+)/.exec(b.name),t=input.textures.find(t=>t.slot===Number(match?.[1]));if(!t)throw Error('Missing texture binding '+b.name);
    if(b.type==='sampler'){
     const q=t.sampler,k=JSON.stringify(q),a=['repeat','mirror-repeat','clamp-to-edge'];if(!samplers.has(k))samplers.set(k,device.createSampler({magFilter:q.mag?'linear':'nearest',minFilter:q.min?'linear':'nearest',mipmapFilter:q.mip?'linear':'nearest',addressModeU:a[q.clampX],addressModeV:a[q.clampY],lodMaxClamp:0}));resource=samplers.get(k);
    }else if((b.type.startsWith('texture_2d_array')||b.type.startsWith('texture_cube')))resource=texture(t.texture,defer).view;else throw Error('Unsupported binding '+b.name);
   }
   if(!groups.has(b.group))groups.set(b.group,[]);groups.get(b.group).push({binding:b.binding,resource});
  }
  s.groups=Array.from({length:Math.max(...groups.keys())+1},(_,g)=>device.createBindGroup({layout:p.getBindGroupLayout(g),entries:groups.get(g)||[]}));s.groupKey=groupKey;return s;
 }
 return {stats,configure,prewarm(inputs){return Promise.all(inputs.map(i=>pipeline(i.manifest)));},has:m=>pipelines.has(pipelineKey(m)),prebuild(m){try{return pipeline(m,true).then(p=>!!p);}catch{return Promise.resolve(false);}},async render(inputs,context,{dirty=new Map(),reuse=false}={}){
  frame++;const t0=performance.now();let ready,rejected,pipelineMs=0;
  const cached=reuse&&inputs===cacheInputs&&cacheReady;
  if(!cached){
   const ps=await Promise.all(inputs.map(i=>pipeline(i.manifest)));pipelineMs=performance.now()-t0;
   ready=[];rejected={};prepareArenas(inputs);
   for(let i=0;i<inputs.length;i++){if(!ps[i]){rejected.pipeline=(rejected.pipeline||0)+1;continue;}try{ready.push({input:inputs[i],p:ps[i],s:slot(i,inputs[i],ps[i])});}catch(e){rejected[e.message]=(rejected[e.message]||0)+1;}}
   cacheInputs=inputs;cacheReady=ready;cacheRejected=rejected;
   stats.snapshotPreparations=(stats.snapshotPreparations||0)+1;
  }else{
   ready=cacheReady;rejected=cacheRejected;updateAssets(inputs,dirty);
   for(const {input} of ready)for(const t of input.textures){const gpu=textures.get(t.texture.key);if(gpu)gpu.used=frame;}
   stats.cachedReplays=(stats.cachedReplays||0)+1;
  }
  const resourcesAt=t0+pipelineMs;
  const resourceMs=performance.now()-resourcesAt,replayAt=performance.now();
  if(ready.length){
   const e=device.createCommandEncoder(),pass=e.beginRenderPass({colorAttachments:[{view:target.createView(),clearValue:[0,0,0,1],loadOp:'clear',storeOp:'store'}],depthStencilAttachment:{view:depth.createView(),depthLoadOp:'clear',depthStoreOp:'store',depthClearValue:1,stencilLoadOp:'clear',stencilStoreOp:'store',stencilClearValue:0}});
   for(const {input,p,s} of ready){const m=input.manifest;pass.setPipeline(p);s.groups.forEach((g,i)=>pass.setBindGroup(i,g));pass.setStencilReference(m.stencil&255);pass.setScissorRect(...scaledScissor(m.scissor));pass.setIndexBuffer(s.buffers['indices.bin'],'uint32',s.offsets['indices.bin'],input.assets['indices.bin'].length);pass.drawIndexed(m.indices);stats.draws++;}pass.end();
   if(scale===1)e.copyTextureToTexture({texture:target},{texture:context.getCurrentTexture()},[1280,720]);else{
    upscaleGroup??=device.createBindGroup({layout:upscalePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:target.createView()},{binding:1,resource:upscaleSampler}]});
    const blit=e.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});blit.setPipeline(upscalePipeline);blit.setBindGroup(0,upscaleGroup);blit.draw(3);blit.end();
   }try{device.queue.submit([e.finish()]);}catch(error){stats.gpuErrors=(stats.gpuErrors||0)+1;stats.lastGpuError=String(error?.message||error||'GPU submission failed');for(const t of textures.values())t.destroy();textures.clear();cacheInputs=null;cacheReady=null;stats.residentTextureBytes=0;stats.frames++;return {accepted:0,rejected:{'GPU submission failed':ready.length},pipelineMs,resourceMs,replayMs:performance.now()-replayAt,gpuWaitMs:0,...stats};}
  }
  const replayMs=performance.now()-replayAt,waitAt=performance.now();await device.queue.onSubmittedWorkDone();stats.frames++;
  for(const [key,g] of [...textures].sort((a,b)=>a[1].used-b[1].used))if(g.used!==frame&&((frame-g.used>120&&!cfg.keepTextures)||(stats.residentTextureBytes||0)>cfg.gpuTextureBytes)){g.destroy();textures.delete(key);stats.residentTextureBytes-=g.byteSize;stats.textureEvictions=(stats.textureEvictions||0)+1;}
  stats.textureBudgetBytes=cfg.gpuTextureBytes;stats.textureOverBudgetBytes=Math.max(0,(stats.residentTextureBytes||0)-cfg.gpuTextureBytes);
  return {accepted:ready.length,rejected,pipelineMs,resourceMs,replayMs,gpuWaitMs:performance.now()-waitAt,...stats};
 }};
}
