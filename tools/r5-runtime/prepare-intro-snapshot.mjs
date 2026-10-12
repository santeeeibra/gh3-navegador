// Narrow guest -> GPU adapter for VS57F6 / PSAB00; no captured constants/pixels.
// Formulas: rexglue SDK d3d12/command_processor.cpp and util/draw.cpp.
export function prepareIntroSnapshot(s) {
  const reject=m=>{throw Error('Unsupported live intro: '+m);};
  if(s.unsupported)reject('producer reason '+s.header.reason);
  const h=s.header;
  if(h.primType!==6||h.indexCount!==4||h.indexSource!==0||s.vertex.byteLength!==80||s.vertex.endian!==2)reject('draw/vertices');
  const rv=new DataView(s.registers.buffer,s.registers.byteOffset,s.registers.byteLength),r=i=>rv.getUint32(i*4,true);
  const width=1280,height=720,vte=r(0x2206),raster=r(0x2205),control=r(0x2202);
  if(r(0x2204)!==0x90000||(vte&63)||((raster&(1<<16))&&r(0x2080))||r(0x2081)||r(0x2082)!==((height<<16)|width))reject('viewport/scissor/clip');
  if((r(0x2000)>>>16)&3||(r(0x2001)>>>16)&15||r(0x2200)&7||control&16||(r(0x2104)&0xffff)!==15)reject('MSAA/render target/depth/coverage/mask');
  const system=new Uint8Array(528),sv=new DataView(system.buffer);
  const u=(o,x)=>sv.setUint32(o,x,true),f=(o,x)=>sv.setFloat32(o,x,true);
  // SPIR-V flags: W division 8..10, polygon 11, depth format 15, alpha 16..18.
  const alpha=(control&8)?control&7:7;
  u(0,(vte&0x700)|(1<<11)|((r(0x2002)>>>16&1)<<15)|(alpha<<16));
  u(8,h.indexEndian);u(12,0);u(16,r(0x2102)&0xffffff);
  u(512,r(0x2101)&0xffffff);u(516,r(0x2100)&0xffffff);
  const half=(r(0x2302)&1)?0:0.5;
  // Disabled-clipping viewport rescaled to target; SPIR-V bottom-left Y convention.
  f(128,2/width);f(132,2/height);f(136,1);
  f(144,-1+half*2/width);f(148,-1+half*2/height);f(152,0);
  u(288,r(0x210e));
  for(let i=0;i<4;i++){
    const info=r(0x2001+i),fmt=info>>>16&15;
    if(fmt===4||fmt===5)reject('fixed16 exponent correction');
    const bias=(info<<6)>>26;u(304+i*4,(0x3f800000+bias*0x800000)>>>0);
  }
  const fetch=s.registers.slice(0x4800*4,(0x4800+192)*4);
  new DataView(fetch.buffer).setUint32(95*8,s.vertex.raw[0]&3,true);
  const floats=new Uint8Array(80);
  for(const [j,i] of [0,1,2,3,255].entries())floats.set(s.registers.subarray((0x4400+i*4)*4,(0x4400+i*4+4)*4),j*16);
  const textures=[],assets={'system-gpu.bin':system,'float-pixel.bin':floats,'fetch.bin':fetch,'memory.bin':s.vertex.data};
  for(const t of s.textures){
    const w=t.width+1,ht=t.height+1,chroma=t.slot===1||t.slot===2;
    if(t.dimension!==1||t.depth!==0||t.raw[1]&(1<<10)||t.format!==2||t.endian!==0||t.tiled||t.mipMin||t.mipMax||t.mipBytes||w!==(chroma?640:1280)||ht!==(chroma?360:720)||t.pitchBlocks!==(chroma?768:1280)||t.baseBytes<t.pitchBlocks*(ht-1)+w||t.baseBytes>t.pitchBlocks*ht)reject('texture layout '+t.slot);
    if(t.raw[0]&0x3fc||t.raw[3]&1||t.raw[3]&0x7e000)reject('texture signs/number format/exponent');
    const swizzle=t.raw[3]>>>1&0xfff;if(swizzle!==2560)reject('texture swizzle');
    const so=224+Math.floor(t.slot/2)*4;u(so,sv.getUint32(so,true)|(swizzle<<(12*(t.slot%2))));
    const tight=new Uint8Array(w*ht);for(let y=0;y<ht;y++)tight.set(t.base.subarray(y*t.pitchBlocks,y*t.pitchBlocks+w),y*w);
    if(t.slot===3&&tight.some(x=>x!==255))reject('translucent frame needs previous framebuffer');
    assets['texture-'+t.slot+'.bin']=tight;
    textures.push({texture:t.slot,width:w,height:ht,format:2,endian:0,magFilter:t.raw[3]>>>19&3,minFilter:t.raw[3]>>>21&3,mipFilter:t.raw[3]>>>23&3,clampX:t.raw[0]>>>10&7,clampY:t.raw[0]>>>13&7});
  }
  return {manifest:{width,height,textures,blendRegister:r(0x2201),colorMask:r(0x2104)&15,rasterRegister:raster,depthRegister:r(0x2200)},assets};
}
