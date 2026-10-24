// Receive GPU bitmaps directly. Runtime and controls keep their existing route.
// paso2 (Claude, 2026-10-15): copia de tools/r5-native60/page.js (Codex) + COLA CON DEMORA. Cada imagen del juego trae su
// tiempo de canción (info.a60T, del lector autopista60-tap). Mientras la capa de la autopista está activa (window.hw60 con
// reloj del audio), la imagen se muestra cuando el audio que suena llega a ese tiempo: escenario, personajes y HUD
// coinciden con el sonido y con la autopista. Sin capa (menús, videos, ?a60=0, celular) o sin tiempo: se muestra al llegar.
// Tope: ninguna imagen espera más de CAP ms (pausa: el audio se detiene y el menú de pausa igual aparece).
(() => {
 const fresh=()=>({frames:0,elapsedMs:0,maxGapMs:0,gaps:{le17:0,le20:0,le25:0,le34:0,le50:0,le100:0,gt100:0}});
 const pfresh=()=>({received:0,immediate:0,delayed:0,capped:0,dropped:0,maxQueue:0,waitSum:0,waitN:0,waitMax:0,
  // lag = tiempo del audio que suena (estimado al presentar) − tiempo de canción de la imagen, ms (ideal: 0..8)
  lagHist:{ltm17:0,ltm8:0,le0:0,le8:0,le17:0,le34:0,gt34:0},lagSum:0,lagN:0,lagAbsMax:0,est:0});
 let cadence=fresh(),started=0,previous=0,p2=pfresh();
 const CAP=400,MAXQ=24;
 window.native60ResetCadence=()=>{cadence=fresh();started=previous=0;p2=pfresh();if(window.d4){d4.native60Cadence=cadence;d4.paso2=p2;}};
 // Reloj del audio que suena según la capa (autopista60.js publica visualTimeMs y el instante visualAt en que lo calculó).
 let lastShown=-1,activeAt=-1e9;
 function audioNow(now){
  const h=window.hw60;if(!h||!h.enabled||!h.audioOk||!Number.isFinite(h.visualTimeMs)||!Number.isFinite(h.visualAt))return null;
  if(h.shown!==lastShown){lastShown=h.shown;activeAt=now;}
  if(now-activeAt>250)return null; // la capa dejó de dibujar: sin demora
  return h.visualTimeMs+Math.max(0,Math.min(50,now-h.visualAt));
 }
 let canvas=null,lastText=0,latchRef=null;
 function present(m,now){
  const cv=canvas&&canvas.isConnected?canvas:(canvas=document.getElementById('r5Canvas'));
  if(!cv){m.bitmap.close();return;}
  cv.getContext('bitmaprenderer').transferFromImageBitmap(m.bitmap);
  const box=document.getElementById('r5Box');if(box?.hidden)box.hidden=false;
  Atomics.add(m.latchI32,1,1);
  started||=now;
  if(previous){const gap=now-previous;cadence.maxGapMs=Math.max(cadence.maxGapMs,gap);const bucket=gap<=17?'le17':gap<=20?'le20':gap<=25?'le25':gap<=34?'le34':gap<=50?'le50':gap<=100?'le100':'gt100';cadence.gaps[bucket]++;}
  previous=now;cadence.frames++;cadence.elapsedMs=now-started;
  if(window.d4){d4.songPresented=(d4.songPresented||0)+1;d4.songLast=m.info;d4.native60Cadence=cadence;d4.paso2=p2;}
  if(now-lastText>1000){lastText=now;const stat=document.getElementById('r5Stat');if(stat)stat.textContent='Imagen original parcial · '+Atomics.load(m.latchI32,1)+' cuadros · secuencia '+m.info.seq;}
 }
 const queue=[];let looping=false;
 function flush(now,keepNewest){
  // Sin capa: no se espera. Se muestra la más nueva de la cola y las demás se descartan.
  if(!queue.length)return;
  const last=queue.length-1;
  for(let i=0;i<last;i++){queue[i].bitmap.close();p2.dropped++;}
  const m=queue[last];queue.length=0;
  if(keepNewest){p2.immediate++;present(m,now);}else{m.bitmap.close();p2.dropped++;}
 }
 function loop(){
  const now=performance.now(),A=audioNow(now);
  try{
   if(A===null)flush(now,true);
   else{
    let pick=-1,capped=false;
    for(let i=0;i<queue.length;i++){const q=queue[i];if(q.T<=A+8){pick=i;capped=false;}else if(now-q.arrive>=CAP){pick=i;capped=true;}}
    if(pick>=0){
     for(let i=0;i<pick;i++){queue[i].bitmap.close();p2.dropped++;}
     const m=queue[pick];queue.splice(0,pick+1);
     if(capped)p2.capped++;else p2.delayed++;
     const lag=A-m.T,a=Math.abs(lag);
     p2.lagHist[lag<-17?'ltm17':lag<-8?'ltm8':lag<=0?'le0':lag<=8?'le8':lag<=17?'le17':lag<=34?'le34':'gt34']++;
     if(a<1000){p2.lagSum+=lag;p2.lagN++;p2.lagAbsMax=Math.max(p2.lagAbsMax,a);}
     if(m.info.a60Est)p2.est++;
     const w=now-m.arrive;p2.waitSum+=w;p2.waitN++;p2.waitMax=Math.max(p2.waitMax,w);
     present(m,now);
    }
   }
  }catch(error){if(window.d4){d4.native60Error=String(error);if(d4.songRenderer)d4.songRenderer.fatal=String(error);}}
  if(queue.length)requestAnimationFrame(loop);else looping=false;
 }
 const W=window.Worker;
 function Worker(...args){
  const w=new W(...args);
  w.addEventListener('message',({data:m})=>{
   if(m.type!=='r5NativePort')return;
   // Claude 2026-10-13: el mismo SAB lleva la telemetría y la política del gobernador (control.mjs, gh3-governor.js).
   window.gh3Governor?.attachControl?.(m.latch);
   const port=m.port;port.onmessage=({data:m})=>{
    if(m.type!=='frame')return;
    const latch=new Int32Array(m.latch);
    try{
     p2.received++;
     const now=performance.now(),T=m.info?.a60T,A=Number.isFinite(T)?audioNow(now):null;
     const item={bitmap:m.bitmap,info:m.info,latchI32:latch,T,arrive:now};
     if(A===null){flush(now,true);p2.immediate++;present(item,now);}
     else{
      queue.push(item);p2.maxQueue=Math.max(p2.maxQueue,queue.length);
      while(queue.length>MAXQ){queue.shift().bitmap.close();p2.dropped++;}
      if(!looping){looping=true;requestAnimationFrame(loop);}
     }
    }catch(error){m.bitmap?.close();if(window.d4){d4.native60Error=String(error);if(d4.songRenderer)d4.songRenderer.fatal=String(error);}}
    // El dibujante puede preparar la siguiente apenas llega ésta: la demora la hace la cola de la página.
    finally{Atomics.store(latch,0,0);}
   };port.start();
  });return w;
 }
 Worker.prototype=W.prototype;Object.setPrototypeOf(Worker,W);window.Worker=Worker;
})();
