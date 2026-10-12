// physicalBase must be provided by the runtime's guest physical-memory mapping.
// Never assume a guest physical address is an Emscripten heap offset.
export function physicalReader(memory,physicalBase,physicalBytes=0x20000000){
 if(typeof memory!=='function'||!Number.isSafeInteger(physicalBase)||physicalBase<0||!Number.isSafeInteger(physicalBytes)||physicalBytes<0||physicalBytes>0x20000000)throw Error('Invalid physical mapping');
 return (phys,bytes)=>{
  const buffer=memory();
  if(!Number.isSafeInteger(phys)||!Number.isSafeInteger(bytes)||phys<0||bytes<=0||phys+bytes>physicalBytes||physicalBase+phys+bytes>buffer.byteLength)throw Error('Physical resource outside mapped memory');
  return new Uint8Array(buffer,physicalBase+phys,bytes);
 };
}
