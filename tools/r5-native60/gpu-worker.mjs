import {createLiveSongRenderer} from './renderer.mjs';
import {createTemporalFrame} from './temporal.mjs';
import {nextDeadline} from './cadence.mjs';
import {sceneTexture} from '../r5-scene-mobile/src/texture-policy.mjs';
import {C,ewmaStore,maxStore} from './control.mjs';
import {knob,rendererConfig} from './governor-policy.mjs';
import {createPreloader,idbStore} from './preload.mjs';
let preloader=null,renderer,canvas,context,device,port,latch,transport,shaders,sceneMotion=false,queued=null,current=null,temporal=null,known=new Map(),running=false,timer,nextAt=0,lastReport=0,sourceSerial=0;
const state={rendered:0,snapshots:0,stale:0,coalesced:0,textureCPUBytes:0,targetHz:60,maxGPUFramesInFlight:1,directPort:true,originalShaders:true};
// latch = tablero compartido (control.mjs). Un consumidor viejo manda 8 bytes: sin telemetría ni gobernador.
const board=()=>latch&&latch.length>C.WORKER_US?latch:null;
// Gobernador: perillas CPU/GPU/memoria → escala, presupuestos y texturas diferidas. Sólo se recalcula al cambiar.
let policyKey=-1,policy=rendererConfig(0,0,0);
function applyPolicy(){
 const b=board(),cpu=knob(b,C.CPU),gpu=knob(b,C.GPU),mem=knob(b,C.MEM),key=cpu|gpu<<2|mem<<4;
 if(key!==policyKey){policyKey=key;policy=rendererConfig(cpu,gpu,mem);state.policy={cpu,gpu,mem};}
 if(key!==state.appliedKey||renderer.stats.scale!==policy.scale){renderer.configure(policy);state.appliedKey=key;}
}
function stop(error){clearTimeout(timer);if(transport)Atomics.store(transport,0,0);const b=board();if(b)Atomics.store(b,C.GPU_LOST,1);postMessage({type:'error',error:error?.stack||String(error)});}
onmessage=async({data:m})=>{
 try{
  if(m.type==='init'){
   shaders=m.shaders;sceneMotion=m.sceneMotion;port=m.port;latch=new Int32Array(m.presentation);transport=new Int32Array(m.transport);
   const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
   const bc=adapter.features.has('texture-compression-bc');
   // Formatos comprimidos que el adaptador soporta de verdad (para medir en el iPhone; ASTC/ETC2 todavía no se usan).
   state.compression=['texture-compression-bc','texture-compression-etc2','texture-compression-astc'].filter(f=>adapter.features.has(f));device=await adapter.requestDevice({requiredFeatures:bc?['texture-compression-bc']:[]});
   device.addEventListener('uncapturederror',e=>stop(e.error));device.lost.then(e=>stop(Error('GPU lost: '+e.message)));
   renderer=await createLiveSongRenderer(device,shaders,{prepareTexture:t=>sceneTexture(t,bc),onPipeline:(m,pre)=>preloader?.record(m,pre)});
   // Precarga de pipelines recordados, sólo en cargas/menús (preload.mjs). Tablero viejo sin etapa: sólo anota.
   preloader=createPreloader({renderer,store:idbStore(),board:latch.length>C.SONG_BUILDS?latch:null});setInterval(()=>preloader.pump(),100);
   canvas=new OffscreenCanvas(1280,720);context=canvas.getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});
   port.onmessage=()=>{};port.start();postMessage({type:'ready'});return;
  }
  if(m.type!=='snapshot')return;
  if(!m.inputs.length){state.emptySnapshots=(state.emptySnapshots||0)+1;Atomics.store(transport,0,0);return;}
  for(const input of m.inputs)for(const t of input.textures){
   const s=t.texture;if(s.data)known.set(s.key,{texture:s,last:sourceSerial});
   else{const k=known.get(s.key);if(!k||k.texture.revision!==s.revision)throw Error('Missing texture revision '+s.key);t.texture=k.texture;k.last=sourceSerial;}
  }
  if(queued)state.coalesced++;queued=m;sourceSerial++;m.serial=sourceSerial;
  const serial=sourceSerial;
  // Compile newly encountered shaders in the background. Until ready, keep
  // presenting the previous snapshot instead of awaiting compilation in tick().
  renderer.prewarm(m.inputs).then(()=>{if(queued?.serial===serial)queued.pipelineReady=true;}).catch(stop);
  Atomics.store(transport,0,0);
  if(!running&&!timer)schedule();
 }catch(e){stop(e);}
};
function schedule(){
 const now=performance.now();if(nextAt<now-50)nextAt=now;
 timer=setTimeout(tick,Math.max(0,nextAt-now));
}
async function tick(){
 timer=null;if(running)return;running=true;
 try{
  let fresh=false;
  if(queued?.pipelineReady){
   const previous=current;current=queued;queued=null;fresh=true;state.snapshots++;
   const interval=previous?current.at-previous.at:0;
   const prepareAt=performance.now();temporal=createTemporalFrame(current.inputs,shaders,{previous:previous?.inputs,intervalMs:interval,sceneMotion});state.lastMotionPrepareMs=performance.now()-prepareAt;
   const active=new Set(current.inputs.flatMap(i=>i.textures.map(t=>t.texture.key))),retired=[];
   let bytes=0;for(const k of known.values())bytes+=k.texture.data?.byteLength||0;
   for(const [key,k] of [...known].sort((a,b)=>a[1].last-b[1].last))if(!active.has(key)&&(sourceSerial-k.last>120||bytes>policy.cpuTextureBytes)){bytes-=k.texture.data?.byteLength||0;known.delete(key);retired.push(key);}
   state.textureCPUBytes=bytes;if(retired.length)postMessage({type:'retired',keys:retired});
  }
  state.pipelinePending=!!queued&&!queued.pipelineReady;
  if(current){
   const now=performance.timeOrigin+performance.now(),age=now-current.at;
   if(age<500){
    // Always publish the exact snapshot first. Subsequent images use at most
    // 100ms of input extrapolation, with no game/audio simulation in this worker.
    const dt=fresh?0:Math.max(0,Math.min(100,age))/1000;
    const animateAt=performance.now(),dirty=temporal.animate(dt);state.lastAnimateMs=performance.now()-animateAt;
    applyPolicy();
    const frameAt=performance.now(),gpu=await renderer.render(temporal.inputs,context,{reuse:!fresh,dirty});
    const b=board();if(b){ewmaStore(b,C.GPU_US,gpu.gpuWaitMs*1000);maxStore(b,C.GPU_MAX_US,gpu.gpuWaitMs*1000);ewmaStore(b,C.WORKER_US,(performance.now()-frameAt)*1000);Atomics.add(b,C.RENDERED,1);
     Atomics.store(b,C.TEX_GPU_KIB,(gpu.residentTextureBytes||0)>>10);Atomics.store(b,C.TEX_CPU_KIB,state.textureCPUBytes>>10);Atomics.store(b,C.BUF_KIB,(gpu.bufferBytes||0)>>10);Atomics.store(b,C.SCALE_PCT,Math.round((gpu.scale||1)*100));Atomics.store(b,C.SCENE_DEFERRED,gpu.sceneDeferred||0);}
    state.rendered++;state.deltaMs=dt*1000;state.sourceAgeMs=age;state.motionPlans=temporal.planCount;state.scenePlans=temporal.scenePlanCount;
    if(gpu.accepted&&Atomics.compareExchange(latch,0,0,1)===0){
     const bitmap=canvas.transferToImageBitmap();port.postMessage({type:'frame',bitmap,info:{seq:current.info.seq,accepted:gpu.accepted},latch:latch.buffer},[bitmap]);
    }
    if(performance.now()-lastReport>1000){lastReport=performance.now();postMessage({type:'stats',gpu,temporal:{...state},info:current.info});}
   }else state.stale++;
  }
 }catch(e){stop(e);running=false;return;}
 running=false;
 nextAt=nextDeadline(nextAt,performance.now());
 if(current||queued)schedule();
}
