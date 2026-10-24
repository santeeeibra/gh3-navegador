import fs from 'node:fs';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const capture=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()});
const hex=n=>n.toString(16).toUpperCase().padStart(16,'0');
const selected=[];
for(const d of replayEvents(capture,3)){
 if(d.type!=='draw')continue;
 const r=d.registers;
 selected.push({draw:d.index,vs:hex(d.vs),ps:hex(d.ps),primitive:d.primitive,count:d.indexCount,
  vte:r[0x2206].toString(16),clip:r[0x2204].toString(16),depth:r[0x2200].toString(16),color:r[0x2202].toString(16),
  mask:r[0x2104].toString(16),viewport:Array.from(r.slice(0x210f,0x2115)),
  vertices:d.vertices.map(v=>({slot:v.slot,raw:Array.from(v.raw),bytes:capture.blobs.get(v.blob)?.data.length,phys:capture.blobs.get(v.blob)?.phys})),
  textures:d.textures.map(t=>({slot:t.slot,format:t.format,width:t.width+1,height:t.height+1,mips:t.mipMax,dependency:t.dependency,bytes:t.baseBytes})),
  edram:d.edramPrior});
}
fs.writeFileSync('artifacts/r5-menu/draw-states.json',JSON.stringify(selected,null,2));
console.log(JSON.stringify(selected.filter(d=>d.primitive===13).slice(0,5),null,2));
