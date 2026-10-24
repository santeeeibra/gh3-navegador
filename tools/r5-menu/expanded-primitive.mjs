// Companion indices for the SDK kPoint/RectangleListAsTriangleStrip shaders.
// Opt-in helper; the existing renderer/preparePrimitive remains unchanged.
export function prepareExpandedPrimitive(draw) {
  if (!draw.issued) return {skipped:'not issued',indices:new Uint32Array()};
  if (draw.unsupported) throw Error('Expansion: producer marks draw unsupported');
  if (![1,8].includes(draw.primitive)) throw Error('Expansion: only point/rectangle lists');
  if (draw.indexSource!==0) throw Error('Expansion: DMA requires guest index address/flags; not implemented');
  if (!Number.isSafeInteger(draw.indexCount)||draw.indexCount<0||draw.indexCount>1000000) throw Error('Expansion: invalid guest count');
  const primitives=draw.primitive===8?Math.floor(draw.indexCount/3):draw.indexCount;
  const indices=new Uint32Array(primitives?primitives*5-1:0);
  let position=0;
  for(let i=0;i<primitives;i++){
    if(i)indices[position++]=0xffffffff;
    for(let vertex=0;vertex<4;vertex++)indices[position++]=(i<<2)|vertex;
  }
  return {profile:draw.primitive===8?'rectangle':'point',topology:'triangle-strip',stripIndexFormat:'uint32',indices,
    guestPrimitiveCount:primitives,guestVertexCount:draw.indexCount,
    limitation:'Requires the matching translated expansion VS and system constants; not a rendered result.'};
}
