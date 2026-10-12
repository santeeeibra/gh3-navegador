// Diagnostic-only CP consumer: capture original song resources before any await.
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
const flag=new SharedArrayBuffer(4),control=new Int32Array(flag);
let hash;
createHash().then(h=>{hash=h;self.postMessage({cmd:'callHandler',handler:'songCaptureControl',args:[flag]});}).catch(e=>self.postMessage({cmd:'callHandler',handler:'songCaptureError',args:[e.message]}));
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 if(!hash||Atomics.exchange(control,0,0)!==1)return;
 const capture=readFrameCapture(bytes,{hash}),resources=new Map(),missing=[];
 let total=0;
 function take(phys,length){
  if(!length)return;
  const key=`${phys}:${length}`;if(resources.has(key))return;
  if(!Number.isSafeInteger(phys)||!Number.isSafeInteger(length)||length>16*1024*1024||total+length>96*1024*1024){missing.push({phys,length,reason:'resource budget/range'});return;}
  try{const data=api.readPhysical(phys,length).slice();if(data.length!==length)throw Error('Short physical read');resources.set(key,{phys,length,data:data.buffer});total+=length;}
  catch(e){missing.push({phys,length,reason:e.message});}
 }
 const events=[...replayEvents(capture,0)];if(!events.some(d=>d.type==='draw'&&d.issued)){Atomics.store(control,0,1);return;}
 for(const d of events){
  if(d.type!=='draw'||!d.issued||d.unsupported||d.primitive!==13||d.vertices.length!==1||d.textures.some(t=>t.dependency>1))continue;
  d.vertices.forEach(v=>{if(!v.status)take((v.raw[0]&~3)>>>0,((v.raw[1]>>>2)&0xffffff)*4);});
  if(d.indexSource===1)take(d.indexPhys,d.indexBytes);
  d.textures.forEach(t=>{if(!t.status){take(t.basePhys,t.baseBytes);take(t.mipPhys,t.mipBytes);}});
 }
 const data=[...resources.values()],owned=bytes.slice().buffer;
 self.postMessage({cmd:'callHandler',handler:'songCapture',args:[{info,bytes:owned,resources:data,missing,total}]},[owned,...data.map(r=>r.data)]);
};
