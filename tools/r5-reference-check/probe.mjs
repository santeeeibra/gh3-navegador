// Own fixture. Tests the queue-order rule inspected in recomp-kit; no upstream code copied.
export async function probe(){
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU');const device=await adapter.requestDevice();const errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));device.pushErrorScope('validation');
 const resources=[];const mk=(size,usage)=>{const b=device.createBuffer({size,usage});resources.push(b);return b;};
 try{
  const code='@group(0) @binding(0) var<storage, read> source: array<u32>; @group(0) @binding(1) var<storage, read_write> destination: array<u32>; @compute @workgroup_size(1) fn main(@builtin(global_invocation_id) id: vec3u) { destination[id.x] = source[id.x]; }';
  const module=device.createShaderModule({code});const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}});
  async function run(submitBeforeReuse){
   const input=mk(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST),a=mk(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),b=mk(16,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),read=mk(32,GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ);
   const bind=output=>device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:input}},{binding:1,resource:{buffer:output}}]});
   const encode=output=>{const e=device.createCommandEncoder(),p=e.beginComputePass();p.setPipeline(pipeline);p.setBindGroup(0,bind(output));p.dispatchWorkgroups(4);p.end();return e;};
   const old=[11,12,13,14],next=[21,22,23,24];device.queue.writeBuffer(input,0,new Uint32Array(old));
   const first=encode(a);
   if(submitBeforeReuse)device.queue.submit([first.finish()]);
   device.queue.writeBuffer(input,0,new Uint32Array(next));const second=encode(b);
   second.copyBufferToBuffer(a,0,read,0,16);second.copyBufferToBuffer(b,0,read,16,16);
   device.queue.submit(submitBeforeReuse?[second.finish()]:[first.finish(),second.finish()]);
   await read.mapAsync(GPUMapMode.READ);const result=Array.from(new Uint32Array(read.getMappedRange()));read.unmap();return {first:result.slice(0,4),second:result.slice(4),expectedFirst:old,expectedSecond:next};
  }
  const unsafe=await run(false),ordered=await run(true);await device.queue.onSubmittedWorkDone();const validationError=(await device.popErrorScope())?.message??null;
  const eq=(a,b)=>a.every((n,i)=>n===b[i]);return {unsafe,ordered,negativeDetected:eq(unsafe.first,unsafe.expectedSecond),correctOrder:eq(ordered.first,ordered.expectedFirst)&&eq(ordered.second,ordered.expectedSecond),validationError,errors,passed:eq(unsafe.first,unsafe.expectedSecond)&&eq(ordered.first,ordered.expectedFirst)&&eq(ordered.second,ordered.expectedSecond)&&!validationError&&!errors.length};
 }finally{for(const r of resources)r.destroy();device.destroy();}
}
