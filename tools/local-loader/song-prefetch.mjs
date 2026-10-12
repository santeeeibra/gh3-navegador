// Audio preview reads remain partial. A song chart read starts preparation of
// that song's complete chart/audio package before the game receives the chart.
export function createSongPrefetcher({packages,ensureChunk,notify=()=>{}}){
  const ready=new Set();let loading=false;
  return file=>{
    const id=/\/songs\/([a-z0-9_]+)_song\.pak\.xen$/i.exec(file.path)?.[1].toLowerCase();
    if(!id||!packages[id]||ready.has(id)||loading)return;
    loading=true;
    const files=packages[id],total=files.reduce((n,f)=>n+f.size,0);let done=0;
    notify({type:'songLoad',song:id,done,total,complete:false});
    try{
      for(const f of files)for(let i=0;i<f.chunks.length;i++){
        ensureChunk(f,i);done+=f.chunks[i].size;
        notify({type:'songLoad',song:id,done,total,complete:false});
      }
      ready.add(id);notify({type:'songLoad',song:id,done,total,complete:true});
    }catch(e){notify({type:'songLoad',song:id,done,total,error:e.message});throw e;}
    finally{loading=false;}
  };
}
