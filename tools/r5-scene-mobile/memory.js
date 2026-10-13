  // Explicit API allocation accounting, NOT physical driver memory or wasm RAM.
  globalThis.__r5Options ??= {renderScale:1,textureScale:/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)?0.5:1,forceRGBA:false};
  globalThis.__sceneMemory = {textureBytes:0,bufferBytes:0,peakBytes:0,textures:0,buffers:0,features:[]};
  if(typeof GPUDevice!=='undefined'){
   const stats=globalThis.__sceneMemory, sizes={r8unorm:[1,1],rgba8unorm:[1,4],'depth24plus-stencil8':[1,4],depth32float:[1,4],'bc1-rgba-unorm':[4,8],'bc2-rgba-unorm':[4,16],'bc3-rgba-unorm':[4,16],'bc5-rg-unorm':[4,16]};
   for(const kind of ['Texture','Buffer']){
    const name='create'+kind,original=GPUDevice.prototype[name];
    GPUDevice.prototype[name]=function(desc){
     const obj=original.call(this,desc);stats.features=[...this.features];let bytes=desc.size;
     if(kind==='Texture'){
      const a=Array.isArray(desc.size)?desc.size:[desc.size.width,desc.size.height||1,desc.size.depthOrArrayLayers||1],fmt=sizes[desc.format];bytes=0;
      if(fmt)for(let mip=0;mip<(desc.mipLevelCount||1);mip++)bytes+=Math.ceil(Math.max(1,a[0]>>mip)/fmt[0])*Math.ceil(Math.max(1,a[1]>>mip)/fmt[0])*(a[2]||1)*fmt[1]*(desc.sampleCount||1);
     }
     const key=kind==='Texture'?'textureBytes':'bufferBytes',count=kind==='Texture'?'textures':'buffers';stats[key]+=bytes;stats[count]++;stats.peakBytes=Math.max(stats.peakBytes,stats.textureBytes+stats.bufferBytes);
     const destroy=obj.destroy.bind(obj);let alive=true;obj.destroy=()=>{if(alive){stats[key]-=bytes;stats[count]--;alive=false;}return destroy();};return obj;
    };
   }
  }
