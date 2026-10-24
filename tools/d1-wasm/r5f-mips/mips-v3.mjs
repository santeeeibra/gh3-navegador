import fs from 'node:fs';
import {readFrameCapture,replayEvents} from '../../r5-menu/frame-reader.mjs';
import {createHash} from '../../r5-menu/hash.mjs';
const source='artifacts/d1-wasm/r5frame-v3/runs/r5f-v3-menu-r5frame-s8915.r5f';
const capture=readFrameCapture(fs.readFileSync(source),{hash:await createHash()});
const fixture=JSON.parse(fs.readFileSync('artifacts/gpu-capture/r5f-v2/prep-new/menu-layers.json'));
const selected=new Set(fixture.layers.map(m=>m.captureIndex));
const results=[];
for(const e of replayEvents(capture,3))if(e.type==='draw')for(const t of e.textures)if(t.mipMax>0)
 results.push({draw:e.index,inSelected44:selected.has(e.index),slot:t.slot,raw:Array.from(t.raw),width:t.width+1,height:t.height+1,mipMin:t.mipMin,mipMax:t.mipMax,mipPhys:t.mipPhys,mipBytes:t.mipBytes,mipBlob:t.mipBlob,packedMips:t.packedMips,basePhys:t.basePhys,baseBytes:t.baseBytes,status:t.status});
const report={source,frame:3,purpose:'Descriptor evidence only; mipMax alone does not prove a draw samples a missing mip',textureReferences:results.length,uniqueDescriptors:new Set(results.map(r=>JSON.stringify(r.raw))).size,selected44References:results.filter(r=>r.inSelected44).length,results};
fs.writeFileSync('artifacts/d1-wasm/r5frame-v3/runs/mips-v3.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined}));
