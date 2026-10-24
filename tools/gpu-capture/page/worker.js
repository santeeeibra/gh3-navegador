// Dedicated worker variant: WebGPU is used only here, as in the live CP consumer.
import {renderLayers} from '/render-layers.js';
onmessage=async e=>{
 const {layers,opts,canvas}=e.data;
 try{
  let W=null;
  if(opts.capture){W=(await import('/wgpur.js')).default;W.start({captureFilename:'capture.wgpur'});}
  const nextFrame=()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
  const result=await renderLayers({layers,perDraw:opts.perDraw,present:canvas||null,nextFrame});
  if(canvas)await nextFrame();
  const transfer=[result.final.buffer,...result.draws.filter(d=>d.rgba).map(d=>d.rgba.buffer)];
  postMessage({type:'result',result},transfer);
  if(W)W.finish(); // in a worker the module posts {type:'WebGPUCapture',data:Blob}
 }catch(err){postMessage({type:'error',message:String(err?.stack||err)});}
};
