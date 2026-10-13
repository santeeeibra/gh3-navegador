// One immutable snapshot in transit. Guest reads finish before returning to CP.
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import {createResourceReader} from './snapshot-prepare.mjs';
import {prepareNativeDraw} from './prepare.mjs';
const shaders=__NATIVE_SHADERS__,road=new Set(['CAC1FD2246E486B4','57F6448DAC5BEB74','B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92','27643FEB20B8CBBD','C6F0B6F9BA5A2B12','10CA3B730086027C','035C1CB9583C0C7E']);
const presentation=new SharedArrayBuffer(8),transport=new SharedArrayBuffer(4),busy=new Int32Array(transport),sent=new Map();
const state={mode:'original-WGSL-native60',received:0,submitted:0,presented:0,droppedInit:0,droppedBusy:0,skips:{},timing:{count:0,parseMs:0,prepareMs:0,transferMs:0},fatal:null};
let initializing,worker,resources,hash,lastReport=0;
const report=force=>{if(!force&&performance.now()-lastReport<1000)return;lastReport=performance.now();state.presented=Atomics.load(new Int32Array(presentation),1);self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{...state,resourceStats:resources?.stats}]});};
const fail=e=>{state.fatal=e.stack||e.message||String(e);report(true);};
function initialize(api){return initializing??=(async()=>{
 hash=await createHash();resources=createResourceReader(api.readPhysical);
 worker=new Worker(new URL('r5snap-native60-gpu.js',location.href),{name:'codex-native60-gpu'});
 worker.onerror=e=>fail(Error(e.message));
 worker.onmessage=({data:m})=>{
  if(m.type==='error')return fail(Error(m.error));
  if(m.type==='ready'){state.ready=true;report(true);return;}
  if(m.type==='retired'){for(const k of m.keys)sent.delete(k);return;}
  if(m.type==='stats'){state.gpu=m.gpu;state.temporal=m.temporal;state.last=m.info;report();}
 };
 const channel=new MessageChannel();
 // Exactly one port traverses Emscripten's existing callHandler route. Later
 // bitmaps go GPU -> browser page directly, bypassing CP and game main thread.
 self.postMessage({cmd:'callHandler',handler:'r5NativePort',args:[channel.port2,presentation]},[channel.port2]);
 worker.postMessage({type:'init',shaders,presentation,transport,port:channel.port1,sceneMotion:__NATIVE_SCENE__},[channel.port1]);
})().catch(fail);}
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 state.received++;if(state.fatal)return;
 if(!state.ready){state.droppedInit++;initialize(api);report();return;}
 if(Atomics.compareExchange(busy,0,0,1)!==0){state.droppedBusy++;report();return;}
 const start=performance.timeOrigin+performance.now(),inputs=[],pairs={},skips={},counts={};let parseMs=0,prepareMs=0;
 try{
  resources.begin();const events=readLiveDraws(bytes,{hash,wanted:__NATIVE_SCENE__?null:road,verifyShaders:new Set(),counts});
  for(;;){
   let t=performance.now();const next=events.next();parseMs+=performance.now()-t;if(next.done)break;t=performance.now();
   try{const input=prepareNativeDraw(next.value,resources,shaders);inputs.push(input);const key=input.manifest.vs+'/'+input.manifest.ps;pairs[key]=(pairs[key]||0)+1;}
   catch(e){skips[e.message]=(skips[e.message]||0)+1;}
   prepareMs+=performance.now()-t;
  }
  skips['Scene omitted']=counts.omitted||0;skips['COPY/EDRAM pending']=counts.copies||0;
  // Resolve/secondary passes sometimes end in a swap with no visible draws.
  // They must not replace the last visible snapshot used for interpolation.
  if(!inputs.length){state.emptySnapshots=(state.emptySnapshots||0)+1;Atomics.store(busy,0,0);report();return;}
  const at=performance.now(),buffers=new Set();
  for(const input of inputs){
   for(const bytes of Object.values(input.assets))buffers.add(bytes.buffer);
   input.textures=input.textures.map(t=>{
    const s=t.texture,texture={key:s.key,revision:s.revision,video:s.video,scene:s.scene,width:s.width,height:s.height,layers:s.layers,cube:s.cube,format:s.format,bytesPerRow:s.bytesPerRow,rowsPerImage:s.rowsPerImage};
    if(s.video||sent.get(s.key)!==s.revision){texture.data=s.data.slice();buffers.add(texture.data.buffer);sent.set(s.key,s.revision);}
    return {slot:t.slot,sampler:t.sampler,texture};
   });
  }
  const timing={parseMs,prepareMs,transferMs:performance.now()-at};
  worker.postMessage({type:'snapshot',inputs,info:{...info,pairs,skips},at:start,timing},[...buffers]);
  state.submitted++;state.timing.count++;for(const k in timing)state.timing[k]+=timing[k];state.skips=skips;report();
 }catch(e){Atomics.store(busy,0,0);fail(e);}
};
