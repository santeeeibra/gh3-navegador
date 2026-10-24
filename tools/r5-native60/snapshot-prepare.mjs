// Partial original replay. No COPY/EDRAM; mipmapped textures use base level only.
import {prepareTextureBase} from '../r5-menu/texture-layout.mjs';
import {preparePrimitive} from '../r5-menu/primitive.mjs';
import {isBinkDraw} from '../r5-live-song/bink.mjs';
const hex=n=>n.toString(16).toUpperCase().padStart(16,'0');
const equal=(a,b)=>{if(!a||a.length!==b.length)return false;let end=0;if(!(a.byteOffset%4||b.byteOffset%4)){const av=new Uint32Array(a.buffer,a.byteOffset,a.length>>>2),bv=new Uint32Array(b.buffer,b.byteOffset,b.length>>>2);for(let i=0;i<av.length;i++)if(av[i]!==bv[i])return false;end=av.length*4;}for(let i=end;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
export function createResourceReader(readPhysical,{resourceHash,rangeBudget=8*1024*1024}={}){
 const textures=new Map();let frameReads=new Map(),sequence=0,revision=0;
 const ranges=new Map();let rangeBytes=0;
 const memo={geometry:new Map(),primitives:new Map()};
 const stats={readBytes:0,reads:0,textureDecodes:0,textureReuses:0,copiedBytes:0,comparedBytes:0,hashCalls:0,hashBytes:0,hashReuses:0,hashReusedBytes:0,hashFallbacks:0,hashUnstable:0,unchangedCopyBytesAvoided:0,rangeCacheBytes:0};
 const validate=(p,n)=>{if(!Number.isInteger(p)||p<0||p>0xffffffff||!Number.isInteger(n)||n<0||n>16*1024*1024)throw Error('Resource range');};
 const fingerprint=(p,n)=>{
  if(typeof resourceHash!=='function')return null;
  stats.hashCalls++;stats.hashBytes+=n;
  try{const h=resourceHash(p,n);if(typeof h==='string'&&/^(?:[a-f0-9]{16}|[a-f0-9]{32})$/i.test(h))return h.toLowerCase();}catch{}
  stats.hashFallbacks++;return null;
 };
 const live=(p,n)=>{validate(p,n);const b=readPhysical(p,n);if(!(b instanceof Uint8Array)||b.length!==n)throw Error('Short physical read');stats.readBytes+=n;stats.reads++;return b;};
 const copy=b=>{stats.copiedBytes+=b.length;return b.slice();};
 // Bind a digest only to the copy we took, never to a range modified during copying.
 const confirmed=(p,n,h)=>h!==null&&fingerprint(p,n)===h?h:null;
 const reuse=(n)=>{stats.hashReuses++;stats.hashReusedBytes+=n;};
 const remember=(key,b,h)=>{
  const old=ranges.get(key);if(old){rangeBytes-=old.data.length;ranges.delete(key);}
  if(h!==null&&b.length<=rangeBudget){ranges.set(key,{data:b,hash:h,last:sequence});rangeBytes+=b.length;}
  while(rangeBytes>rangeBudget){const k=ranges.keys().next().value;rangeBytes-=ranges.get(k).data.length;ranges.delete(k);}
  stats.rangeCacheBytes=rangeBytes;
 };
 const read=(p,n)=>{
  validate(p,n);const key=p+':'+n;let b=frameReads.get(key);if(b)return b;
  const h=fingerprint(p,n),c=ranges.get(key);
  if(h!==null&&c?.hash===h&&c.data.length===n){b=c.data;c.last=sequence;ranges.delete(key);ranges.set(key,c);reuse(n);}
  else{b=copy(live(p,n));const checked=confirmed(p,n,h);if(h!==null&&checked===null)stats.hashUnstable++;remember(key,b,checked);}
  frameReads.set(key,b);return b;
 };
 return {stats,read,memo,begin(){sequence++;frameReads=new Map();memo.geometry.clear();memo.primitives.clear();for(const [k,t] of textures)if(sequence-t.last>120)textures.delete(k);for(const [k,c] of ranges)if(sequence-c.last>120){rangeBytes-=c.data.length;ranges.delete(k);}stats.rangeCacheBytes=rangeBytes;},texture(t){
  validate(t.basePhys,t.baseBytes);const key=JSON.stringify([t.basePhys,t.baseBytes,...t.raw]);let c=textures.get(key);
  if(c?.last===sequence)return c;
  const h=fingerprint(t.basePhys,t.baseBytes);
  if(h!==null&&c?.hash===h){c.last=sequence;stats.textureReuses++;reuse(t.baseBytes);return c;}
  // With old runtimes (or a changed hash), compare the live view BEFORE allocating.
  const source=live(t.basePhys,t.baseBytes),compare=!!c&&(h===null||c.hash===null);if(compare)stats.comparedBytes+=source.length;
  if(compare&&equal(c.raw,source)){
   c.last=sequence;c.hash=confirmed(t.basePhys,t.baseBytes,h);if(h!==null&&c.hash===null)stats.hashUnstable++;stats.textureReuses++;stats.unchangedCopyBytesAvoided+=source.length;
  }else{
   const raw=copy(source),checked=confirmed(t.basePhys,t.baseBytes,h);if(h!==null&&checked===null)stats.hashUnstable++;
   const prepared=prepareTextureBase(t,raw);c={...prepared,key,revision:++revision,raw,hash:checked,last:sequence};textures.set(key,c);stats.textureDecodes++;
  }
  return c;
 }};
}
export function prepareLiveSongDraw(d,resources,shaders){
 const vs=shaders[hex(d.vs)],ps=shaders[hex(d.ps)],r=d.registers;
 const video=isBinkDraw(d);
 if(!video && (r[0x2000]&0x3fff)!==1280)throw Error('Offscreen surface (COPY/EDRAM pending)');
 if(!d.issued||d.unsupported)throw Error('Producer unsupported');
 if(!vs||!ps)throw Error('Shader missing/rejected '+hex(d.vs)+'/'+hex(d.ps));
 if(!d.vertices.length||d.vertices.some(v=>v.status))throw Error('Vertex status');
 if((r[0x2000]>>>16)&3||(r[0x2001]>>>16&15)!==0)throw Error('MSAA/target format');
 if(r[0x2200]&128)throw Error('Back stencil');
 const geometryKey=JSON.stringify(d.vertices.map(v=>[v.slot,...v.raw]));
 let geometry=resources.memo?.geometry.get(geometryKey);
 const fetch=new Uint8Array(r.buffer.slice(0x4800*4,(0x4800+192)*4)),fv=new DataView(fetch.buffer),parts=[];let extent=0;
 for(const v of d.vertices){
  const phys=(v.raw[0]&~3)>>>0,bytes=(v.raw[1]>>>2&0xffffff)*4;
  if(!bytes||extent+bytes>16*1024*1024)throw Error('Vertex budget');
  fv.setUint32(v.slot*8,extent|(v.raw[0]&3),true);
  if(!geometry)parts.push({offset:extent,data:resources.read(phys,bytes)});extent+=bytes;
 }
 if(!geometry){geometry=new Uint8Array(extent);for(const p of parts)geometry.set(p.data,p.offset);resources.memo?.geometry.set(geometryKey,geometry);}
 const memory=geometry;
 const primitiveKey=JSON.stringify([d.primitive,d.indexCount,d.indexSource,d.indexFormat,d.indexEndian,d.indexPhys,d.indexBytes,r[0x2205]&(1<<21),r[0x2103]]);
 let p=resources.memo?.primitives.get(primitiveKey);
 if(!p){const ib=d.indexSource===1?{phys:d.indexPhys,data:resources.read(d.indexPhys,d.indexBytes)}:undefined;p=preparePrimitive(d,ib);resources.memo?.primitives.set(primitiveKey,p);}
 if(p.topology!=='triangle-list')throw Error('Nontriangle topology');
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
  if(ps.shadowless&&(t.slot===14||t.slot===15))continue;
  if(t.baseDependency>1)throw Error('Texture GPU dependency');
  if(t.raw[0]&0x3fc||t.raw[3]&1||t.raw[3]&0x7e000)throw Error('Texture sign/exponent');
  if(t.mipMin)throw Error('Nonzero base LOD');
  const prepared=resources.texture(t);
  // Movie frames change continuously. A stable upload slot prevents retaining
  // a new GPU texture and worker transport entry for every decoded frame.
  const texture=video?{...prepared,video:true,key:'bink:'+JSON.stringify([t.basePhys,t.baseBytes,...t.raw])}:prepared;
  {
   // Xenos packs two 12-bit fetch swizzles into each system dword.
   const offset=224+Math.floor(t.slot/2)*4,shift=(t.slot%2)*12;
   u(offset,sv.getUint32(offset,true)|((t.raw[3]>>>1&0xfff)<<shift));
  }
  const sampler={mag:t.raw[3]>>>19&3,min:t.raw[3]>>>21&3,mip:t.raw[3]>>>23&3,clampX:t.raw[0]>>>10&7,clampY:t.raw[0]>>>13&7};
  if(sampler.mag>1||sampler.min>1||sampler.mip>2||sampler.clampX>2||sampler.clampY>2)throw Error('Sampler');
  if(sampler.mip===2)sampler.mip=0;
  if(t.mipMax)approximatedMips++;
  textures.push({slot:t.slot,texture:{...texture,scene:!video&&!['B43CF443883B8351','87D4CAE67E72C501','582ABCF5FF619A55','80708BD1B82638B0','94B97981B512BDA2','19815E13AC0DCC92'].includes(vs.id)},sampler});
 }
 for(let i=0;i<4;i++){const bias=(r[0x2001+i]<<6)>>26;u(304+i*4,0x3f800000+bias*0x800000);}
 const pack=(s,base)=>{const b=new Uint8Array(Math.max(16,s.constants.length*16));s.constants.forEach((c,i)=>b.set(new Uint8Array(r.buffer,(base+c*4)*4,16),i*16));return b;};
 const tl=r[0x2081],br=r[0x2082],x=Math.min(1280,tl&0x7fff),y=Math.min(720,tl>>>16&0x7fff),right=Math.min(1280,br&0x7fff),bottom=Math.min(720,br>>>16&0x7fff);
 return {manifest:{draw:d.index,vs:vs.id,ps:ps.id,video,indices:p.indices.length,blend:r[0x2201],raster:r[0x2205],depth:r[0x2200],stencil:r[0x210d],writeMask:r[0x2104]&15,scissor:[x,y,Math.max(0,right-x),Math.max(0,bottom-y)],approximatedMips},
  textures,assets:{'memory.bin':memory,'system.bin':system,'float-vs.bin':pack(vs,0x4000),'float-ps.bin':pack(ps,0x4400),'fetch.bin':fetch,'bool.bin':new Uint8Array(r.buffer.slice(0x4900*4,(0x4900+40)*4)),'indices.bin':new Uint8Array(p.indices.buffer)}};
}
