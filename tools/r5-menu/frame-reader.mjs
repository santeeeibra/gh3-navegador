// R5F decoder for replay. Owns the input; never retains guest/producer memory.
// Dependency labels are captured evidence, not a proof recomputed from GPU execution.
export const R5F = { magic: 0x31463552, version: 1, registers: 0x5003, maxBytes: 96 * 1024 * 1024 };
const names = ['', 'begin', 'delta', 'shader', 'blob', 'draw', 'copy', 'swap', 'end', 'footer'];
const hex = n => n.toString(16).toUpperCase().padStart(16, '0');
export function readFrameCapture(input, { hash } = {}) {
  const fail = m => { throw Error('R5F: ' + m); };
  const check = (ok, m) => { if (!ok) fail(m); };
  check(input instanceof Uint8Array, 'Uint8Array required');
  check(input.length >= 112 && input.length <= R5F.maxBytes, 'file bounds');
  check(typeof hash === 'function', 'XXH3 verifier required');
  const bytes = new Uint8Array(input); // Buffer.slice would alias caller memory.
  const v = new DataView(bytes.buffer), u = o => v.getUint32(o, true), q = o => v.getBigUint64(o, true);
  const zero = (a, b) => { for (let i = a; i < b; i++) check(!bytes[i], `nonzero reserved/padding at ${i}`); };
  const words = (a, n) => Uint32Array.from({length: n}, (_, i) => u(a + i * 4));
  const header = {host:u(8), triggerKind:u(12), triggerValue:u(16), framesRequested:u(20), maxBytes:u(28), startSwap:u(32), startTimeUs:q(40)};
  check(u(0) === R5F.magic && v.getUint16(4,true) === 1 && v.getUint16(6,true) === 64, 'magic/version/header');
  check(u(24) === R5F.registers && [1,2].includes(header.host) && [1,2].includes(header.triggerKind), 'header enums');
  check(header.framesRequested >= 1 && header.framesRequested <= 4 && header.maxBytes >= bytes.length, 'header limits');
  zero(36,40); zero(48,64);
  const frames=[], shaders=new Map(), blobs=new Map(); let frame=null, nextSeq=1n, delta=null, records=0, footer=null, drawIndex=0, copyIndex=0;
  let bank = null;
  const blobRef = (id, what, phys, length) => {
    check(!id || blobs.has(id), `${what}: missing blob ${id}`);
    const blob=blobs.get(id);
    if(blob && phys!==undefined)check(blob.phys===phys && blob.data.length===length, `${what}: blob address/size mismatch`);
    return blob;
  };
  for (let off=64; off<bytes.length;) {
    check(off+16<=bytes.length,'record header truncated');
    const type=u(off), size=u(off+4), seq=q(off+8), b=off+16, end=off+size;
    check(type>=1 && type<=9 && size>=16 && size%16===0 && size<=16*1024*1024 && end<=bytes.length,'record bounds/type');
    const need = n => { check(Math.ceil((16+n)/16)*16===size, `wrong ${names[type]} size`); zero(b+n,end); };
    const event = type>=5 && type<=7;
    if (event) {
      check(frame && !frame.swap,'event outside open frame');
      check(seq===nextSeq && (delta===null || delta===seq),'event sequence');
      nextSeq++; delta=null;
    } else if (type!==2) check(seq===0n,'metadata event sequence');
    check(delta===null || type===2 || type===3 || type===4 || event,'unconsumed delta');
    if(type!==9)records++;
    let item = {type:names[type], seq, offset:off};
    switch(type) {
      case 1: {
        check(size>=48,'short begin');
        const number=u(b), regs=u(b+16), count=u(b+20), overflow=u(b+24);
        check(!frame && number===frames.length && number<header.framesRequested,'frame order');
        check(u(b+4)===header.startSwap+number && regs===(number===0?1:0),'frame register/swap order');
        check(count<=256 && overflow<=1 && (!number || (!count&&!overflow)),'history limits');
        need(32+regs*R5F.registers*4+count*32); zero(b+28,b+32);
        if(regs)bank=words(b+32,R5F.registers);
        const history=[]; let p=b+32+regs*R5F.registers*4;
        for(let i=0;i<count;i++,p+=32){zero(p+28,p+32);history.push(words(p,7));}
        frame={number,openSwap:u(b+4),timeUs:q(b+8),history,historyOverflow:overflow,initialRegisters:bank.slice(),records:[],events:[],blobsNew:0,bytesStart:off};
        break;
      }
      case 2: {
        check(frame && !frame.swap && delta===null && seq===nextSeq && size>=32,'delta order');
        const n=u(b); need(8+n*8); zero(b+4,b+8); delta=seq;
        item.changes=[];
        for(let i=0;i<n;i++){const index=u(b+8+i*8),value=u(b+12+i*8);check(index<R5F.registers,'delta register bounds');bank[index]=value;item.changes.push([index,value]);}
        frame.records.push(item); break;
      }
      case 3: {
        check(frame && size>=48,'shader outside frame/short');
        const stage=u(b), n=u(b+4), h=q(b+8), nv=u(b+24), nt=u(b+28);
        need(32+(nv+nt)*8+n*4); check(stage<=1 && n>0 && nv<=96 && nt<=32,'shader counts');
        const key=`${stage}:${hex(h)}`;check(!shaders.has(key),'duplicate shader');
        item={...item,stage,hash:h,key,flags:u(b+16),writesColorTargets:u(b+20),vertexBindings:[],textureBindings:[]};
        let p=b+32;
        for(let i=0;i<nv;i++,p+=8)item.vertexBindings.push({slot:u(p),strideWords:u(p+4)});
        for(let i=0;i<nt;i++,p+=8)item.textureBindings.push({slot:u(p),dimension:u(p+4)});
        item.ucode=bytes.subarray(p,p+n*4);
        // SHADER hash is of guest BE words, while its payload is host LE.
        const be=new Uint8Array(n*4);for(let i=0;i<n*4;i+=4)for(let j=0;j<4;j++)be[i+j]=item.ucode[i+3-j];
        check(hash(be)===h,'shader hash mismatch');shaders.set(key,item);break;
      }
      case 4: {
        check(frame && size>=48,'blob outside frame/short');
        const id=u(b),kind=u(b+4),phys=u(b+8),n=u(b+12),h=q(b+16),flags=u(b+24);
        need(32+n);zero(b+28,b+32);
        check(id===blobs.size+1 && kind>=1 && kind<=5 && flags<=1 && phys+n<=0x20000000,'blob metadata');
        item={...item,id,kind,phys,hash:h,srcChanged:!!flags,data:bytes.subarray(b+32,b+32+n)};
        check(hash(item.data)===h,'blob hash mismatch');blobs.set(id,item);frame.blobsNew++;break;
      }
      case 5: {
        check(size>=112,'short draw');
        const nv=u(b+52),nt=u(b+72);need(96+nv*24+nt*128);zero(b+88,b+96);
        check(nv<=96 && nt<=32,'fetch counts');
        const status=u(b+4),unsupported=u(b+8),vs=q(b+56),ps=q(b+64);
        check(u(b)===drawIndex++ && status<=4,'draw index/status');
        if(vs)check(shaders.has(`0:${hex(vs)}`),'missing VS');if(ps)check(shaders.has(`1:${hex(ps)}`),'missing PS');
        item={...item,index:u(b),status,unsupported,primitive:u(b+12),indexCount:u(b+16),initiator:u(b+20),majorExplicit:u(b+24),indexSource:u(b+28),indexFormat:u(b+32),indexEndian:u(b+36),indexPhys:u(b+40),indexBytes:u(b+44),indexBlob:u(b+48),vs,ps,edramPrior:u(b+76),edramTargets:u(b+80),replayFlags:u(b+84),vertices:[],textures:[]};
        let changed=!!blobRef(item.indexBlob,'indices',item.indexPhys,item.indexBytes)?.srcChanged, ambiguous=false;
        for(let i=0;i<nv;i++){
          const p=b+96+i*24;zero(p+20,p+24);
          const e={slot:u(p),raw:words(p+4,2),blob:u(p+12),status:u(p+16)};
          check(e.slot<96&&e.status<=3,'vfetch enum');changed=!!blobRef(e.blob,'vertices')?.srcChanged||changed;item.vertices.push(e);
        }
        for(let i=0;i<nt;i++){
          const p=b+96+nv*24+i*128;zero(p+124,p+128);
          const e={slot:u(p),raw:words(p+4,6),status:u(p+28),format:u(p+32),endian:u(p+36),dimension:u(p+40),width:u(p+44),height:u(p+48),depth:u(p+52),pitch:u(p+56),tiled:u(p+60),mipMin:u(p+64),mipMax:u(p+68),packedMips:u(p+72),basePhys:u(p+76),baseBytes:u(p+80),baseBlob:u(p+84),mipPhys:u(p+88),mipBytes:u(p+92),mipBlob:u(p+96),dependency:u(p+100),baseDependency:u(p+104),mipDependency:u(p+108),lastCopySeq:q(p+112),copies:u(p+120)};
          const rank=[0,1,2,4,3];check(e.slot<32&&e.status<=3&&e.dependency<=4&&e.baseDependency<=4&&e.mipDependency<=4,'tfetch enum');
          check(rank[e.dependency]===Math.max(rank[e.baseDependency],rank[e.mipDependency]),'dependency rank');
          changed=!!blobRef(e.baseBlob,'texture',e.basePhys,e.baseBytes)?.srcChanged||!!blobRef(e.mipBlob,'mips',e.mipPhys,e.mipBytes)?.srcChanged||changed;
          ambiguous ||= e.dependency>1;item.textures.push(e);
        }
        item.issued=status===0||status===4;
        if(item.issued){check((status===4)===(unsupported!==0),'unsupported status');check(item.replayFlags===((ambiguous?1:0)|(changed?2:0)|(unsupported?4:0)|(item.edramPrior?8:0)),'draw replay flags');}
        else check(!nv&&!nt,'nonissued draw fetches');
        item.srcChanged=changed;frame.records.push(item);frame.events.push(item);break;
      }
      case 6: {
        need(96);zero(b+76,b+80);zero(b+88,b+96);
        check(u(b)===copyIndex++&&u(b+4)<=2,'copy index/status');
        item={...item,index:u(b),status:u(b+4),resolve:words(b+8,15),rectBlob:u(b+68),flags:u(b+72),destHash:q(b+80)};
        blobRef(item.rectBlob,'resolve rectangle');frame.records.push(item);frame.events.push(item);break;
      }
      case 7: {
        need(32);zero(b+28,b+32);
        item={...item,index:u(b),phys:u(b+4),width:u(b+8),height:u(b+12),timeUs:q(b+16),dependency:u(b+24)};
        check(item.index===frame.openSwap+1&&item.dependency<=4,'swap metadata');
        frame.swap=item;frame.records.push(item);frame.events.push(item);break;
      }
      case 8: {
        need(80);zero(b+76,b+80);check(frame?.swap&&delta===null,'end without swap');
        const d=frame.events.filter(e=>e.type==='draw'),issued=d.filter(e=>e.issued),c=frame.events.filter(e=>e.type==='copy');
        const deps=[0,0,0,0,0];for(const e of issued)for(const t of e.textures)deps[t.dependency]++;
        const values=words(b,19),actual=[frame.number,d.length,issued.length,d.length-issued.length,c.length,frame.blobsNew,null,issued.filter(e=>e.edramPrior).length,c.filter(e=>(e.flags&9)===9).length,deps[2],deps[3],deps[4],deps[1],issued.filter(e=>e.srcChanged).length,issued.filter(e=>e.unsupported).length];
        actual.forEach((n,i)=>{if(n!==null)check(values[i]===n,`frame counter ${i}`);});
        const exact=!actual[7]&&!actual[8]&&!actual[9]&&!actual[10]&&!actual[11]&&!actual[13]&&!actual[14]&&!c.some(e=>e.status===1)&&frame.swap.dependency<=1;
        check(values[15]===(exact?1:0)&&values[18]===frame.events.length&&values[18]<=4096,'frame exact/events');
        frame.declaredExact=exact;frame.endCounters=values;delete frame.bytesStart;frames.push(frame);frame=null;break;
      }
      case 9: {
        need(32);check(!frame&&delta===null&&end===bytes.length,'footer order/trailing bytes');
        footer={status:u(b),reason:u(b+4),frames:u(b+8),records:u(b+12),totalBytes:q(b+16),hash:q(b+24)};
        check(!footer.status&&footer.records===records&&footer.frames===frames.length&&footer.totalBytes===BigInt(bytes.length),'incomplete/footer counts');
        check(hash(bytes.subarray(0,off))===footer.hash,'file hash mismatch');break;
      }
    }
    off=end;
  }
  check(footer&&frames.length===header.framesRequested,'missing footer/frames');
  return {header,footer,bytes,frames,shaders,blobs,dependencyValidation:'captured labels; GPU provenance not independently certified'};
}

// Independent register bank per iteration. Each yielded event owns its register
// snapshot, so later deltas and concurrent replays cannot mutate earlier state.
export function* replayEvents(capture, frameNumber) {
  const frame=capture.frames[frameNumber];if(!frame)throw Error('R5F: missing frame');
  const bank=frame.initialRegisters.slice();
  for(const e of frame.records){
    if(e.type==='delta'){for(const [index,value] of e.changes)bank[index]=value;}
    else yield {...e,registers:bank.slice()};
  }
}
