import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {createResourceReader,prepareLiveSongDraw} from './live-prepare.mjs';
import {createLiveSongRenderer} from './live-renderer.mjs';
import {readLiveDraws} from './live-reader.mjs';
import {decodeBCTexture} from '../iphone-probe/bc-rgba.mjs';
import {binkPairs,binkShaders} from './bink.mjs';
const shaders=__SONG_SHADERS__,roadVS=new Set(['B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92']),state={mode:__SONG_MODE__,received:0,submitted:0,presented:0,droppedInit:0,droppedBusy:0,droppedPresentation:0,skips:{},timing:{count:0,parseMs:0,prepareMs:0,pipelineMs:0,resourceMs:0,replayMs:0,gpuWaitMs:0,totalMs:0},fatal:null};
const presentation=new SharedArrayBuffer(4),pending=new Int32Array(presentation);
let init,renderer,resources,hash,context,canvas,busy=false,lastReport=0;
function report(force=false){if(!force&&performance.now()-lastReport<1000)return;lastReport=performance.now();self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{...state,resourceStats:resources?.stats,gpu:renderer?.stats}]});}
function fail(e){state.fatal=e.message||String(e);report(true);}
function initialize(api){return init??=(async()=>{
 hash=await createHash();const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('WebGPU sin adaptador');
 const bc=adapter.features.has('texture-compression-bc');const device=await adapter.requestDevice({requiredFeatures:bc?['texture-compression-bc']:[]});device.addEventListener('uncapturederror',e=>fail(e.error));device.lost.then(e=>fail(Error('GPU lost: '+e.message)));
 renderer=await createLiveSongRenderer(device,shaders,{prepareTexture:bc?t=>t:decodeBCTexture});resources=createResourceReader(api.readPhysical);canvas=new OffscreenCanvas(1280,720);context=canvas.getContext('webgpu');context.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});state.ready=true;report(true);
})().catch(fail);}
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 state.received++;state.sequence=info.seq;state.swap=info.swap;
 if(state.fatal)return;
 if(!renderer){state.droppedInit++;initialize(api);report();return;}
 if(busy){state.droppedBusy++;report();return;}
 busy=true;const start=performance.now();
 try{
  let parseMs=0,prepareMs=0;const inputs=[],pairs={},skips={},counts={};resources.begin();
  const wanted=__SONG_MODE__==='road'?new Set([...roadVS,...binkPairs.keys()]):null,verifyShaders=wanted?new Set([...wanted,...binkShaders,'526B394DE2AB8891','F34502A7B2BCEAB0','0295964C4221D881','49284DED0773CE79','423450BC1BF1038D']):null,events=readLiveDraws(bytes,{hash,wanted,verifyShaders,counts});
  // Guest reads and register replay complete synchronously before GPU awaits.
  for(;;){
   let at=performance.now();const next=events.next();parseMs+=performance.now()-at;if(next.done)break;const d=next.value;at=performance.now();
   try{const input=prepareLiveSongDraw(d,resources,shaders);inputs.push(input);const key=input.manifest.vs+'/'+input.manifest.ps;pairs[key]=(pairs[key]||0)+1;}catch(e){skips[e.message]=(skips[e.message]||0)+1;}
   prepareMs+=performance.now()-at;
  }
  skips['Scene omitted for gameplay']=counts.omitted||0;skips['COPY/EDRAM']=counts.copies||0;state.submitted++;
  return renderer.render(inputs,context).then(gpu=>{
   const t=state.timing;t.count++;t.parseMs+=parseMs;t.prepareMs+=prepareMs;for(const k of ['pipelineMs','resourceMs','replayMs','gpuWaitMs'])t[k]+=gpu[k];t.totalMs+=performance.now()-start;
   for(const [key,n] of Object.entries({...skips,...gpu.rejected}))state.skips[key]=(state.skips[key]||0)+n;
   state.last={seq:info.seq,swap:info.swap,accepted:gpu.accepted,pairs,skips,timing:{parseMs,prepareMs,pipelineMs:gpu.pipelineMs,resourceMs:gpu.resourceMs,replayMs:gpu.replayMs,gpuWaitMs:gpu.gpuWaitMs,totalMs:performance.now()-start}};
   if(gpu.accepted&&Atomics.compareExchange(pending,0,0,1)===0){const bitmap=canvas.transferToImageBitmap();self.postMessage({cmd:'callHandler',handler:'r5SongFrame',args:[bitmap,{seq:info.seq,accepted:gpu.accepted},presentation]},[bitmap]);state.presented++;}else if(gpu.accepted)state.droppedPresentation++;
  }).catch(fail).finally(()=>{busy=false;report();});
 }catch(e){busy=false;fail(e);}
};
