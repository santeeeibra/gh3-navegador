// Partial original replay. No COPY/EDRAM; mipmapped textures use base level only.
import {prepareTextureBase} from '../r5-menu/texture-layout.mjs';
import {preparePrimitive} from '../r5-menu/primitive.mjs';
import {isBinkDraw} from './bink.mjs';
const hex=n=>n.toString(16).toUpperCase().padStart(16,'0');
const equal=(a,b)=>{if(!a||a.length!==b.length)return false;const av=new Uint32Array(a.buffer,a.byteOffset,a.length>>>2),bv=new Uint32Array(b.buffer,b.byteOffset,b.length>>>2);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return false;for(let i=av.length*4;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
export function createResourceReader(readPhysical){
 const textures=new Map();let frameReads=new Map(),sequence=0,revision=0;
 const stats={readBytes:0,reads:0,textureDecodes:0,textureReuses:0};
 const read=(p,n)=>{if(!Number.isInteger(p)||!Number.isInteger(n)||n<0||n>16*1024*1024)throw Error('Resource range');const key=p+':'+n;let b=frameReads.get(key);if(!b){b=readPhysical(p,n).slice();if(b.length!==n)throw Error('Short physical read');stats.readBytes+=n;stats.reads++;frameReads.set(key,b);}return b;};
 return {stats,read,begin(){sequence++;frameReads=new Map();for(const [k,t] of textures)if(sequence-t.last>120)textures.delete(k);},texture(t){
  const key=JSON.stringify([t.basePhys,t.baseBytes,...t.raw]),raw=read(t.basePhys,t.baseBytes);let c=textures.get(key);
  if(c?.last===sequence)return c;
  if(!c||!equal(c.raw,raw)){const prepared=prepareTextureBase(t,raw);c={...prepared,key:key+':'+(++revision),raw,last:sequence};textures.set(key,c);stats.textureDecodes++;}else{c.last=sequence;stats.textureReuses++;}
  return c;
 }};
}
export function prepareLiveSongDraw(d,resources,shaders){
 const vs=shaders[hex(d.vs)],ps=shaders[hex(d.ps)],r=d.registers;
 const video=isBinkDraw(d);
 if(!d.issued||d.unsupported)throw Error('Producer unsupported');
 if(!vs||!ps)throw Error('Shader missing/rejected '+hex(d.vs)+'/'+hex(d.ps));
 if(!d.vertices.length||d.vertices.some(v=>v.status))throw Error('Vertex status');
 if((r[0x2000]>>>16)&3||(r[0x2001]>>>16&15)!==0)throw Error('MSAA/target format');
 if(r[0x2200]&128)throw Error('Back stencil');
 const fetch=new Uint8Array(r.buffer.slice(0x4800*4,(0x4800+192)*4)),fv=new DataView(fetch.buffer),parts=[];let extent=0;
 for(const v of d.vertices){
  const phys=(v.raw[0]&~3)>>>0,bytes=(v.raw[1]>>>2&0xffffff)*4;
  if(!bytes||extent+bytes>16*1024*1024)throw Error('Vertex budget');
  const data=resources.read(phys,bytes);fv.setUint32(v.slot*8,extent|(v.raw[0]&3),true);parts.push({offset:extent,data});extent+=bytes;
 }
 const memory=new Uint8Array(extent);for(const p of parts)memory.set(p.data,p.offset);
 const ib=d.indexSource===1?{phys:d.indexPhys,data:resources.read(d.indexPhys,d.indexBytes)}:undefined;
 const p=preparePrimitive(d,ib);if(p.topology!=='triangle-list')throw Error('Nontriangle topology');
 const system=new Uint8Array(528),sv=new DataView(system.buffer),u=(o,v)=>sv.setUint32(o,v>>>0,true),fl=(o,v)=>sv.setFloat32(o,v,true),f=i=>new DataView(r.buffer).getFloat32(i*4,true);
 u(0,(r[0x2206]&0x700)|(1<<11)|((r[0x2202]&8?r[0x2202]&7:7)<<16));u(8,video?d.indexEndian:0);u(12,video?0:0xffffffff);u(16,r[0x2102]&0xffffff);u(512,r[0x2101]&0xffffff);u(516,r[0x2100]&0xffffff);
 const half=r[0x2302]&1?0:0.5;
 // SDK viewport mapping onto our 1280x720 target; Naga applies final Y flip.
 if((r[0x2206]&63)!==63){
  // Bink supplies screen-space vertices and disables the hardware viewport.
  // Never use stale 3D viewport registers for this draw.
  if(!video||(r[0x2206]&63))throw Error('Viewport enable');
  fl(128,1/640);fl(132,1/360);fl(136,1);fl(144,-1+half/640);fl(148,-1+half/360);fl(152,0);
 }else{fl(128,f(0x210f)/640);fl(132,f(0x2111)/360);fl(136,f(0x2113));fl(144,(f(0x2110)-640+half)/640);fl(148,(f(0x2112)-360+half)/360);fl(152,f(0x2114));}
 u(288,r[0x210e]);
 const textures=[];let approximatedMips=0;
 for(const t of d.textures){
  if(t.baseDependency>1)throw Error('Texture GPU dependency');
  if(t.raw[0]&0x3fc||t.raw[3]&1||t.raw[3]&0x7e000)throw Error('Texture sign/exponent');
  if(t.mipMin)throw Error('Nonzero base LOD');
  const prepared=resources.texture(t);if(prepared.cube)throw Error('Cube texture');
  // Movie frames change continuously. A stable upload slot prevents retaining
  // a new GPU texture and worker transport entry for every decoded frame.
  const texture=video?{...prepared,video:true,key:'bink:'+JSON.stringify([t.basePhys,t.baseBytes,...t.raw])}:prepared;
  if(video){
   // Xenos packs two 12-bit fetch swizzles into each system dword.
   const offset=224+Math.floor(t.slot/2)*4,shift=(t.slot%2)*12;
   u(offset,sv.getUint32(offset,true)|((t.raw[3]>>>1&0xfff)<<shift));
  }else u(224+t.slot*4,t.raw[3]>>>1&0xfff);
  const sampler={mag:t.raw[3]>>>19&3,min:t.raw[3]>>>21&3,mip:t.raw[3]>>>23&3,clampX:t.raw[0]>>>10&7,clampY:t.raw[0]>>>13&7};
  if(sampler.mag>1||sampler.min>1||sampler.mip>1||sampler.clampX>2||sampler.clampY>2)throw Error('Sampler');
  if(t.mipMax)approximatedMips++;
  textures.push({slot:t.slot,texture,sampler});
 }
 for(let i=0;i<4;i++){const bias=(r[0x2001+i]<<6)>>26;u(304+i*4,0x3f800000+bias*0x800000);}
 const pack=(s,base)=>{const b=new Uint8Array(Math.max(16,s.constants.length*16));s.constants.forEach((c,i)=>b.set(new Uint8Array(r.buffer,(base+c*4)*4,16),i*16));return b;};
 const tl=r[0x2081],br=r[0x2082],x=Math.min(1280,tl&0x7fff),y=Math.min(720,tl>>>16&0x7fff),right=Math.min(1280,br&0x7fff),bottom=Math.min(720,br>>>16&0x7fff);
 return {manifest:{draw:d.index,vs:vs.id,ps:ps.id,video,indices:p.indices.length,blend:r[0x2201],raster:r[0x2205],depth:r[0x2200],stencil:r[0x210d],writeMask:r[0x2104]&15,scissor:[x,y,Math.max(0,right-x),Math.max(0,bottom-y)],approximatedMips},
  textures,assets:{'memory.bin':memory,'system.bin':system,'float-vs.bin':pack(vs,0x4000),'float-ps.bin':pack(ps,0x4400),'fetch.bin':fetch,'bool.bin':new Uint8Array(r.buffer.slice(0x4900*4,(0x4900+40)*4)),'indices.bin':new Uint8Array(p.indices.buffer)}};
}
