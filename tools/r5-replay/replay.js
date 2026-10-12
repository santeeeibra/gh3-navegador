import {createIntroRenderer} from '/intro-renderer.mjs';
export async function replay() {
  const m=await (await fetch('/data/manifest.json')).json();
  const get=async name=>new Uint8Array(await (await fetch('/data/'+name)).arrayBuffer());
  const [vsCode,fsCode]=await Promise.all(['vert','frag'].map(async s=>(await fetch('/data/'+s+'.wgsl')).text()));
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
  const device=await adapter.requestDevice();
  const errors=[],losses=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  device.lost.then(e=>{if(e.reason!=='destroyed')losses.push({reason:e.reason,message:e.message});});
  device.pushErrorScope('validation');
  const names=['system-gpu.bin','float-pixel.bin','fetch.bin','memory.bin',...m.textures.map(t=>'texture-'+t.texture+'.bin')];
  const assets=Object.fromEntries(await Promise.all(names.map(async name=>[name,await get(name)])));
  const renderer=await createIntroRenderer(device,{manifest:m,assets,vertexWGSL:vsCode,fragmentWGSL:fsCode});
  const {messages,blend,primitive}=renderer;
  try {
  const reference=await get('native-rgba.bin');
  function compare(rgba){
    const hist=new Uint32Array(256);let sum=0,max=0,exactPixels=0,alphaMax=0;
    for(let i=0;i<rgba.length;i+=4){let equal=true;for(let c=0;c<3;c++){const e=Math.abs(rgba[i+c]-reference[i+c]);hist[e]++;sum+=e;max=Math.max(max,e);equal&&=e===0;}exactPixels+=equal?1:0;alphaMax=Math.max(alphaMax,Math.abs(rgba[i+3]-reference[i+3]));}
    const total=m.width*m.height*3;let accumulated=0;const percentile=p=>{accumulated=0;for(let i=0;i<256;i++){accumulated+=hist[i];if(accumulated>=total*p)return i;}return 255;};
    return {rgbMaxError:max,rgbMeanAbsoluteError:sum/total,rgbExactFraction:hist[0]/total,rgbWithin1Fraction:(hist[0]+hist[1])/total,rgbP999Error:percentile(.999),exactPixels,alphaMaxError:alphaMax,rgbErrorHistogram:Array.from(hist)};
  }
  const pixels=await renderer.draw(),comparison=compare(pixels);
  await fetch('/gpu-rgba',{method:'POST',body:pixels});
  const canvas=document.querySelector('canvas');canvas.width=m.width;canvas.height=m.height;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels),m.width,m.height),0,0);
  // Negative control changes a real compact pixel constant without changing shaders.
  const original=await get('float-pixel.bin'),changed=original.slice();
  const dv=new DataView(changed.buffer);dv.setFloat32(12,dv.getFloat32(12,true)+.125,true);
  renderer.writePixelConstants(changed);const negative=compare(await renderer.draw());renderer.writePixelConstants(original);
  await device.queue.onSubmittedWorkDone();const validationError=(await device.popErrorScope())?.message??null;
  const result={adapter:{vendor:adapter.info.vendor,architecture:adapter.info.architecture},messages,blend,primitive,comparison,
    negativeControl:{mutation:'PS c0.w +0.125',comparison:negative,detected:negative.rgbMeanAbsoluteError>comparison.rgbMeanAbsoluteError+2},
    validationError,uncapturedErrors:errors,deviceLosses:losses,compactMemoryBytes:80,
    renderSucceeded:!validationError&&!errors.length&&!losses.length&&!messages.some(x=>x.type==='error'),
    fidelityWithinOneUnit:comparison.rgbMaxError<=1&&comparison.alphaMaxError<=1};
  return result;
  } finally {renderer.dispose();device.destroy();}
}
