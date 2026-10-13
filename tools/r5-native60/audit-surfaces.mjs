// Decode COPY and texture dependencies in the existing real capture. No GPU.
import fs from 'node:fs';
const cap=process.argv[2]||'artifacts/r5-scene-mobile/runs/fixed2-pc-capture/capture-1';
const bytes=fs.readFileSync(cap+'/frame.r5f'),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>v.getUint32(o,true);
let bank;const draws=[],copies=[];
for(let off=64;off<bytes.length;){
 const type=u(off),size=u(off+4),b=off+16;
 if(size<16||off+size>bytes.length)throw Error('Capture bounds');
 if(type===1)bank=new Uint32Array(0x5003).map((_,i)=>u(b+32+i*4));
 if(type===2)for(let i=0;i<u(b);i++)bank[u(b+8+i*8)]=u(b+12+i*8);
 if(type===5){
  const nv=u(b+52),nt=u(b+72),textures=[];
  for(let i=0;i<nt;i++){const p=b+96+nv*24+i*128;textures.push({slot:u(p),width:u(p+44),height:u(p+48),format:u(p+32),base:u(p+76),length:u(p+80),dependency:u(p+104),raw:[0,1,2,3,4,5].map(i=>u(p+4+i*4))});}
  draws.push({index:u(b),vs:v.getBigUint64(b+56,true).toString(16).toUpperCase(),ps:v.getBigUint64(b+64,true).toString(16).toUpperCase(),pitch:bank[0x2000]&0x3fff,colorBase:bank[0x2001]&0x7ff,colorFormat:bank[0x2001]>>>16&15,depthBase:bank[0x2002]&0x7ff,depthFormat:bank[0x2002]>>>16&1,scissor:[bank[0x2081]&0x7fff,bank[0x2081]>>>16&0x7fff,bank[0x2082]&0x7fff,bank[0x2082]>>>16&0x7fff],textures});
 }
 if(type===6){
  const r=Array.from({length:15},(_,i)=>u(b+8+i*4));
  copies.push({index:u(b),afterDraw:draws.at(-1)?.index,status:u(b+4),source:r[0]&7,colorBase:r[4],depthBase:r[3],sourcePitchTiles:r[(r[0]&7)===4?1:2]&1023,sourceWidth:(r[5]>>>5&2047)*8,sourceHeight:r[6]*8,destFormat:r[7]>>>7&63,destBase:r[9],destStart:r[10],destLength:r[11],destPitch:(r[8]&1023)*32,destHeight:(r[8]>>>10&1023)*32,flags:u(b+72),words:r});
 }
 off+=size;
}
const deps=draws.flatMap(d=>d.textures.filter(t=>t.dependency>1).map(t=>({draw:d.index,vs:d.vs,ps:d.ps,...t,resolves:copies.filter(c=>c.destStart<t.base+t.length&&t.base<c.destStart+c.destLength).map(c=>({index:c.index,afterDraw:c.afterDraw,source:c.source,format:c.destFormat,pitch:c.destPitch,sourceWidth:c.sourceWidth,sourceHeight:c.sourceHeight}))})));
const surfaces=[...new Set(draws.map(d=>JSON.stringify([d.pitch,d.colorBase,d.colorFormat,d.depthBase,d.depthFormat])))].map(s=>JSON.parse(s));
const report={capture:cap,draws:draws.length,copies,surfaces,dependencies:deps};
fs.writeFileSync('artifacts/r5-native60/surface-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({draws:draws.length,copies:copies.length,surfaces,dependencies:deps.slice(0,12)}));
