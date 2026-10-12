// Bundled as a classic script, loaded ONLY inside the live CP pthread.
import {readSnapshotV1} from './snapshot-reader.mjs';
import {prepareIntroSnapshot} from './prepare-intro-snapshot.mjs';
import {createIntroRenderer} from './intro-renderer.mjs';
const api=globalThis.__r5snapApi;
const state={received:0,rendered:0,unsupported:0,lastSeq:null,gpuErrors:[],maxQueued:0,pipelineBuilds:0,reused:0,readbacks:0};
const report=()=>self.postMessage({cmd:'callHandler',handler:'r5LiveReport',args:[{...state}]});
let queue=Promise.resolve(),queued=0,devicePromise;
let renderer,rendererKey,canvas,context;
function device(){
  return devicePromise??=(async()=>{
    if(!navigator.gpu)throw Error('No WebGPU in CP worker');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No GPU adapter');
    const d=await adapter.requestDevice();
    d.addEventListener('uncapturederror',e=>{state.gpuErrors.push(e.error.message);api.fail(24);report();});
    d.lost.then(info=>{state.gpuErrors.push('device lost: '+info.message);api.fail(25);report();});
    return d;
  })();
}
globalThis.__r5snapConsumer=(ptr,used,slot,lo,hi)=>{
  const seq=(BigInt(hi>>>0)<<32n)|BigInt(lo>>>0);
  // ReadSnapshot owns all resource bytes before the callback returns/awaits.
  const s=readSnapshotV1(api.memory(),ptr,used,{slotIndex:slot,eventSeq:seq});
  if(state.lastSeq!==null&&seq<=BigInt(state.lastSeq))throw Error('Snapshot order violation');
  state.lastSeq=seq.toString();state.received++;queued++;state.maxQueued=Math.max(state.maxQueued,queued);
  // Retain the producer slot while rendering: its two slots also bound our queue.
  queue=queue.then(async()=>{
    try{
      let input;
      try{input=prepareIntroSnapshot(s);}catch(e){
        if(!e.message.includes('translucent frame'))throw e;
        state.unsupported++;state.lastUnsupported=e.message;api.release(slot,lo,hi);report();return;
      }
      const d=await device();d.pushErrorScope('validation');
      const key=JSON.stringify(input.manifest);
      if(!renderer||key!==rendererKey){
        renderer?.dispose();renderer=null;
        renderer=await createIntroRenderer(d,{...input,vertexWGSL:__R5_VERTEX_WGSL__,fragmentWGSL:__R5_PIXEL_WGSL__});
        rendererKey=key;state.pipelineBuilds++;
      }else{renderer.update(input);state.reused++;}
      if(renderer.messages.some(x=>x.type==='error'))throw Error('Shader compilation error');
      if(!canvas){canvas=new OffscreenCanvas(1280,720);context=canvas.getContext('webgpu');context.configure({device:d,format:'rgba8unorm',alphaMode:'opaque'});}
      await renderer.present(context);
      const validation=await d.popErrorScope();if(validation)throw Error(validation.message);
      const bitmap=canvas.transferToImageBitmap();
      self.postMessage({cmd:'callHandler',handler:'r5LiveFrame',args:[bitmap,{seq:seq.toString(),draw:s.header.drawIndex,swap:s.header.swapIndex,textureHashes:s.textures.map(t=>t.baseHash.toString(16))}]},[bitmap]);
      state.rendered++;api.release(slot,lo,hi);report();
    }finally{queued--;}
  });
  // Error never releases the offending slot and terminates CP through fail.
  queue.catch(e=>{renderer?.dispose();renderer=null;state.fatal=e.message;api.fail(20);report();});
  return queue;
};
