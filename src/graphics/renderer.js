import {renderPlan} from './profiles.js';
import {textureMipmaps,validateRGBA8} from './scene.js';
// Primer backend de dibujo/presentacion web. NO interpreta paquetes ni shaders Xenos.
// API: resize(profile, viewport), uploadTexture(RGBA8), draw(vertices clip XYZW/RGB/UV).
const stride=36;
function validateVertices(v){if(!(v instanceof Float32Array)||!v.length||v.length%27)throw Error('Se requieren triangulos de 9 floats por vertice');}
const wgsl=`
struct VertexOut { @builtin(position) position:vec4f, @location(0) color:vec3f, @location(1) uv:vec2f }
@vertex fn vertexMain(@location(0) position:vec4f,@location(1) color:vec3f,@location(2) uv:vec2f)->VertexOut {
 var out:VertexOut; out.position=position;out.color=color;out.uv=uv;return out;
}
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var imageSampler:sampler;
@fragment fn fragmentMain(v:VertexOut)->@location(0) vec4f {return textureSample(image,imageSampler,v.uv)*vec4f(v.color,1);}`;
class WebGPURenderer {
 constructor(canvas,adapter,device,onError,readback){
  this.canvas=canvas;this.device=device;this.readback=readback;this.metadata={adapter:{vendor:adapter.info?.vendor||'',architecture:adapter.info?.architecture||'',device:adapter.info?.device||'',description:adapter.info?.description||'',isFallbackAdapter:adapter.info?.isFallbackAdapter??adapter.isFallbackAdapter??null},limits:{maxBufferSize:device.limits.maxBufferSize,maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize},readback};this.backend='WebGPU';this.errors=[];this.disposed=false;this.pipelines=new Map();
  this.context=canvas.getContext('webgpu');if(!this.context)throw Error('No se pudo crear el contexto WebGPU');
  this.format=navigator.gpu.getPreferredCanvasFormat();
  this.context.configure({device,format:this.format,alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT|(readback?GPUTextureUsage.COPY_DST:0)});
  this.shader=device.createShaderModule({label:'Prueba grafica (no Xenos)',code:wgsl});
  this.errorListener=e=>{this.errors.push(e.error.message);onError?.(e.error.message);};device.addEventListener('uncapturederror',this.errorListener);
  device.lost.then(info=>{if(!this.disposed){const error='Dispositivo WebGPU perdido: '+info.message;this.errors.push(error);onError?.(error);}});
  this.limits={maxDimension:device.limits.maxTextureDimension2D,samples:[1,4],maxAnisotropy:16};
 }
 pipeline(samples){
  if(!this.pipelines.has(samples))this.pipelines.set(samples,this.device.createRenderPipeline({
   layout:'auto',vertex:{module:this.shader,entryPoint:'vertexMain',buffers:[{arrayStride:stride,attributes:[{shaderLocation:0,offset:0,format:'float32x4'},{shaderLocation:1,offset:16,format:'float32x3'},{shaderLocation:2,offset:28,format:'float32x2'}]}]},
   fragment:{module:this.shader,entryPoint:'fragmentMain',targets:[{format:this.format}]},
   primitive:{topology:'triangle-list',cullMode:'none'},depthStencil:{format:'depth24plus-stencil8',depthWriteEnabled:true,depthCompare:'less'},multisample:{count:samples}
  }));return this.pipelines.get(samples);
 }
 resize(profile,viewport){
  const plan=renderPlan(profile,{...viewport,...this.limits});
  if(JSON.stringify(plan)===JSON.stringify(this.plan))return this.plan;
  this.color?.destroy();this.depth?.destroy();this.msaa?.destroy();
  this.plan=plan;this.canvas.width=plan.width;this.canvas.height=plan.height;
  const size=[plan.width,plan.height];
  this.color=this.readback?this.device.createTexture({size,format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC}):null;
  this.depth=this.device.createTexture({size,format:'depth24plus-stencil8',sampleCount:plan.samples,usage:GPUTextureUsage.RENDER_ATTACHMENT});
  this.msaa=plan.samples>1?this.device.createTexture({size,format:this.format,sampleCount:plan.samples,usage:GPUTextureUsage.RENDER_ATTACHMENT}):null;
  this.currentPipeline=this.pipeline(plan.samples);this.updateBinding();return plan;
 }
 uploadTexture(texture){
  const levels=textureMipmaps(texture);this.image?.destroy();
  this.image=this.device.createTexture({size:[texture.width,texture.height],format:'rgba8unorm',mipLevelCount:levels.length,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
  levels.forEach((l,mipLevel)=>this.device.queue.writeTexture({texture:this.image,mipLevel},l.data,{bytesPerRow:l.width*4},[l.width,l.height]));
  this.updateBinding();
 }
 updateBinding(){
  if(!this.image||!this.plan)return;
  const sampler=this.device.createSampler({minFilter:'linear',magFilter:'linear',mipmapFilter:'linear',maxAnisotropy:this.plan.anisotropy});
  this.binding=this.device.createBindGroup({layout:this.currentPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.image.createView()},{binding:1,resource:sampler}]});
 }
 draw(vertices){
  validateVertices(vertices);if(!this.plan||!this.binding)throw Error('Falta configurar viewport/textura');
  if(!this.vertexBuffer||this.vertexBuffer.size<vertices.byteLength){this.vertexBuffer?.destroy();this.vertexBuffer=this.device.createBuffer({size:vertices.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});}
  this.device.queue.writeBuffer(this.vertexBuffer,0,vertices);
  const encoder=this.device.createCommandEncoder();
  const target=this.color||this.context.getCurrentTexture();
  const attachment={view:(this.msaa||target).createView(),clearValue:{r:.035,g:.04,b:.07,a:1},loadOp:'clear',storeOp:this.msaa?'discard':'store'};
  if(this.msaa)attachment.resolveTarget=target.createView();
  const pass=encoder.beginRenderPass({colorAttachments:[attachment],depthStencilAttachment:{view:this.depth.createView(),depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'discard',stencilClearValue:0,stencilLoadOp:'clear',stencilStoreOp:'discard'}});
  pass.setPipeline(this.currentPipeline);pass.setBindGroup(0,this.binding);pass.setVertexBuffer(0,this.vertexBuffer);pass.draw(vertices.length/9);pass.end();
  if(this.color)encoder.copyTextureToTexture({texture:this.color},{texture:this.context.getCurrentTexture()},[this.plan.width,this.plan.height]);
  this.device.queue.submit([encoder.finish()]);
 }
 async readPixel(x,y){
  if(!this.readback)throw Error('Lectura de pixel requiere readback de diagnostico');
  const buffer=this.device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
  try{
   const encoder=this.device.createCommandEncoder();encoder.copyTextureToBuffer({texture:this.color,origin:[x,y]},{buffer,bytesPerRow:256},[1,1]);this.device.queue.submit([encoder.finish()]);
   await buffer.mapAsync(GPUMapMode.READ);const rgba=Array.from(new Uint8Array(buffer.getMappedRange()).slice(0,4));if(this.format.startsWith('bgra'))[rgba[0],rgba[2]]=[rgba[2],rgba[0]];return rgba;
  }finally{buffer.destroy();}
 }
 async flush(){await this.device.queue.onSubmittedWorkDone();}
 dispose(){this.disposed=true;for(const resource of [this.color,this.depth,this.msaa,this.image,this.vertexBuffer])resource?.destroy();this.device.removeEventListener('uncapturederror',this.errorListener);this.context.unconfigure();this.device.destroy();}
}
const glVertex=`#version 300 es
in vec4 position;in vec3 color;in vec2 uv;out vec3 vColor;out vec2 vUv;
void main(){gl_Position=vec4(position.xy,position.z*2.0-position.w,position.w);vColor=color;vUv=uv;}`;
const glFragment=`#version 300 es
precision highp float;in vec3 vColor;in vec2 vUv;uniform sampler2D image;out vec4 outColor;
void main(){outColor=texture(image,vUv)*vec4(vColor,1.0);}`;
class WebGLRenderer {
 constructor(canvas,onError,readback,debug){
  this.canvas=canvas;this.backend='WebGL 2';this.errors=[];this.readback=readback;this.debug=debug;
  const gl=this.gl=canvas.getContext('webgl2',{alpha:false,antialias:false,stencil:true,powerPreference:'high-performance'});if(!gl)throw Error('WebGL 2 no disponible');
  this.lossListener=e=>{e.preventDefault();const error='Contexto WebGL perdido. Volvé a iniciar la prueba.';this.errors.push(error);onError?.(error);};canvas.addEventListener('webglcontextlost',this.lossListener);
  const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const error=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(error);}return s;};
  const vs=shader(gl.VERTEX_SHADER,glVertex),fs=shader(gl.FRAGMENT_SHADER,glFragment);this.program=gl.createProgram();gl.attachShader(this.program,vs);gl.attachShader(this.program,fs);gl.linkProgram(this.program);gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(this.program));
  this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);this.vertexBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);
  for(const [name,n,offset]of [['position',4,0],['color',3,16],['uv',2,28]]){const loc=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,n,gl.FLOAT,false,stride,offset);}
  this.vertexCapacity=0;this.imageUniform=gl.getUniformLocation(this.program,'image');
  this.aniso=gl.getExtension('EXT_texture_filter_anisotropic');
  const info=gl.getExtension('WEBGL_debug_renderer_info');this.metadata={renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:info?gl.getParameter(info.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),readback,depthBits:gl.getParameter(gl.DEPTH_BITS),stencilBits:gl.getParameter(gl.STENCIL_BITS)};
  const colorSamples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA8,gl.SAMPLES));
  const depthSamples=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.DEPTH24_STENCIL8,gl.SAMPLES));
  this.limits={maxDimension:Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE),gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)),samples:[1,...colorSamples.filter(s=>depthSamples.includes(s))],maxAnisotropy:this.aniso?gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT):1};
 }
 deleteTargets(){const gl=this.gl;gl.deleteTexture(this.color);gl.deleteFramebuffer(this.colorFbo);gl.deleteFramebuffer(this.msaaFbo);gl.deleteRenderbuffer(this.depth);gl.deleteRenderbuffer(this.msaaColor);this.color=null;this.colorFbo=null;this.depth=null;this.msaaFbo=null;this.msaaColor=null;}
 resize(profile,viewport){
  const gl=this.gl,plan=renderPlan(profile,{...viewport,...this.limits});if(JSON.stringify(plan)===JSON.stringify(this.plan))return this.plan;
  this.deleteTargets();this.plan=plan;this.canvas.width=plan.width;this.canvas.height=plan.height;
  if(this.readback){this.color=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.color);gl.texStorage2D(gl.TEXTURE_2D,1,gl.RGBA8,plan.width,plan.height);
  this.colorFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.colorFbo);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.color,0);
  if(plan.samples>1&&gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Framebuffer de lectura incompleto');}
  if(!this.readback&&plan.samples===1){gl.bindFramebuffer(gl.FRAMEBUFFER,null);this.updateSampler();this.checkErrors();return plan;}
  this.depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);
  if(plan.samples>1){
   this.msaaFbo=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaaFbo);this.msaaColor=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.msaaColor);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,plan.samples,gl.RGBA8,plan.width,plan.height);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.RENDERBUFFER,this.msaaColor);
   gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorageMultisample(gl.RENDERBUFFER,plan.samples,gl.DEPTH24_STENCIL8,plan.width,plan.height);
  }else gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH24_STENCIL8,plan.width,plan.height);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_STENCIL_ATTACHMENT,gl.RENDERBUFFER,this.depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Framebuffer incompleto');this.updateSampler();this.checkErrors();return plan;
 }
 uploadTexture(texture){
  const gl=this.gl;validateRGBA8(texture);gl.deleteTexture(this.image);this.image=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.image);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,texture.width,texture.height,0,gl.RGBA,gl.UNSIGNED_BYTE,texture.data);gl.generateMipmap(gl.TEXTURE_2D);this.updateSampler();this.checkErrors();
 }
 updateSampler(){if(!this.image||!this.plan)return;const gl=this.gl;gl.bindTexture(gl.TEXTURE_2D,this.image);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);if(this.aniso)gl.texParameterf(gl.TEXTURE_2D,this.aniso.TEXTURE_MAX_ANISOTROPY_EXT,this.plan.anisotropy);}
 draw(vertices){
  validateVertices(vertices);if(!this.plan||!this.image)throw Error('Falta configurar viewport/textura');const gl=this.gl,{width,height}=this.plan;
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.msaaFbo||this.colorFbo||null);gl.viewport(0,0,width,height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LESS);gl.clearColor(.035,.04,.07,1);gl.clearDepth(1);gl.clearStencil(0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT|gl.STENCIL_BUFFER_BIT);
  gl.useProgram(this.program);gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,this.vertexBuffer);if(this.vertexCapacity<vertices.byteLength){this.vertexCapacity=vertices.byteLength;gl.bufferData(gl.ARRAY_BUFFER,this.vertexCapacity,gl.DYNAMIC_DRAW);}gl.bufferSubData(gl.ARRAY_BUFFER,0,vertices);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.image);gl.uniform1i(this.imageUniform,0);gl.drawArrays(gl.TRIANGLES,0,vertices.length/9);
  if(this.msaaFbo){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.msaaFbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,this.colorFbo||null);gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  if(this.readback){gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.colorFbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,null);gl.blitFramebuffer(0,0,width,height,0,0,width,height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  if(this.debug)this.checkErrors();
 }
 checkErrors(){const gl=this.gl;const error=gl.getError();if(error!==gl.NO_ERROR){this.errors.push('WebGL error '+error);throw Error('WebGL error '+error);}
 }
 async readPixel(x,y){const gl=this.gl;gl.bindFramebuffer(gl.READ_FRAMEBUFFER,this.colorFbo);const pixel=new Uint8Array(4);gl.readPixels(x,this.plan.height-1-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return Array.from(pixel);}
 async flush(){this.gl.finish();}
 dispose(){const gl=this.gl;this.deleteTargets();gl.deleteTexture(this.image);gl.deleteBuffer(this.vertexBuffer);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program);this.canvas.removeEventListener('webglcontextlost',this.lossListener);}
}
export async function createRenderer(canvas,{backend='auto',onError,readback=false,debug=false}={}){
 let fallbackReason='';
 if(backend!=='webgl2'){
  let device;
  try{
   if(!navigator.gpu)throw Error('WebGPU no disponible');
   const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!adapter)throw Error('No hay adaptador WebGPU');
   device=await adapter.requestDevice();return new WebGPURenderer(canvas,adapter,device,onError,readback);
  }catch(e){device?.destroy();if(backend==='webgpu')throw e;fallbackReason=String(e);if(canvas.getContext('webgpu')){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;}}
 }
 const renderer=new WebGLRenderer(canvas,onError,readback,debug);renderer.fallbackReason=fallbackReason;return renderer;
}
