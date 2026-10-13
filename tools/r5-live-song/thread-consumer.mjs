// CP snapshots resources synchronously; a bounded dedicated worker owns WebGPU.
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from './live-reader.mjs';
import {createResourceReader,prepareLiveSongDraw} from './live-prepare.mjs';
import {binkPairs,binkShaders} from './bink.mjs';
const shaders=__SONG_SHADERS__,roadVS=new Set(['B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92']),verifyShaders=new Set([...roadVS,'526B394DE2AB8891','F34502A7B2BCEAB0','0295964C4221D881','49284DED0773CE79','423450BC1BF1038D']);
const presentation=new SharedArrayBuffer(4),busyBuffer=new SharedArrayBuffer(4),busy=new Int32Array(busyBuffer),sentTextures=new Set();
const state={mode:'road-worker-arena',received:0,submitted:0,presented:0,droppedInit:0,droppedBusy:0,droppedPresentation:0,skips:{},cpTiming:{count:0,totalMs:0,postMs:0},timing:{count:0,parseMs:0,prepareMs:0,transferMs:0,pipelineMs:0,resourceMs:0,replayMs:0,gpuWaitMs:0,workerMs:0,totalMs:0},fatal:null};
let initializing,worker,resources,hash,lastReport=0;
function report(force=false){if(!force&&performance.now()-lastReport<1000)return;lastReport=performance.now();self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{...state,resourceStats:resources?.stats}]});}
const fail=e=>{state.fatal=e.message||String(e);report(true);};
function initialize(api){return initializing??=(async()=>{
 hash=await createHash();resources=createResourceReader(api.readPhysical);worker=new Worker(new URL('r5snap-song-gpu.js',location.href),{name:'codex-song-gpu'});
 worker.onerror=e=>fail(Error(e.message));worker.onmessage=({data:m})=>{
  if(m.type==='error')return fail(Error(m.error));if(m.type==='ready'){state.ready=true;report(true);return;}
  const t=state.timing;t.count++;for(const k in m.timing)if(k in t)t[k]+=m.timing[k];state.gpu=m.gpu;
  for(const [k,n] of Object.entries({...m.skips,...m.gpu.rejected}))state.skips[k]=(state.skips[k]||0)+n;
  state.last={seq:m.info.seq,swap:m.info.swap,accepted:m.gpu.accepted,approximatedMips:m.approximatedMips,pairs:m.pairs,skips:m.skips,timing:m.timing};
  if(m.bitmap){self.postMessage({cmd:'callHandler',handler:'r5SongFrame',args:[m.bitmap,{seq:m.info.seq,accepted:m.gpu.accepted},presentation]},[m.bitmap]);state.presented++;}else if(m.gpu.accepted)state.droppedPresentation++;
  report();
 };
 worker.postMessage({type:'init',shaders,presentation,busy:busyBuffer});
})().catch(fail);}
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 state.received++;state.sequence=info.seq;state.swap=info.swap;if(state.fatal)return;
 if(!state.ready){state.droppedInit++;initialize(api);report();return;}
 if(Atomics.compareExchange(busy,0,0,1)!==0){state.droppedBusy++;report();return;}
 const start=performance.now(),inputs=[],pairs={},skips={},counts={};let parseMs=0,prepareMs=0;
 try{
  resources.begin();const events=readLiveDraws(bytes,{hash,wanted:new Set([...roadVS,...binkPairs.keys()]),verifyShaders:new Set([...verifyShaders,...binkShaders]),counts});
  for(;;){let at=performance.now();const next=events.next();parseMs+=performance.now()-at;if(next.done)break;at=performance.now();try{const input=prepareLiveSongDraw(next.value,resources,shaders);inputs.push(input);const key=input.manifest.vs+'/'+input.manifest.ps;pairs[key]=(pairs[key]||0)+1;}catch(e){skips[e.message]=(skips[e.message]||0)+1;}prepareMs+=performance.now()-at;}
  skips['Scene omitted for gameplay']=counts.omitted||0;skips['COPY/EDRAM']=counts.copies||0;
  const at=performance.now(),buffers=new Set();
  for(const input of inputs){for(const bytes of Object.values(input.assets))buffers.add(bytes.buffer);
   input.textures=input.textures.map(t=>{const src=t.texture,texture={key:src.key,video:src.video,width:src.width,height:src.height,format:src.format,bytesPerRow:src.bytesPerRow,rowsPerImage:src.rowsPerImage};if(src.video||!sentTextures.has(src.key)){texture.data=src.data.slice();buffers.add(texture.data.buffer);sentTextures.add(src.key);}return {slot:t.slot,sampler:t.sampler,texture};});
  }
  const timing={parseMs,prepareMs,transferMs:performance.now()-at},postAt=performance.now();worker.postMessage({type:'frame',inputs,info,pairs,skips,timing,approximatedMips:inputs.reduce((n,i)=>n+i.manifest.approximatedMips,0),startedAt:performance.timeOrigin+start},[...buffers]);state.cpTiming.count++;state.cpTiming.totalMs+=performance.now()-start;state.cpTiming.postMs+=performance.now()-postAt;state.submitted++;report();
 }catch(e){Atomics.store(busy,0,0);fail(e);}
};
