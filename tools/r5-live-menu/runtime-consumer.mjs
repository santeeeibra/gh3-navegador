// Classic script loaded by R5L inside the CP pthread. No producer modifications.
import {installLiveMenu} from './worker.mjs';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';

const state={received:0,droppedInit:0,droppedBusy:0,submitted:0,bitmaps:0,droppedPresentation:0,maxAccepted:0,fatal:null};
const presentation=new SharedArrayBuffer(4),pending=new Int32Array(presentation);
let initialization,live,hash,busy=false,lastReport=0,lastSequence=-1;
function report(force=false){
 if(!force&&performance.now()-lastReport<1000)return;
 lastReport=performance.now();
 self.postMessage({cmd:'callHandler',handler:'r5MenuReport',args:[{...state}]});
}
function fail(error){state.fatal=error?.message||String(error);report(true);}
function initialize(api){
 return initialization??=(async()=>{
  hash=await createHash();
  live=await installLiveMenu(api,{
   vertexWGSL:__R5_MENU_VERTEX__,fragmentWGSL:__R5_MENU_FRAGMENT__,
   onFrame(bitmap,info){
    // At most one bitmap in transit to the UI; the page releases this latch.
    if(Atomics.compareExchange(pending,0,0,1)!==0){bitmap.close();state.droppedPresentation++;return;}
    try{
     self.postMessage({cmd:'callHandler',handler:'r5MenuFrame',args:[bitmap,info,presentation]},[bitmap]);
     state.bitmaps++;
    }catch(error){bitmap.close();Atomics.store(pending,0,0);throw error;}
   },
   onReport(info){
    if(info.fatal)return fail(Error(info.fatal));
    state.last=info;state.maxAccepted=Math.max(state.maxAccepted,info.accepted);report();
   }
  });
  state.ready=true;report(true);
 })().catch(fail);
}
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 state.received++;
 if(state.fatal)return;
 if(!Number.isSafeInteger(info.seq)||info.seq<=lastSequence){fail(Error('R5L sequence out of order'));return;}
 lastSequence=info.seq;
 if(!live){state.droppedInit++;initialize(api);report();return;}
 if(busy){state.droppedBusy++;report();return;}
 busy=true;
 try{
  const capture=readFrameCapture(bytes,{hash});
  if(capture.frames.length!==1||capture.blobs.size)throw Error('Expected single R5L frame without BLOB');
  // submit copies guest resources synchronously BEFORE its first await.
  const submitted=live.submit({sequence:info.seq,events:[...replayEvents(capture,0)]});
  state.submitted++;
  return submitted.catch(fail).finally(()=>{busy=false;report();});
 }catch(error){busy=false;fail(error);}
};
