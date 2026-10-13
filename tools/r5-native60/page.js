// Receive GPU bitmaps directly. Runtime and controls keep their existing route.
(() => {
 const fresh=()=>({frames:0,elapsedMs:0,maxGapMs:0,gaps:{le17:0,le20:0,le25:0,le34:0,le50:0,le100:0,gt100:0}});
 let cadence=fresh(),started=0,previous=0;
 window.native60ResetCadence=()=>{cadence=fresh();started=previous=0;if(window.d4)d4.native60Cadence=cadence;};
 const W=window.Worker;
 function Worker(...args){
  const w=new W(...args);
  w.addEventListener('message',({data:m})=>{
   if(m.type!=='r5NativePort')return;
   const port=m.port;let lastText=0;port.onmessage=({data:m})=>{
    if(m.type!=='frame')return;
    const latch=new Int32Array(m.latch);
    try{
     const cv=document.getElementById('r5Canvas');
     if(!cv){m.bitmap.close();return;}
     cv.getContext('bitmaprenderer').transferFromImageBitmap(m.bitmap);
     const box=document.getElementById('r5Box');if(box?.hidden)box.hidden=false;
     Atomics.add(latch,1,1);
     const now=performance.now();started||=now;
     if(previous){const gap=now-previous;cadence.maxGapMs=Math.max(cadence.maxGapMs,gap);const bucket=gap<=17?'le17':gap<=20?'le20':gap<=25?'le25':gap<=34?'le34':gap<=50?'le50':gap<=100?'le100':'gt100';cadence.gaps[bucket]++;}
     previous=now;cadence.frames++;cadence.elapsedMs=now-started;
     if(window.d4){d4.songPresented=(d4.songPresented||0)+1;d4.songLast=m.info;}
     if(window.d4)d4.native60Cadence=cadence;
     if(performance.now()-lastText>1000){lastText=performance.now();const stat=document.getElementById('r5Stat');if(stat)stat.textContent='Imagen original parcial · '+Atomics.load(latch,1)+' cuadros · secuencia '+m.info.seq;}
    }catch(error){m.bitmap?.close();if(window.d4){d4.native60Error=String(error);if(d4.songRenderer)d4.songRenderer.fatal=String(error);}}
    finally{Atomics.store(latch,0,0);}
   };port.start();
  });return w;
 }
 Worker.prototype=W.prototype;Object.setPrototypeOf(Worker,W);window.Worker=Worker;
})();
