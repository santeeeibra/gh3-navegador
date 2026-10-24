// First validated intro case only; no CP or guest-address translation here.
// No fetch, document, canvas or window: usable on the CP worker GPU device.
function ownInput(input) {
  const m=structuredClone(input.manifest), assets={};
  const expected={'system-gpu.bin':528,'float-pixel.bin':80,'fetch.bin':768,'memory.bin':80};
  if(m.width!==1280||m.height!==720||m.textures?.length!==4)throw Error('Unsupported intro dimensions/resources');
  const slots=new Set();
  for(const t of m.textures){
    if(!Number.isInteger(t.texture)||t.texture<0||t.texture>3||slots.has(t.texture))throw Error('Invalid texture slots');
    slots.add(t.texture);const chroma=t.texture===1||t.texture===2;
    if(t.width!==(chroma?640:1280)||t.height!==(chroma?360:720)||t.format!==2||t.endian!==0)throw Error('Unsupported intro plane');
    expected['texture-'+t.texture+'.bin']=t.width*t.height;
  }
  // Own copies synchronously before the first await; no retained guest views.
  for(const [name,size] of Object.entries(expected)){
    const raw=input.assets[name];
    if(!(raw instanceof Uint8Array)||raw.byteLength!==size)throw Error('Invalid resource size: '+name);
    assets[name]=raw.slice();
  }
  if(assets['texture-3.bin'].some(v=>v!==255))throw Error('Translucent intro needs previous framebuffer');
  return {manifest:m,assets};
}

export async function createIntroRenderer(device, input) {
  const {manifest:m,assets}=ownInput(input);
  const vsCode=input.vertexWGSL,fsCode=input.fragmentWGSL;
  if(typeof vsCode!=='string'||typeof fsCode!=='string')throw Error('Missing shader source');
  const ownedBuffers=[],ownedTextures=[];let disposed=false;
  try {
  const shaders=[device.createShaderModule({code:vsCode}),device.createShaderModule({code:fsCode})];
  const messages=(await Promise.all(shaders.map(s=>s.getCompilationInfo()))).flatMap(x=>x.messages.map(v=>({type:v.type,message:v.message})));
  const factors={0:'zero',1:'one',4:'src',5:'one-minus-src',6:'src-alpha',7:'one-minus-src-alpha',8:'dst',9:'one-minus-dst',10:'dst-alpha',11:'one-minus-dst-alpha'};
  const ops={0:'add',1:'subtract',2:'min',3:'max',4:'reverse-subtract'};
  const b=m.blendRegister;
  const color={srcFactor:factors[b&31],dstFactor:factors[(b>>>8)&31],operation:ops[(b>>>5)&7]};
  const alpha={srcFactor:factors[(b>>>16)&31],dstFactor:factors[(b>>>24)&31],operation:ops[(b>>>21)&7]};
  if(Object.values(color).includes(undefined)||Object.values(alpha).includes(undefined)||m.depthRegister&7)throw Error('Unsupported blend/depth state');
  const rs=m.rasterRegister;
  const cullMode=(rs&3)===0?'none':(rs&3)===1?'front':(rs&3)===2?'back':null;
  if(!cullMode)throw Error('Both face culling not implemented');
  const pipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:shaders[0],entryPoint:'main'},
    fragment:{module:shaders[1],entryPoint:'main',targets:[{format:'rgba8unorm',blend:{color,alpha},writeMask:m.colorMask}]},
    primitive:{topology:'triangle-strip',frontFace:rs&4?'cw':'ccw',cullMode}});
  async function buffer(name,usage){const raw=assets[name];const v=device.createBuffer({size:Math.max(4,(raw.length+3)&~3),usage:usage|GPUBufferUsage.COPY_DST});ownedBuffers.push(v);device.queue.writeBuffer(v,0,raw);return v;}
  const system=await buffer('system-gpu.bin',GPUBufferUsage.UNIFORM);
  const floats=await buffer('float-pixel.bin',GPUBufferUsage.UNIFORM);
  const fetchConstants=await buffer('fetch.bin',GPUBufferUsage.UNIFORM);
  const memory=await buffer('memory.bin',GPUBufferUsage.STORAGE);
  const bg0=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:memory}}]});
  const bg1=device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:{buffer:system}},{binding:2,resource:{buffer:floats}},{binding:4,resource:{buffer:fetchConstants}}]});
  const bg2=device.createBindGroup({layout:pipeline.getBindGroupLayout(2),entries:[]});
  const textures=[],samplers=[],planes=[];
  const addressModes={0:'repeat',1:'mirror-repeat',2:'clamp-to-edge'};
  for(const t of m.textures){
    if(t.magFilter!==1||t.minFilter!==1||t.mipFilter!==1||!(t.clampX in addressModes)||!(t.clampY in addressModes))throw Error('Unsupported sampler snapshot');
    const texture=device.createTexture({size:[t.width,t.height,1],format:'r8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    const raw=assets['texture-'+t.texture+'.bin'];device.queue.writeTexture({texture},raw,{bytesPerRow:t.width,rowsPerImage:t.height},[t.width,t.height,1]);
    ownedTextures.push(texture);planes[t.texture]=texture; textures[t.texture]=texture.createView({dimension:'2d-array'});
    samplers[t.texture]=device.createSampler({magFilter:'linear',minFilter:'linear',mipmapFilter:'linear',addressModeU:addressModes[t.clampX],addressModeV:addressModes[t.clampY]});
  }
  const entries=[];
  // Descriptor order emitted by the original translator: texture fetches 0,2,1,3.
  for(const [i,slot] of [0,2,1,3].entries()){
    entries.push({binding:i*2,resource:textures[slot]},{binding:i*2+1,resource:textures[slot]},{binding:8+i,resource:samplers[slot]});
  }
  const bg3=device.createBindGroup({layout:pipeline.getBindGroupLayout(3),entries});
  const target=device.createTexture({size:[m.width,m.height],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const stride=(m.width*4+255)&~255;
  let drawing=false;
  const stateKey=JSON.stringify(m);
  function update(next){
    if(disposed)throw Error('Renderer disposed');
    if(drawing)throw Error('Draw already in flight');
    const owned=ownInput(next);
    if(JSON.stringify(owned.manifest)!==stateKey)throw Error('Renderer state changed');
    // Queue writes precede the next draw. No pipeline or resource reallocation.
    for(const [name,b] of [['system-gpu.bin',system],['float-pixel.bin',floats],['fetch.bin',fetchConstants],['memory.bin',memory]])device.queue.writeBuffer(b,0,owned.assets[name]);
    for(const t of m.textures)device.queue.writeTexture({texture:planes[t.texture]},owned.assets['texture-'+t.texture+'.bin'],{bytesPerRow:t.width,rowsPerImage:t.height},[t.width,t.height,1]);
  }
  function encode(view){
    const enc=device.createCommandEncoder();const pass=enc.beginRenderPass({colorAttachments:[{view,clearValue:{r:0,g:0,b:0,a:1},loadOp:'clear',storeOp:'store'}]});
    pass.setPipeline(pipeline);pass.setViewport(0,0,m.width,m.height,0,1);pass.setScissorRect(0,0,m.width,m.height);
    for(const [i,g] of [bg0,bg1,bg2,bg3].entries())pass.setBindGroup(i,g);
    pass.draw(4);pass.end();return enc;
  }
  async function draw(){
    if(drawing)throw Error('Draw already in flight');drawing=true;
    let read;
    try {
    read=device.createBuffer({size:stride*m.height,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const enc=encode(target.createView());enc.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:stride},[m.width,m.height]);
    device.queue.submit([enc.finish()]);await read.mapAsync(GPUMapMode.READ);
    const padded=new Uint8Array(read.getMappedRange()),rgba=new Uint8Array(m.width*m.height*4);
    for(let y=0;y<m.height;y++)rgba.set(padded.subarray(y*stride,y*stride+m.width*4),y*m.width*4);
    read.unmap();return rgba;
    } finally {read?.destroy();drawing=false;}
  }
  ownedTextures.push(target);
  function dispose(){if(disposed)return;disposed=true;for(const b of ownedBuffers)b.destroy();for(const t of ownedTextures)t.destroy();}
  return {messages,blend:{color,alpha},primitive:{cullMode,frontFace:rs&4?'cw':'ccw'},
    update,
    async present(context){
      if(disposed)throw Error('Renderer disposed');if(drawing)throw Error('Draw already in flight');drawing=true;
      try{device.queue.submit([encode(context.getCurrentTexture().createView()).finish()]);await device.queue.onSubmittedWorkDone();}
      finally{drawing=false;}
    },
    async draw(){if(disposed)throw Error('Renderer disposed');return draw();},
    writePixelConstants(raw){if(disposed)throw Error('Renderer disposed');if(!(raw instanceof Uint8Array)||raw.byteLength!==80)throw Error('Invalid pixel constants');device.queue.writeBuffer(floats,0,raw);},dispose};
  } catch(error){for(const b of ownedBuffers)b.destroy();for(const t of ownedTextures)t.destroy();throw error;}
}
