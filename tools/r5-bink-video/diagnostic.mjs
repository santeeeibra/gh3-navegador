import '../r5-live-song/live-consumer.mjs';
import {readLiveDraws} from '../r5-live-song/live-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {createResourceReader,prepareLiveSongDraw} from '../r5-live-song/live-prepare.mjs';
const render=globalThis.__r5liveConsumer,shaders=__SONG_SHADERS__;
let hash,last=0,n=0;createHash().then(h=>hash=h);
globalThis.__r5liveConsumer=(bytes,info,api)=>{
 if(hash&&n<24&&performance.now()-last>1800){
  const counts={},draws=[],resources=[],ranges=new Set(),reader=createResourceReader(api.readPhysical);reader.begin();
  const take=(p,length)=>{const key=p+':'+length;if(ranges.has(key)||!length)return;ranges.add(key);if(length>16*1024*1024)return;try{resources.push({phys:p,length,data:api.readPhysical(p,length).slice().buffer});}catch{}};
  for(const d of readLiveDraws(bytes,{hash,counts})){
   if((d.registers[0x2206]&63)===63&&!d.textures.some(t=>t.format===2))continue;
   let rejection=null;try{prepareLiveSongDraw(d,reader,shaders);}catch(e){rejection=e.message;}
   draws.push({index:d.index,vs:d.vs.toString(16),ps:d.ps.toString(16),primitive:d.primitive,indexCount:d.indexCount,issued:d.issued,unsupported:d.unsupported,rejection,vte:d.registers[0x2206],blend:d.registers[0x2201],depth:d.registers[0x2200],scissor:[d.registers[0x2081],d.registers[0x2082]],textures:d.textures.map(t=>({...t,raw:[...t.raw]})),vertices:d.vertices.map(v=>({...v,raw:[...v.raw]}))});
   for(const v of d.vertices)take((v.raw[0]&~3)>>>0,(v.raw[1]>>>2&0xffffff)*4);
   if(d.indexSource===1)take(d.indexPhys,d.indexBytes);
   for(const t of d.textures)take(t.basePhys,t.baseBytes);
  }
  if(draws.length){last=performance.now();const frame=bytes.slice().buffer;self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{videoCapture:{id:n++,info,draws,counts,frame,resources}}]},[frame,...resources.map(r=>r.data)]);}
 }
 return render(bytes,info,api);
};
