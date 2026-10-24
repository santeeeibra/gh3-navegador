import {createIntroRenderer} from './intro-renderer.mjs';
self.onmessage=async()=>{
 let device,renderer;
 try {
  const get=async n=>new Uint8Array(await (await fetch('/data/'+n)).arrayBuffer());
  const manifest=await (await fetch('/data/manifest.json')).json();
  const names=['system-gpu.bin','float-pixel.bin','fetch.bin','memory.bin',...manifest.textures.map(t=>'texture-'+t.texture+'.bin')];
  const assets=Object.fromEntries(await Promise.all(names.map(async n=>[n,await get(n)])));
  const [vertexWGSL,fragmentWGSL]=await Promise.all(['vert','frag'].map(async n=>(await fetch('/data/'+n+'.wgsl')).text()));
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No worker WebGPU adapter');
  device=await adapter.requestDevice();const gpuErrors=[];device.addEventListener('uncapturederror',e=>gpuErrors.push(e.error.message));device.pushErrorScope('validation');
  const constants=assets['float-pixel.bin'].slice();
  const badAssets={...assets,'texture-3.bin':assets['texture-3.bin'].slice()};badAssets['texture-3.bin'][0]=0;
  let badAlphaRejected=false;try{await createIntroRenderer(device,{manifest,assets:badAssets,vertexWGSL,fragmentWGSL});}catch(e){badAlphaRejected=e.message.includes('Translucent');}
  const badSize={...assets,'memory.bin':new Uint8Array(79)};
  let badSizeRejected=false;try{await createIntroRenderer(device,{manifest,assets:badSize,vertexWGSL,fragmentWGSL});}catch(e){badSizeRejected=e.message.includes('size');}
  const pending=createIntroRenderer(device,{manifest,assets,vertexWGSL,fragmentWGSL});
  // Overwrite every input before async pipeline creation finishes: owned copies must survive.
  for(const bytes of Object.values(assets))bytes.fill(0);
  manifest.width=1;manifest.textures[0].width=1;
  renderer=await pending;
  const first=renderer.draw();let overlapRejected=false;
  try{await renderer.draw();}catch(e){overlapRejected=e.message.includes('in flight');}
  const pixels=await first,reference=await get('native-rgba.bin');
  let differences=0;for(let i=0;i<pixels.length;i++)differences+=pixels[i]!==reference[i];
  const changed=constants.slice(),dv=new DataView(changed.buffer);dv.setFloat32(12,dv.getFloat32(12,true)+.125,true);
  renderer.writePixelConstants(changed);const negative=await renderer.draw();let changedBytes=0;
  for(let i=0;i<negative.length;i++)changedBytes+=negative[i]!==reference[i];
  renderer.writePixelConstants(constants);const restored=await renderer.draw();let restoredDifferences=0;
  for(let i=0;i<restored.length;i++)restoredDifferences+=restored[i]!==reference[i];
  const fresh=Object.fromEntries(await Promise.all(names.map(async n=>[n,await get(n)])));
  const freshManifest=await (await fetch('/data/manifest.json')).json();
  renderer.update({manifest:freshManifest,assets:fresh});
  const canvas=new OffscreenCanvas(1280,720),context=canvas.getContext('webgpu');
  context.configure({device,format:'rgba8unorm',alphaMode:'opaque'});
  const directRead=new OffscreenCanvas(1280,720).getContext('2d');
  async function directPixels(){await renderer.present(context);const bitmap=canvas.transferToImageBitmap();directRead.drawImage(bitmap,0,0);bitmap.close();return directRead.getImageData(0,0,1280,720).data;}
  const direct=await directPixels();let directDifferences=0;
  for(let i=0;i<direct.length;i++)directDifferences+=direct[i]!==reference[i];
  const updateBad={...fresh,'memory.bin':new Uint8Array(79)};
  let updateBadRejected=false;try{renderer.update({manifest:freshManifest,assets:updateBad});}catch(e){updateBadRejected=e.message.includes('size');}
  const updateChanged={...fresh,'float-pixel.bin':changed};renderer.update({manifest:freshManifest,assets:updateChanged});
  const directChanged=await directPixels();let directChangedBytes=0;
  for(let i=0;i<directChanged.length;i++)directChangedBytes+=directChanged[i]!==reference[i];
  // Every texture and uniform must be replaced on update, not only pixel constants.
  const zeroY={...fresh,'texture-0.bin':new Uint8Array(fresh['texture-0.bin'].length)};
  renderer.update({manifest:freshManifest,assets:zeroY});const textureChanged=await directPixels();let textureChangedBytes=0;
  for(let i=0;i<textureChanged.length;i++)textureChangedBytes+=textureChanged[i]!==reference[i];
  renderer.update({manifest:freshManifest,assets:fresh});const directRestored=await directPixels();let directRestoredDifferences=0;
  for(let i=0;i<directRestored.length;i++)directRestoredDifferences+=directRestored[i]!==reference[i];
  await device.queue.onSubmittedWorkDone();const validationError=(await device.popErrorScope())?.message??null;
  renderer.dispose();renderer.dispose();let disposedRejected=false;try{await renderer.draw();}catch(e){disposedRejected=e.message.includes('disposed');}
  const result={worker:true,bytes:pixels.length,differences,restoredDifferences,directDifferences,directRestoredDifferences,directChangedBytes,textureChangedBytes,updateBadRejected,negativeChangedBytes:changedBytes,badAlphaRejected,badSizeRejected,overlapRejected,disposedRejected,validationError,gpuErrors,messages:renderer.messages};
  result.passed=differences===0&&restoredDifferences===0&&directDifferences===0&&directRestoredDifferences===0&&directChangedBytes>1000&&textureChangedBytes>1000&&updateBadRejected&&changedBytes>1000&&badAlphaRejected&&badSizeRejected&&overlapRejected&&disposedRejected&&!validationError&&!gpuErrors.length&&!renderer.messages.some(m=>m.type==='error');
  self.postMessage(result);
 }catch(e){self.postMessage({passed:false,fatal:e.message,stack:e.stack});}finally{renderer?.dispose();device?.destroy();}
};
