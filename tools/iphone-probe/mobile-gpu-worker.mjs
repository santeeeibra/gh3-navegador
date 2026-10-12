import {createLiveSongRenderer} from '../r5-live-song/arena-renderer.mjs';
import {decodeBCTexture} from './bc-rgba.mjs';
let renderer,canvas,context,busy,pending,known=new Map();
const conversion={mode:'rgba8-no-bc',textures:0,sourceBytes:0,rgbaBytes:0,totalMs:0};
onmessage=async({data:m})=>{
 try{
  if(m.type==='init'){
   busy=new Int32Array(m.busy);pending=new Int32Array(m.presentation);
   const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU sin adaptador.');
   // Deliberately request zero BC features, including on PC: exercise the phone path.
   const device=await adapter.requestDevice();device.addEventListener('uncapturederror',e=>postMessage({type:'error',error:e.error.message}));device.lost.then(e=>{if(e.reason!=='destroyed')postMessage({type:'error',error:'GPU lost: '+e.message});});
   if(device.features.has('texture-compression-bc'))throw Error('La prueba móvil debe usar un dispositivo sin BC.');
   renderer=await createLiveSongRenderer(device,m.shaders,{prepareTexture:t=>{const start=performance.now(),u=decodeBCTexture(t);if(u!==t){conversion.textures++;conversion.sourceBytes+=t.data.byteLength;conversion.rgbaBytes+=u.data.byteLength;conversion.totalMs+=performance.now()-start;}return u;}});
   canvas=new OffscreenCanvas(1280,720);context=canvas.getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});postMessage({type:'ready',conversion:{...conversion}});return;
  }
  const start=performance.now();for(const input of m.inputs)for(const t of input.textures){if(t.texture.data)known.set(t.texture.key,t.texture);else{const original=known.get(t.texture.key);if(!original)throw Error('Unknown texture key');t.texture=original;}}
  const gpu={...await renderer.render(m.inputs,context),conversion:{...conversion}};let bitmap=null;
  if(gpu.accepted&&Atomics.compareExchange(pending,0,0,1)===0)bitmap=canvas.transferToImageBitmap();
  const result={type:'frame',gpu,info:m.info,pairs:m.pairs,skips:m.skips,approximatedMips:m.approximatedMips,timing:{...m.timing,pipelineMs:gpu.pipelineMs,resourceMs:gpu.resourceMs,replayMs:gpu.replayMs,gpuWaitMs:gpu.gpuWaitMs,workerMs:performance.now()-start,totalMs:performance.timeOrigin+performance.now()-m.startedAt},bitmap};
  Atomics.store(busy,0,0);postMessage(result,bitmap?[bitmap]:[]);
 }catch(e){if(busy)Atomics.store(busy,0,0);postMessage({type:'error',error:e.stack||e.message});}
};
