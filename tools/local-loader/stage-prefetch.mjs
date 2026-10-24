// One async preparation at a time; native chart reads remain the final gate.
export function createStagePrefetcher({prepareSong,knownSong,delayMs=1500,onProgress=()=>{},onError=()=>{}}){
  let timer=null,candidate=null,job=null,sequence=0,disposed=false;
  const stopTimer=()=>{clearTimeout(timer);timer=null;};
  function start(song,priority){
    if(disposed||!knownSong(song))return;
    if(job?.song===song){job.priority=priority;return;}
    job?.controller.abort();const controller=new AbortController(),id=++sequence;
    const current=job={song,priority,controller,id};
    Promise.resolve().then(()=>prepareSong(song,{signal:controller.signal,onProgress:p=>{
      if(job===current&&!controller.signal.aborted)onProgress({...p,song,priority:current.priority,complete:false});
    }})).then(p=>{if(job===current&&!controller.signal.aborted)onProgress({...p,song,priority:current.priority,complete:true});})
      .catch(e=>{if(job===current&&e.name!=='AbortError')onError(e,song);})
      .finally(()=>{if(job===current)job=null;});
  }
  function event(detail){
    if(disposed)return;
    const {stage,song}=detail||{};
    if(stage==='preview'){
      if(candidate===song)return;
      candidate=song;stopTimer();
      if(job?.song!==song){job?.controller.abort();job=null;}
      if(knownSong(song))timer=setTimeout(()=>{timer=null;start(song,'background');},delayMs);
    }else if(stage==='loadStart'||stage==='levelConfirmed'){
      stopTimer();if(knownSong(song)){candidate=song;start(song,'level');}
    }
  }
  return {event,destroy(){disposed=true;stopTimer();job?.controller.abort();job=null;},get active(){return job?{song:job.song,priority:job.priority}:null;}};
}
