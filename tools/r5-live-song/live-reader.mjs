// Live-only projection of trusted local R5L. Offline readFrameCapture remains
// the full validator. Registers borrow ONE mutable bank: consume each draw
// synchronously before advancing this generator. No BLOB/COPY replay here.
const regs=0x5003,hex=n=>n.toString(16).toUpperCase().padStart(16,'0');
export function* readLiveDraws(bytes,{hash,wanted=null,verifyShaders=wanted,counts={}}={}){
 const fail=m=>{throw Error('R5L projection: '+m);};
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<112||bytes.byteLength>96*1024*1024||bytes.byteOffset%4)fail('input bounds/alignment');
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=o=>v.getUint32(o,true),q=o=>v.getBigUint64(o,true),words=(o,n)=>new Uint32Array(bytes.buffer,bytes.byteOffset+o,n);
 if(u(0)!==0x31463552||v.getUint16(4,true)!==1||v.getUint16(6,true)!==64||u(24)!==regs||u(20)!==1)fail('header');
 let bank,ended=false,footer=false;const shaders=new Set();
 for(let off=64;off<bytes.length;){
  if(off+16>bytes.length)fail('short record');const type=u(off),size=u(off+4),b=off+16,end=off+size;
  if(type<1||type>9||size<16||size%16||end>bytes.length||size>16*1024*1024)fail('record bounds/type');
  switch(type){
   case 1: if(size<48+regs*4||bank||u(b+16)!==1)fail('begin');bank=words(b+32,regs).slice();break;
   case 2: {if(!bank||size<32)fail('delta');const n=u(b);if(24+n*8>size)fail('delta size');for(let i=0;i<n;i++){const index=u(b+8+i*8);if(index>=regs)fail('register index');bank[index]=u(b+12+i*8);}break;}
   case 3: {if(size<48)fail('shader');const stage=u(b),n=u(b+4),id=hex(q(b+8)),nv=u(b+24),nt=u(b+28),p=b+32+(nv+nt)*8;if(stage>1||nv>96||nt>32||p+n*4>end)fail('shader bounds');shaders.add(stage+':'+id);
    if(!verifyShaders||verifyShaders.has(id)){const be=new Uint8Array(n*4);for(let i=0;i<n*4;i+=4)for(let j=0;j<4;j++)be[i+j]=bytes[p+i+3-j];if(hash(be)!==q(b+8))fail('shader hash');}break;}
   case 4: fail('unexpected BLOB');break;
   case 5: {
    if(!bank||size<112||ended)fail('draw order');const nv=u(b+52),nt=u(b+72);if(nv>96||nt>32||96+nv*24+nt*128>size-16)fail('fetch counts');
    const vs=q(b+56),ps=q(b+64);counts.draws=(counts.draws||0)+1;
    if(wanted&&!wanted.has(hex(vs))){counts.omitted=(counts.omitted||0)+1;break;}
    if((vs&&!shaders.has('0:'+hex(vs)))||(ps&&!shaders.has('1:'+hex(ps))))fail('missing shader');
    const status=u(b+4);if(status>4)fail('status');
    const d={type:'draw',index:u(b),status,issued:status===0||status===4,unsupported:u(b+8),primitive:u(b+12),indexCount:u(b+16),indexSource:u(b+28),indexFormat:u(b+32),indexEndian:u(b+36),indexPhys:u(b+40),indexBytes:u(b+44),vs,ps,vertices:[],textures:[],registers:bank};
    for(let i=0;i<nv;i++){const p=b+96+i*24,slot=u(p);if(slot>=96)fail('vertex slot');d.vertices.push({slot,raw:words(p+4,2),status:u(p+16)});}
    for(let i=0;i<nt;i++){const p=b+96+nv*24+i*128,slot=u(p);if(slot>=32)fail('texture slot');d.textures.push({slot,raw:words(p+4,6),status:u(p+28),format:u(p+32),endian:u(p+36),dimension:u(p+40),width:u(p+44),height:u(p+48),depth:u(p+52),pitch:u(p+56),tiled:u(p+60),mipMin:u(p+64),mipMax:u(p+68),packedMips:u(p+72),basePhys:u(p+76),baseBytes:u(p+80),baseDependency:u(p+104)});}
    yield d;break;
   }
   case 6: counts.copies=(counts.copies||0)+1;break;
   case 7: if(size!==48||!bank)fail('swap');counts.swap=u(b);ended=true;break;
   case 8: if(!ended)fail('end');break;
   case 9: if(!ended||end!==bytes.length)fail('footer');footer=true;break;
  }
  off=end;
 }
 if(!footer)fail('missing footer');
}
