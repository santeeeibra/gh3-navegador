// One immutable snapshot in transit. Guest reads finish before returning to CP.
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import {createResourceReader} from './snapshot-prepare.mjs';
import {prepareNativeDraw} from './prepare.mjs';
import {C, createControl, maxStore} from './control.mjs';
import {POLICY, knob, shouldCapture} from './governor-policy.mjs';
const shaders=__NATIVE_SHADERS__,road=new Set(['CAC1FD2246E486B4','57F6448DAC5BEB74','B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92','27643FEB20B8CBBD','C6F0B6F9BA5A2B12','10CA3B730086027C','035C1CB9583C0C7E']);
// presentation = tablero compartido (control.mjs): [0..1] como antes + telemetría y política del gobernador.
const presentation=createControl(),ctl=new Int32Array(presentation),transport=new SharedArrayBuffer(4),busy=new Int32Array(transport),sent=new Map();
const state={mode:'original-WGSL-native60',received:0,submitted:0,presented:0,droppedInit:0,droppedBusy:0,skips:{},timing:{count:0,parseMs:0,prepareMs:0,transferMs:0},fatal:null};
let initializing,worker,resources,hash,lastReport=0,lastCaptureAt=-1e9;
const report=force=>{if(!force&&performance.now()-lastReport<1000)return;lastReport=performance.now();state.presented=Atomics.load(new Int32Array(presentation),1);self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{...state,resourceStats:resources?.stats}]});};
const fail=e=>{state.fatal=e.stack||e.message||String(e);report(true);};
function initialize(api){return initializing??=(async()=>{
 hash=await createHash();resources=createResourceReader(api.readPhysical,{resourceHash:api.resourceHash?.bind(api)});
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
 state.received++;Atomics.add(ctl,C.SWAPS,1);if(state.fatal)return;
 if(!state.ready){state.droppedInit++;initialize(api);report();return;}
 // Gobernador (governor-policy.mjs): saltear este swap se decide ANTES de leer memoria del juego; nunca se difiere
 // una lectura para después (lo que se envía siempre es una copia inmutable tomada en este mismo swap).
 const cpu=knob(ctl,C.CPU),now=performance.now();
 if(!shouldCapture(now,lastCaptureAt,cpu)){state.governorSkipped=(state.governorSkipped||0)+1;Atomics.add(ctl,C.GOV_SKIPPED,1);return;}
 if(Atomics.compareExchange(busy,0,0,1)!==0){state.droppedBusy++;Atomics.add(ctl,C.BUSY_DROPS,1);report();return;}
 lastCaptureAt=now;const roadOnly=!__NATIVE_SCENE__||POLICY.cpu[cpu].roadOnly;Atomics.store(ctl,C.ROAD_ONLY,roadOnly?1:0);
 const start=performance.timeOrigin+performance.now(),inputs=[],pairs={},skips={},counts={};let parseMs=0,prepareMs=0;
 try{
  resources.begin();const events=readLiveDraws(bytes,{hash,wanted:roadOnly?road:null,verifyShaders:new Set(),counts});
  for(;;){
   let t=performance.now();const next=events.next();parseMs+=performance.now()-t;if(next.done)break;t=performance.now();
   if(globalThis.__hw60DrawFilter&&!globalThis.__hw60DrawFilter(next.value))continue;
   try{const input=prepareNativeDraw(next.value,resources,shaders);input.manifest.essential=road.has(input.manifest.vs);inputs.push(input);const key=input.manifest.vs+'/'+input.manifest.ps;pairs[key]=(pairs[key]||0)+1;}
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
  state.submitted++;state.timing.count++;for(const k in timing)state.timing[k]+=timing[k];state.skips=skips;
  const costUs=(performance.timeOrigin+performance.now()-start)*1000;Atomics.add(ctl,C.SNAPSHOTS,1);Atomics.store(ctl,C.PREP_US,Math.round(costUs));maxStore(ctl,C.PREP_MAX_US,costUs);report();
 }catch(e){Atomics.store(busy,0,0);fail(e);}
};
