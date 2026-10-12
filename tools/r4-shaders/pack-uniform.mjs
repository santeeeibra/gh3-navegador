// Source is a stable snapshot of host SystemConstants, not a guest address.
export function packUniform(source, layout) {
  if (!(source instanceof Uint8Array) || !Number.isSafeInteger(layout.sourceBytes) ||
      !Number.isSafeInteger(layout.gpuBytes) || layout.sourceBytes<0 ||
      layout.gpuBytes<=0 || layout.gpuBytes>65536 || source.byteLength<layout.sourceBytes)
    throw Error('Invalid uniform source or layout');
  const output=new Uint8Array(layout.gpuBytes), ranges=[];
  for(const {sourceOffset,gpuOffset,size} of layout.members) {
    if(![sourceOffset,gpuOffset,size].every(Number.isSafeInteger) ||
       sourceOffset<0 || gpuOffset<0 || size<=0 ||
       sourceOffset+size>layout.sourceBytes || gpuOffset+size>output.length)
      throw Error('Uniform field out of bounds');
    if(ranges.some(([start,end])=>gpuOffset<end&&gpuOffset+size>start))
      throw Error('Overlapping GPU uniform fields');
    ranges.push([gpuOffset,gpuOffset+size]);
    output.set(source.subarray(sourceOffset,sourceOffset+size),gpuOffset);
  }
  return output;
}
