#include <emscripten.h>
#include <emscripten/threading.h>
#include <cstdio>
#include <cstdlib>

// Runs on Emscripten's actual pthread main, not the browser UI thread.
// The GPU owner keeps its event loop live and reports completion to C++; no blocking GPU wait.
EM_JS(void, gpu_probe, (), {
 (async()=>{
 const result={worker:typeof document==='undefined',asyncStrategy:'callback + live pthread event loop',ok:false,errors:[]};
 let device;
 try {
  if(!navigator.gpu)throw Error('WebGPU unavailable in pthread');
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No adapter');
  device=await adapter.requestDevice();result.adapter={vendor:adapter.info?.vendor||"",architecture:adapter.info?.architecture||"",device:adapter.info?.device||"",description:adapter.info?.description||"",isFallbackAdapter:adapter.info?.isFallbackAdapter??adapter.isFallbackAdapter??null};
  device.addEventListener('uncapturederror',e=>result.errors.push(e.error.message));
  const canvas=new OffscreenCanvas(64,64),context=canvas.getContext('webgpu');
  const format=navigator.gpu.getPreferredCanvasFormat();
  context.configure({device,format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
  const shader=device.createShaderModule({code:'@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {var p=array<vec2f,3>(vec2f(-1,-1),vec2f(1,-1),vec2f(0,1));return vec4f(p[i],0,1);}@fragment fn f()->@location(0) vec4f{return vec4f(1,0,0,1);}'});
  const pipeline=device.createRenderPipeline({layout:'auto',vertex:{module:shader,entryPoint:'v'},fragment:{module:shader,entryPoint:'f',targets:[{format}]}});
  const staging=device.createBuffer({size:256,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  device.pushErrorScope('validation');
  const encoder=device.createCommandEncoder(),texture=context.getCurrentTexture();
  const pass=encoder.beginRenderPass({colorAttachments:[{view:texture.createView(),clearValue:{r:0,g:0,b:1,a:1},loadOp:'clear',storeOp:'store'}]});
  pass.setPipeline(pipeline);pass.draw(3);pass.end();
  encoder.copyTextureToBuffer({texture,origin:[32,32]},{buffer:staging,bytesPerRow:256},[1,1]);
  device.queue.submit([encoder.finish()]);
  await device.queue.onSubmittedWorkDone();await staging.mapAsync(GPUMapMode.READ);
  const pixel=Array.from(new Uint8Array(staging.getMappedRange()).slice(0,4));
  if(format.startsWith('bgra')){const red=pixel[2];pixel[2]=pixel[0];pixel[0]=red;}
  result.pixel=pixel;staging.destroy();const validation=await device.popErrorScope();if(validation)throw Error(validation.message);
  // Bounded negative control: blocking this worker prevents its promise callback.
  let callbackRan=false;const completion=Promise.resolve().then(()=>{callbackRan=true;});
  const before=performance.now();const wait=Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,75);
  result.blockingControl={wait,callbackWhileBlocked:callbackRan,elapsedMs:performance.now()-before};
  await completion;result.callbackAfterYield=callbackRan;
  context.unconfigure();
  result.ok=result.worker&&pixel[0]===255&&pixel[1]===0&&pixel[2]===0&&!result.errors.length&&wait==='timed-out'&&!result.blockingControl.callbackWhileBlocked&&callbackRan;
 }catch(e){result.errors.push(String(e));}finally{device?.destroy();}
 const ptr=stringToNewUTF8(JSON.stringify(result));_publish_probe(ptr);_free(ptr);
 })().catch(error=>console.error(error));
});
extern "C" EMSCRIPTEN_KEEPALIVE void publish_probe(const char* json){
 MAIN_THREAD_EM_ASM({Module['onProbeResult'](UTF8ToString($0));},json);
}
int main(){
 if(emscripten_is_main_browser_thread()){publish_probe("{\"ok\":false,\"error\":\"main ran on UI\"}");return 1;}
 gpu_probe();emscripten_exit_with_live_runtime();return 0;
}
