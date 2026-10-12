// Isolated DRAW fixture, not a full framebuffer replay. Guest positions, colors,
// UVs, constants and shaders are retained. Only the single vertex address is
// rebased to offset zero; these two audited shaders have no memory exports.
import fs from 'node:fs';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
import {prepareTextureBase} from './texture-layout.mjs';
import {preparePrimitive} from './primitive.mjs';
const c=readFrameCapture(fs.readFileSync('artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'),{hash:await createHash()});
function prepare(id){
const d=[...replayEvents(c,3)].find(e=>e.type==='draw'&&e.index===id);
const reject=m=>{throw Error('2D DRAW not supported: '+m);};
if(!d||d.vs!==0xB43CF443883B8351n||d.ps!==0x526B394DE2AB8891n||d.unsupported||!d.issued)reject('shader/producer');
if(d.vertices.length!==1||d.vertices[0].slot!==95||d.textures.length!==1||d.textures[0].slot!==0||d.primitive!==13||d.indexSource!==0||d.indexCount<4||d.indexCount%4)reject('fetches/quad');
const r=d.registers, f=i=>new DataView(r.buffer).getFloat32(i*4,true);
const v=d.vertices[0], b=c.blobs.get(v.blob), t=d.textures[0];
if(!b||b.data.length!==28*d.indexCount||(v.raw[0]&~3)>>>0!==b.phys||(v.raw[1]&3)!==2||(r[0x2102]&0xffffff)!==0)reject('vertex range/endian/base');
if(b.srcChanged||d.srcChanged||t.dependency>1||t.mipMax||t.mipMin||t.raw[0]&0x3fc||t.raw[3]&1||t.raw[3]&0x7e000)reject('texture dependency/sign/exponent/mips');
if(r[0x2206]!==0x43f||r[0x2204]!==0x80000||((r[0x2205]&(1<<16))&&r[0x2080])||r[0x2202]&16)reject('clip/viewport/coverage');
if(r[0x2200]&1||r[0x2200]&4||((r[0x2200]>>4)&7)!==7)reject('stencil/depth dependency');
if((r[0x2000]>>>16)&3||(r[0x2001]>>>16)&15||(r[0x2104]&0xffff)!==15)reject('targets/MSAA');
if((r[0x2205]&3)!==0&&(r[0x2205]&3)!==2)reject('culling mode');
if(r[0x2081]||r[0x2082]!==((720<<16)|1280))reject('scissor');
if(f(0x210f)!==640||f(0x2110)!==640||f(0x2111)!==-360||f(0x2112)!==360||f(0x2113)!==1||f(0x2114)!==0)reject('viewport values');
const system=new Uint8Array(528), sv=new DataView(system.buffer);
const u=(o,x)=>sv.setUint32(o,x>>>0,true), fl=(o,x)=>sv.setFloat32(o,x,true);
u(0,(r[0x2206]&0x700)|(1<<11)|((r[0x2202]&8?r[0x2202]&7:7)<<16));
u(8,0);u(12,0xffffffff);u(16,r[0x2102]&0xffffff);
u(512,r[0x2101]&0xffffff);u(516,r[0x2100]&0xffffff);
// SDK GetHostViewportInfo clip-disable branch with origin_bottom_left=false,
// matching Vulkan. Naga's SPIR-V conversion adds the final Y inversion.
const half=r[0x2302]&1?0:0.5;
fl(128,1);fl(132,-1);fl(136,1);fl(144,half*2/1280);fl(148,half*2/720);
u(288,r[0x210e]);u(224,t.raw[3]>>>1&0xfff);
for(let i=0;i<4;i++){
 const bias=(r[0x2001+i]<<6)>>26;u(304+i*4,0x3f800000+bias*0x800000);
}
const fetch=new Uint8Array(r.buffer.slice(0x4800*4,(0x4800+192)*4));
const fv=new DataView(fetch.buffer);fv.setUint32(95*8,v.raw[0]&3,true);
const floats=new Uint8Array(32);floats.set(new Uint8Array(r.buffer, (0x4000+154*4)*4,16));floats.set(new Uint8Array(r.buffer,(0x4000+255*4)*4,16),16);
const texture=prepareTextureBase(t,c.blobs.get(t.baseBlob).data);
const p=preparePrimitive(d);
const dir=`artifacts/r5-menu/isolated-draw-${id}`;fs.mkdirSync(dir,{recursive:true});
const assets={'system.bin':system,'fetch.bin':fetch,'float-vs.bin':floats,'memory.bin':b.data,'texture.bin':texture.data,'indices.bin':new Uint8Array(p.indices.buffer)};
for(const [name,data] of Object.entries(assets))fs.writeFileSync(`${dir}/${name}`,data);
const sampler={mag:t.raw[3]>>>19&3,min:t.raw[3]>>>21&3,mip:t.raw[3]>>>23&3,clampX:t.raw[0]>>>10&7,clampY:t.raw[0]>>>13&7};
if(sampler.mag>1||sampler.min>1||sampler.mip>1||sampler.clampX>2||sampler.clampY>2)reject('sampler');
const manifest={scope:'One original captured DRAW on an isolated transparent target; NOT complete menu or original EDRAM',draw:id,width:1280,height:720,
 originalEdramPrior:d.edramPrior,vs:'B43CF443883B8351',ps:'526B394DE2AB8891',indices:p.indices.length,
 texture:{width:texture.width,height:texture.height,format:texture.format,bytesPerRow:texture.bytesPerRow,rowsPerImage:texture.rowsPerImage},
 sampler,blend:r[0x2201],raster:r[0x2205],depth:r[0x2200],target:{surface:r[0x2000],color0:r[0x2001],depth:r[0x2005]}};
fs.writeFileSync(`${dir}/manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify(manifest));
return manifest;
}
if(process.argv[2]==='--layers'){
 const layers=[],rejected=[];
 // This is a partial pass over the captured menu, not a substitute for omitted draws.
 for(const d of replayEvents(c,3))if(d.type==='draw'&&d.index>=395&&d.index<=438){
  try{
   const m=prepare(d.index);
   if(layers.length&&JSON.stringify(m.target)!==JSON.stringify(layers[0].target))reject('different original target');
   layers.push(m);
  }catch(e){rejected.push({draw:d.index,reason:e.message});}
 }
 fs.writeFileSync('artifacts/r5-menu/menu-layers.json',JSON.stringify({scope:'Partial original 2D menu layers on isolated target; omitted draws and COPY are not replayed',layers,rejected},null,2));
 console.log(JSON.stringify({accepted:layers.map(x=>x.draw),rejected}));
}else prepare(Number(process.argv[2]??395));
