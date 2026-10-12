import {createMenuRenderer} from './renderer.mjs';
import {createMenuConsumer} from './consumer.mjs';

// Installed by the R5L runtime adapter after it exposes readPhysical().
// Returns a bounded async consumer; it does not change the command processor.
export async function installLiveMenu(api,{vertexWGSL,fragmentWGSL,onFrame=()=>{},onReport=()=>{}}){
 if(typeof api.readPhysical!=='function')throw Error('R5L physical-memory reader missing');
 const adapter=await navigator.gpu.requestAdapter();
 if(!adapter?.features.has('texture-compression-bc'))throw Error('R5L requires BC texture support');
 const device=await adapter.requestDevice({requiredFeatures:['texture-compression-bc']});
 const renderer=await createMenuRenderer(device,{vertexWGSL,fragmentWGSL});
 const canvas=new OffscreenCanvas(1280,720),context=canvas.getContext('webgpu');
 context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});
 const consumer=createMenuConsumer(renderer,{readPhysical:api.readPhysical,context,
  onReport(report){
   if(report.gpu.initialized&&report.accepted)onFrame(canvas.transferToImageBitmap(),report);
   onReport(report);
  }});
 device.addEventListener('uncapturederror',event=>{consumer.stop();onReport({fatal:event.error.message});});
 device.lost.then(info=>{consumer.stop();onReport({fatal:'GPU device lost: '+info.message});});
 return {submit:frame=>consumer.submit(frame),stats:consumer.stats,
  dispose(){consumer.stop();renderer.dispose();device.destroy();}};
}
