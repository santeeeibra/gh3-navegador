  function sceneTexture(t, bc) {
    const options=globalThis.__r5Options||{};
    let u=t;
    const factor=options.textureScale===0.5?2:1;
    // Preserve movie planes, UI/HUD atlases and small textures. Reduce scene
    // textures only: >=256px, explicitly marked by the draw adapter.
    // A half-size RGBA texture may be larger than the original BC texture.
    // Keep supported BC on the GPU rather than expanding it to reduce it.
    const reduce=!!t.scene&&factor>1&&!t.video&&Math.max(t.width,t.height)>=256&&(!bc||!t.format.startsWith('bc'));
    if(!bc||reduce){
      if((t.layers||1)>1&&t.format.startsWith('bc')){
        const layers=t.layers,n=t.rowsPerImage*t.bytesPerRow,decoded=[];
        for(let i=0;i<layers;i++)decoded.push(decodeBCTexture({...t,layers:1,data:t.data.subarray(i*n,(i+1)*n)}));
        const data=new Uint8Array(decoded[0].data.length*layers);decoded.forEach((d,i)=>data.set(d.data,i*d.data.length));u={...decoded[0],data,layers,cube:t.cube};
      }else u=decodeBCTexture(t);
    }
    if(!reduce)return u;
    if(!['rgba8unorm','rgba8unorm-srgb','r8unorm'].includes(u.format))throw Error('Scene texture reduction format '+u.format);
    const channels=u.format==='r8unorm'?1:4,width=Math.max(1,Math.floor(u.width/2)),height=Math.max(1,Math.floor(u.height/2)),layers=u.layers||1,data=new Uint8Array(width*height*channels*layers);
    for(let layer=0;layer<layers;layer++)for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<channels;c++){
      let sum=0,n=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){const sx=x*2+dx,sy=y*2+dy;if(sx<u.width&&sy<u.height){sum+=u.data[layer*u.rowsPerImage*u.bytesPerRow+sy*u.bytesPerRow+sx*channels+c];n++;}}
      data[((layer*height+y)*width+x)*channels+c]=Math.round(sum/n);
    }
    return {...u,width,height,bytesPerRow:width*channels,rowsPerImage:height,data};
  }
