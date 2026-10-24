import {prepareLiveMenuDraw} from './prepare.mjs';

// The producer owns stable per-event state; resource memory may change while read.
// submit never queues indefinitely: one active frame, incoming frames dropped.
export function createMenuConsumer(renderer,{readPhysical,context=null,onReport=()=>{}}){
 let busy=false,lastSequence=-1,stopped=false;
 const stats={received:0,presented:0,droppedBusy:0,unsupportedDraws:0,unsupportedCopies:0,skippedReasons:{},lastSequence:null,lastError:null};
 function skip(reason){stats.skippedReasons[reason]=(stats.skippedReasons[reason]??0)+1;}
 return {stats,stop(){stopped=true;},
  async submit(frame){
   stats.received++;
   if(stopped)throw Error('Consumer stopped');
   if(!Number.isSafeInteger(frame.sequence)||frame.sequence<=lastSequence||!Array.isArray(frame.events)||frame.events.length>4096)throw Error('Invalid/out-of-order live frame');
   lastSequence=frame.sequence;stats.lastSequence=frame.sequence;
   if(busy){stats.droppedBusy++;frame.release?.();return {dropped:true};}
   busy=true;
   try{
    const inputs=[];let target=null;
    // All guest reads happen before the first await, with private byte copies.
    for(const d of frame.events){
     if(d.type==='copy'){stats.unsupportedCopies++;skip('COPY/EDRAM');continue;}
     if(d.type!=='draw')continue;
     try{
      const input=prepareLiveMenuDraw(d,readPhysical),key=JSON.stringify(input.manifest.target);
      if(target!==null&&target!==key)throw Error('Different render target');
      if(inputs.length>=512)throw Error('Menu draw limit');
      target=key;inputs.push(input);
     }catch(e){stats.unsupportedDraws++;skip(e.message);}
    }
    const gpu=await renderer.render(inputs,{context});stats.presented++;
    const report={...stats,skippedReasons:{...stats.skippedReasons},gpu,accepted:inputs.length,sequence:frame.sequence};onReport(report);return report;
   }catch(e){stats.lastError=e.message;stopped=true;throw e;}
   finally{busy=false;frame.release?.();}
  }
 };
}
