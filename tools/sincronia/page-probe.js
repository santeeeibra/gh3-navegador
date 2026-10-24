// Read-only recorder: no clock/input/audio changes. Local copies only.
(() => {
  const ch = new BroadcastChannel('hw60');
  const probe = window.syncProbe = {rows: [], latest: null, dropped: 0};
  const meta = () => { const m=window.g1mem, live=window.g1live;
    if(m?.seg) ch.postMessage({type:'syncMemory',seg:m.seg,livePtr:live?.ptr||0}); };
  const timer = setInterval(meta,500);
  ch.addEventListener('message', e => {
    const m=e.data; if(m?.type!=='frame'||!m.sync) return;
    const b=m.draws?.find(d=>d.vs==='80708BD1B82638B0'); if(!b) return;
    const h=window.hw60, ctx=window.r6ctx;
    let ts=null; try{ts=ctx?.getOutputTimestamp?.();}catch{}
    const gems=[];
    for(const draw of m.draws||[]) {
      if(draw.vs!=='582ABCF5FF619A55'||!draw.verts)continue;
      for(let i=0;i+15<draw.verts.length && gems.length<64;i+=16) {
        const xs=[],ys=[];for(let j=0;j<4;j++){xs.push(draw.verts[i+j*4]);ys.push(draw.verts[i+j*4+1]);}
        gems.push({x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2});
      }
    }
    const row={at:m.at,receivedAt:performance.timeOrigin+performance.now(),seq:m.seq,gems,
      shaderMs:b.vk[7]*1000,ringWrite:m.w,cp:m.sync,
      page:{legacyClock:window.gh3Song?.clock?.(),audioMs:h?.audioTimeMs,visualMs:h?.visualTimeMs,
        shown:h?.shown,outOfRange:h?.outOfRange,offset:h?.offsetMs,clockMode:h?.clockMode,
        audioContextTime:ctx?.currentTime,outputTimestamp:ts,inputLatency:window.gh3Input?.latencyReport?.()}};
    probe.latest=row;
    if(probe.rows.length<6000) probe.rows.push(row); else probe.dropped++;
  });
  addEventListener('pagehide',()=>{clearInterval(timer);ch.close();},{once:true});
})();
