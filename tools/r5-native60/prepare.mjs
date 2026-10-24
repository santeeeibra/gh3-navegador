import {prepareLiveSongDraw} from './snapshot-prepare.mjs';
const stride={'80708BD1B82638B0':5,'582ABCF5FF619A55':7,'19815E13AC0DCC92':7,'10CA3B730086027C':6,'035C1CB9583C0C7E':6};
export function prepareNativeDraw(draw,resources,shaders){
 const input=prepareLiveSongDraw(draw,resources,shaders), vs=input.manifest.vs;
 input.manifest.identity=JSON.stringify([vs,input.manifest.ps,draw.vertices.map(v=>[v.slot,v.raw[0]&~3,v.raw[1]])]);
 if(stride[vs]&&draw.vertices.length===1){
  input.manifest.motion={stride:stride[vs],count:Math.floor(input.assets['memory.bin'].length/(stride[vs]*4))};
 }
 return input;
}
