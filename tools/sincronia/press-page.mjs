import {createPressWriter,eventEpoch} from './press-queue.mjs';
(() => {
  const channel=new BroadcastChannel('hw60');let writer=null,lastEvent=null,header=null;
  const st=window.syncPress={events:[],acks:[],mode:new URLSearchParams(location.search).get('syncpress')==='1'?1:0};
  for(const type of ['keydown','keyup','pointerdown','pointermove','pointerup','pointercancel'])addEventListener(type,e=>{
    const mark=eventEpoch(e.timeStamp,performance.timeOrigin,performance.now());
    lastEvent={...mark,type};queueMicrotask(()=>{if(lastEvent?.type===type&&lastEvent.at===mark.at)lastEvent=null;});
  },true);
  channel.addEventListener('message',e=>{
    const d=e.data;if(d?.type!=='syncPressMemory')return;
    const m=window.g1mem;if(!m?.sab||!m.seg)return;
    writer=createPressWriter(m.sab,d.ptr,m.seg);st.ptr=d.ptr;
    header=new Int32Array(m.sab,d.ptr,8);Atomics.store(header,4,st.mode);
  });
  window.syncPressWrite=(buttons,triggers,source,seq,explicitAt)=>{
    if(!writer||!window.gh3Input?.songMode?.())return;
    const writtenAt=performance.timeOrigin+performance.now();
    const mark=Number.isFinite(explicitAt)?{at:explicitAt,flags:4}:lastEvent||{at:writtenAt,flags:2};
    const id=writer({eventAt:mark.at,writtenAt,buttons,triggers,source,flags:mark.flags,seq});
    if(st.events.length<2000)st.events.push({id,eventAt:mark.at,writtenAt,buttons,triggers,source,flags:mark.flags,seq});
  };
  channel.addEventListener('message',e=>{if(e.data?.type==='syncPressEval'&&st.acks.length<2000)st.acks.push(e.data);});
  Object.defineProperty(st,'queueStats',{enumerable:true,get:()=>header?{written:Atomics.load(header,1)>>>0,read:Atomics.load(header,2)>>>0,dropped:Atomics.load(header,3)>>>0,rejected:Atomics.load(header,5)>>>0}:null});
})();
