// Decoder only: no guest translation, XXH3 verification, GPU upload or CP calls.
export const SNAPSHOT_V1={magic:0x31533552,version:1,headerBytes:192,maxBytes:4*1024*1024,regsDwords:0x5003};
export function readSnapshotV1(heap,ptr,used,expected={}) {
  const fail=message=>{throw Error('R5 snapshot: '+message);};
  if(!(heap instanceof Uint8Array))fail('fresh HEAPU8 required');
  if(!Number.isSafeInteger(ptr)||ptr<0||!Number.isSafeInteger(used)||used<192||used>SNAPSHOT_V1.maxBytes||ptr+used>heap.byteLength)fail('slot bounds');
  // Copy BEFORE decoding; returned views own this copy, not the producer's slot.
  const bytes=heap.slice(ptr,ptr+used),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u32=o=>v.getUint32(o,true),u64=o=>v.getBigUint64(o,true);
  if(u32(0)!==SNAPSHOT_V1.magic||v.getUint16(4,true)!==1||v.getUint16(6,true)!==192)fail('magic/version/header');
  if(u32(8)!==used)fail('used_bytes differs from delivery');
  if(bytes.subarray(148,192).some(x=>x))fail('reserved header bytes');
  const header={usedBytes:used,status:u32(12),reason:u32(16),slotIndex:u32(20),eventSeq:u64(24),drawIndex:u32(32),swapIndex:u32(36),skippedSincePrev:u32(40),vgtDrawInitiator:u32(44),primType:u32(48),indexCount:u32(52),majorModeExplicit:u32(56),indexSource:u32(60),indexFormat:u32(64),indexEndian:u32(68),indexPhys:u32(72),indexBytes:u32(76),vsHash:u64(112),psHash:u64(120),indexHash:u64(128)};
  if(header.slotIndex>1||header.status>1||header.majorModeExplicit>1)fail('invalid header enum');
  if(expected.slotIndex!==undefined&&header.slotIndex!==expected.slotIndex)fail('delivered slot mismatch');
  if(expected.eventSeq!==undefined&&header.eventSeq!==BigInt(expected.eventSeq))fail('delivered sequence mismatch');
  if(header.vsHash!==0x57F6448DAC5BEB74n||header.psHash!==0xAB008EF1D1A8CB6Dn)fail('unselected shader pair');
  const spans=[{start:0,end:192,name:'header'}];
  function block(off,len,name){
    if(!len){if(off!==0)fail(name+' absent offset');return new Uint8Array();}
    if(off<192||off%256||off+len>used)fail(name+' offset/length');
    const end=off+len;if(spans.some(s=>off<s.end&&end>s.start))fail(name+' overlaps');
    spans.push({start:off,end,name});return bytes.subarray(off,end);
  }
  function physical(addr,len,name){if(len&&(addr>=0x20000000||addr+len>0x20000000))fail(name+' physical bounds');}
  if(header.status===1){
    if(header.reason<1||header.reason>5)fail('unsupported reason');
    // v1 clarification: unsupported delivers header ONLY; no tables/data offsets.
    for(const o of [76,80,84,88,92,96,100,104,108,136,140,144])if(u32(o))fail('unsupported payload must be empty');
    if(used!==192)fail('unsupported header size');
    return {header,bytes,unsupported:true};
  }
  if(header.reason!==0||u32(88)!==SNAPSHOT_V1.regsDwords||u32(108)!==1||u32(140)!==4)fail('ok counts/reason');
  const vfOff=u32(136),tfOff=u32(144);block(vfOff,48,'vfetch table');block(tfOff,4*112,'tfetch table');
  const registers=block(u32(84),u32(88)*4,'registers');
  if(!u32(96)||!u32(104))fail('missing microcode');
  const vertexUcode=block(u32(92),u32(96)*4,'VS ucode'),pixelUcode=block(u32(100),u32(104)*4,'PS ucode');
  if(header.indexSource>1||header.indexFormat>1||header.indexEndian>3)fail('index enum');
  if(!header.indexSource&&(header.indexBytes||u32(80)||header.indexHash!==0n))fail('auto indices payload');
  if(header.indexSource&&!header.indexBytes)fail('DMA indices missing');
  physical(header.indexPhys,header.indexBytes,'indices');const indices=block(u32(80),header.indexBytes,'indices');
  const o=vfOff,vertex={slot:u32(o),raw:[u32(o+4),u32(o+8)],endian:u32(o+12),phys:u32(o+16),byteLength:u32(o+20),hash:u64(o+32)};
  if(vertex.slot!==95||vertex.endian>3||u32(o+28)||u64(o+40)!==0n)fail('vfetch fields');
  if((vertex.raw[0]&3)!==3||vertex.phys!==(vertex.raw[0]>>>2)*4||vertex.byteLength!==((vertex.raw[1]>>>2)&0xffffff)*4||vertex.endian!==(vertex.raw[1]&3))fail('vfetch decode mismatch');
  if(!vertex.byteLength)fail('empty vertices');physical(vertex.phys,vertex.byteLength,'vertices');vertex.data=block(u32(o+24),vertex.byteLength,'vertices');
  const textures=[];
  for(let i=0;i<4;i++){
    const o=tfOff+i*112,t={slot:u32(o),raw:Array.from({length:6},(_,j)=>u32(o+4+j*4)),format:u32(o+28),endian:u32(o+32),dimension:u32(o+36),width:u32(o+40),height:u32(o+44),depth:u32(o+48),pitchBlocks:u32(o+52),tiled:u32(o+56),mipMin:u32(o+60),mipMax:u32(o+64),packedMips:u32(o+68),basePhys:u32(o+72),baseBytes:u32(o+76),mipPhys:u32(o+84),mipBytes:u32(o+88),baseHash:u64(o+96),mipHash:u64(o+104)};
    if(t.slot!==[0,2,1,3][i]||(t.raw[0]&3)!==2||t.endian>3||t.tiled>1||t.packedMips>1||!t.baseBytes)fail('texture fields');
    // TextureInfo stores size minus one, including zero depth for a 2D plane.
    if(t.dimension===1&&(t.width!==(t.raw[2]&8191)||t.height!==((t.raw[2]>>>13)&8191)||t.depth!==((t.raw[1]&(1<<10))?(t.raw[2]>>>26):0)))fail('texture size decode mismatch');
    physical(t.basePhys,t.baseBytes,'texture base');physical(t.mipPhys,t.mipBytes,'texture mips');
    t.base=block(u32(o+80),t.baseBytes,'texture '+t.slot+' base');t.mips=block(u32(o+92),t.mipBytes,'texture '+t.slot+' mips');textures.push(t);
  }
  // Hashes are preserved BigInt metadata, not verified by this decoder.
  return {header,bytes,registers,vertexUcode,pixelUcode,indices,vertex,textures,unsupported:false};
}
