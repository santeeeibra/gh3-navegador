 const originalSceneConsumer=globalThis.__r5liveConsumer;
 let capturedScene=0,lastSceneCapture=0;
 globalThis.__r5liveConsumer=(bytes,info,api)=>{
  if(hash&&capturedScene<5&&performance.now()-lastSceneCapture>30000){
   const all=[];for(const d of readLiveDraws(bytes,{hash}))all.push({...d,registers:d.registers.slice()});
   // Material characteristic of z_party, not a menu/video timing guess.
   if(all.some(d=>d.vs===0x16924104A4A1D18An)){
    const ranges=new Map(),draws=[],reader=createResourceReader(api.readPhysical);reader.begin();
    for(const d of all){
     let error=null;try{prepareLiveSongDraw(d,reader,shaders);}catch(e){error=e.message;}
     draws.push({index:d.index,vs:d.vs.toString(16),ps:d.ps.toString(16),error,vertices:d.vertices.map(v=>({slot:v.slot,status:v.status,raw:[...v.raw]})),textures:d.textures.map(t=>({...t,raw:[...t.raw]}))});
     for(const [p,n] of [...d.vertices.map(v=>[(v.raw[0]&~3)>>>0,(v.raw[1]>>>2&0xffffff)*4]),...d.textures.map(t=>[t.basePhys,t.baseBytes]),...(d.indexSource===1?[[d.indexPhys,d.indexBytes]]:[])]){
      const key=p+':'+n;if(!n||n>16*1024*1024||ranges.has(key))continue;ranges.set(key,{phys:p,length:n,data:api.readPhysical(p,n).slice().buffer});
     }
    }
    const frame=bytes.slice().buffer,resources=[...ranges.values()];lastSceneCapture=performance.now();
    self.postMessage({cmd:'callHandler',handler:'r5SongReport',args:[{sceneCapture:{id:capturedScene++,info,draws,frame,resources}}]},[frame,...resources.map(r=>r.data)]);
   }
  }
  return originalSceneConsumer(bytes,info,api);
 };
