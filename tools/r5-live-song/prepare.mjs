// Live adapter derived from the verified 2D DRAW adapter. No Node or fetch.
// Owns the bytes it reads; unknown states are reported by the consumer.
import {prepareTextureBase} from "../r5-menu/texture-layout.mjs";
import {preparePrimitive} from "../r5-menu/primitive.mjs";
export function prepareSongDraw(d, readPhysical, shaders){
const id=d?.index;
const reject=m=>{throw Error('2D DRAW not supported: '+m);};
const hex=n=>n.toString(16).toUpperCase().padStart(16,'0');const vs=shaders[hex(d.vs)],ps=shaders[hex(d.ps)];
if(!vs||!ps||d.unsupported||!d.issued)reject('shader/producer');
if(d.vertices.length!==1||d.vertices[0].slot!==95||d.textures.length!==1||d.textures[0].slot!==0||d.primitive!==13||d.indexSource!==0||d.indexCount<4||d.indexCount%4)reject('fetches/quad');
const r=d.registers.slice(), f=i=>new DataView(r.buffer).getFloat32(i*4,true);
const v=d.vertices[0], t=d.textures[0];
const phys=v.phys??((v.raw[0]&~3)>>>0);
const bytes=v.bytes??(((v.raw[1]>>>2)&0xffffff)*4);
const b={phys,data:readPhysical(phys,bytes).slice(),srcChanged:false};
if(!b||b.data.length<16*d.indexCount||(v.raw[0]&~3)>>>0!==b.phys||(v.raw[1]&3)!==2||(r[0x2102]&0xffffff)!==0)reject('vertex range/endian/base');
if(b.srcChanged||d.srcChanged||t.dependency>1||t.mipMax||t.mipMin||t.raw[0]&0x3fc||t.raw[3]&1||t.raw[3]&0x7e000)reject('texture dependency/sign/exponent/mips');
if(r[0x2206]!==0x43f||r[0x2204]!==0x80000||((r[0x2205]&(1<<16))&&r[0x2080])||r[0x2202]&16)reject('clip/viewport/coverage');
if(r[0x2200]&128)reject('separate backface stencil');
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
const pack=(s,base)=>{const b=new Uint8Array(Math.max(16,s.constants.length*16));s.constants.forEach((c,i)=>b.set(new Uint8Array(r.buffer,(base+c*4)*4,16),i*16));return b;};
const bool=new Uint8Array(r.buffer.slice(0x4900*4,(0x4900+40)*4));
const texture=prepareTextureBase(t,readPhysical(t.basePhys,t.baseBytes).slice());
const p=preparePrimitive(d);
const assets={'system.bin':system,'fetch.bin':fetch,'float-vs.bin':pack(vs,0x4000),'float-ps.bin':pack(ps,0x4400),'bool.bin':bool,'memory.bin':b.data,'texture.bin':texture.data,'indices.bin':new Uint8Array(p.indices.buffer)};
const sampler={mag:t.raw[3]>>>19&3,min:t.raw[3]>>>21&3,mip:t.raw[3]>>>23&3,clampX:t.raw[0]>>>10&7,clampY:t.raw[0]>>>13&7};
if(sampler.mag>1||sampler.min>1||sampler.mip>1||sampler.clampX>2||sampler.clampY>2)reject('sampler');
const manifest={scope:'One original captured DRAW on an isolated transparent target; NOT complete menu or original EDRAM',draw:id,width:1280,height:720,
 originalEdramPrior:d.edramPrior,vs:hex(d.vs),ps:hex(d.ps),indices:p.indices.length,
 texture:{width:texture.width,height:texture.height,format:texture.format,bytesPerRow:texture.bytesPerRow,rowsPerImage:texture.rowsPerImage},
 sampler,blend:r[0x2201],raster:r[0x2205],depth:r[0x2200],stencil:r[0x210d],target:{surface:r[0x2000],color0:r[0x2001],depth:r[0x2005]}};
return {manifest,assets};
}
