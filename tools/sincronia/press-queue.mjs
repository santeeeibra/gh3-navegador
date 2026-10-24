// Local ABI v1. SPSC: one page/robot writer and the original input-loop reader.
export const QUEUE = {magic:0x53594e31, capacity:64, header:32, stride:64};
export function createPressWriter(sab, ptr, seg) {
  const h=new Int32Array(sab,ptr,8),dv=new DataView(sab),table=new Uint32Array(sab,seg,256);
  const host=a=>(table[a>>>24]+a)>>>0;
  if((Atomics.load(h,0)>>>0)!==QUEUE.magic) throw Error('Unknown input FIFO ABI');
  return function writePress({eventAt,writtenAt,buttons,triggers=0,source=0,flags=0,seq=0}) {
    const w=Atomics.load(h,1)>>>0,r=Atomics.load(h,2)>>>0;
    if(((w-r)>>>0)>=QUEUE.capacity){Atomics.add(h,3,1);return null;}
    const base=dv.getFloat64(host(0x82BD7C38),false),after=dv.getFloat64(host(0x82BD7C38),false);
    const p=ptr+QUEUE.header+(w%QUEUE.capacity)*QUEUE.stride;
    dv.setFloat64(p,eventAt,true);dv.setFloat64(p+8,writtenAt,true);
    dv.setFloat64(p+16,base,true);dv.setFloat64(p+24,after,true);
    for(const [o,v] of [[32,buttons],[36,triggers],[40,source],[44,flags],[48,w+1],[52,seq]])dv.setUint32(p+o,v>>>0,true);
    dv.setUint32(p+56,0,true);dv.setUint32(p+60,0,true);
    Atomics.store(h,1,(w+1)|0);return w+1;
  };
}

// DOM timestamps may be epoch or timeOrigin relative. Never label handler time
// as a physical hardware timestamp. Gamepad sampling uses observation time.
export function eventEpoch(stamp,origin,now) {
  if(!Number.isFinite(stamp)||stamp<=0)return {at:origin+now,flags:2};
  const at=stamp>1e12?stamp:origin+stamp;
  if(at>origin+now+1||at<origin+now-5000)return {at:origin+now,flags:2};
  return {at,flags:1};
}
