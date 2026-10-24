import {createLiveSongRenderer} from './arena-renderer.mjs';
let renderer,canvas,context,busy,pending,known=new Map();
onmessage=async({data:m})=>{
 try{
  if(m.type==='init'){
   busy=new Int32Array(m.busy);pending=new Int32Array(m.presentation);
   const adapter=await navigator.gpu.requestAdapter();if(!adapter?.features.has('texture-compression-bc'))throw Error('BC textures required');
   const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});device.addEventListener('uncapturederror',e=>postMessage({type:'error',error:e.error.message}));device.lost.then(e=>postMessage({type:'error',error:'GPU lost: '+e.message}));
   renderer=await createLiveSongRenderer(device,m.shaders);canvas=new OffscreenCanvas(1280,720);context=canvas.getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});postMessage({type:'ready'});return;
  }
  const start=performance.now();for(const input of m.inputs)for(const t of input.textures){if(t.texture.data)known.set(t.texture.key,t.texture);else{const data=known.get(t.texture.key);if(!data)throw Error('Unknown texture key');t.texture=data;}}
  const gpu=await renderer.render(m.inputs,context);let bitmap=null;
  if(gpu.accepted&&Atomics.compareExchange(pending,0,0,1)===0)bitmap=canvas.transferToImageBitmap();
  const result={type:'frame',gpu,info:m.info,pairs:m.pairs,skips:m.skips,approximatedMips:m.approximatedMips,timing:{...m.timing,pipelineMs:gpu.pipelineMs,resourceMs:gpu.resourceMs,replayMs:gpu.replayMs,gpuWaitMs:gpu.gpuWaitMs,workerMs:performance.now()-start,totalMs:performance.timeOrigin+performance.now()-m.startedAt},bitmap};
  Atomics.store(busy,0,0);postMessage(result,bitmap?[bitmap]:[]);
 }catch(e){if(busy)Atomics.store(busy,0,0);postMessage({type:'error',error:e.stack||e.message});}
};
