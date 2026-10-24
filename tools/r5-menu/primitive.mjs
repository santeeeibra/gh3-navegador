// Canonical indices for the WebGPU replay. Rectangle lists require post-VS
// expansion and are deliberately refused here, not guessed as triangles.
export function preparePrimitive(draw,blob){
  if(!draw.issued) return {topology:null,indices:new Uint32Array(),skipped:'not issued'};
  if(draw.unsupported)throw Error('Primitive: producer marks draw unsupported');
  const count=draw.indexCount;
  if(!Number.isSafeInteger(count)||count<0||count>1000000)throw Error('Primitive: index count');
  let input;
  if(draw.indexSource===0)input=Uint32Array.from({length:count},(_,i)=>i);
  else if(draw.indexSource===1){
    if(!blob||blob.phys!==draw.indexPhys||blob.data.length!==draw.indexBytes||draw.indexFormat>1||draw.indexEndian>3)throw Error('Primitive: index source/format');
    // Match PrimitiveProcessor's normalization of 32-bit swap modes for 16-bit indices.
    const size=draw.indexFormat?4:2,endian=size===2?(draw.indexEndian===2?1:draw.indexEndian===3?0:draw.indexEndian):draw.indexEndian;
    const xor=[0,1,3,2][endian];input=new Uint32Array(count);
    for(let i=0;i<count;i++){
      let n=0;for(let j=0;j<size;j++){const p=(i*size+j)^xor;if(p>=blob.data.length)throw Error('Primitive: missing endian-aligned index bytes');n+=(blob.data[p]<<(j*8))>>>0;}
      input[i]=n>>>0;
    }
  }else throw Error('Primitive: unsupported index source');
  // Per-event register snapshots are required for indexed restart handling.
  if(draw.indexSource===1&&!draw.registers)throw Error('Primitive: indexed draw needs registers');
  const resetEnabled=draw.indexSource===1&&!!(draw.registers[0x2205]&(1<<21));
  const reset=resetEnabled?(draw.registers[0x2103]&(draw.indexFormat?0xffffff:0xffff))>>>0:null;
  const segments=[];let segment=[];
  for(const index of input){if(resetEnabled&&index===reset){segments.push(segment);segment=[];}else segment.push(index);}
  segments.push(segment);
  if(draw.primitive===1)return {topology:'point-list',indices:Uint32Array.from(segments.flat())};
  const output=[];
  for(const input of segments){
    const count=input.length;
    if(draw.primitive===4){output.push(...input.slice(0,Math.floor(count/3)*3));}
    else if(draw.primitive===5){for(let i=2;i<count;i++)output.push(input[0],input[i-1],input[i]);}
    else if(draw.primitive===6){for(let i=2;i<count;i++){const a=input[i-2],b=input[i-1],c=input[i];if(a===b||b===c||a===c)continue;output.push(...(i&1?[b,a,c]:[a,b,c]));}}
    // Match SDK CPU QuadListToTriangleList; its GS path uses a different diagonal.
    else if(draw.primitive===13){for(let i=0;i+3<count;i+=4)output.push(input[i],input[i+1],input[i+2],input[i],input[i+2],input[i+3]);}
    else throw Error('Primitive: unsupported type '+draw.primitive);
  }
  return {topology:'triangle-list',indices:Uint32Array.from(output)};
}
