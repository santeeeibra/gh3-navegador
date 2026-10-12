// Page-side driver. Mode main: WebGPU in this thread. Mode worker: WebGPU in a
// dedicated worker (like the live CP consumer). Images and capture are POSTed
// back to the local server; nothing leaves 127.0.0.1.
import {renderLayers} from '/render-layers.js';
const post=(name,data)=>fetch('/upload/'+name,{method:'POST',body:data}).then(r=>{if(!r.ok)throw Error('upload '+name);});
async function sendResult(r){
 for(const d of r.draws)if(d.rgba)await post(`draw-${d.draw}.rgba`,d.rgba);
 await post('final.rgba',r.final);
 return {draws:r.draws.map(d=>d.draw),errors:r.errors,adapter:r.adapter};
}
window.__run=async opts=>{
 const layers=await(await fetch('/layers.json')).json();
 if(opts.mode==='worker'){
  const w=new Worker('/worker.js',{type:'module'});
  return await new Promise((resolve,reject)=>{
   let summary=null,capture=!opts.capture;
   const done=()=>{if(summary&&capture){w.terminate();resolve(summary);}};
   w.onerror=e=>reject(Error('worker: '+e.message));
   w.onmessage=async e=>{
    try{
     if(e.data.type==='WebGPUCapture'){await post('capture.wgpur',e.data.data);capture=true;done();}
     else if(e.data.type==='result'){summary=await sendResult(e.data.result);done();}
     else if(e.data.type==='error')reject(Error(e.data.message));
    }catch(err){reject(err);}
   };
   // present: hand the canvas to the worker (OffscreenCanvas), like a live consumer would.
   if(opts.present){const oc=document.querySelector('canvas').transferControlToOffscreen();w.postMessage({layers,opts,canvas:oc},[oc]);}
   else w.postMessage({layers,opts});
  });
 }
 let W=null;
 if(opts.capture){W=(await import('/wgpur.js')).default;W.start({captureFilename:'capture.wgpur'});}
 const r=await renderLayers({layers,perDraw:opts.perDraw,present:opts.present?document.querySelector('canvas'):null,nextFrame:()=>new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)))});
 if(opts.present)await new Promise(res=>requestAnimationFrame(()=>requestAnimationFrame(res)));
 const summary=await sendResult(r);
 if(W)W.finish(); // triggers a download; the Node side saves it
 return summary;
};
