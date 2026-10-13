// Claude 2026-10-13: precarga con presupuesto de pipelines (worker GPU).
// La primera vez que aparece un estado de dibujo nuevo hay que compilar su pipeline y, mientras, el worker sigue
// mostrando el snapshot anterior (tirón visible si pasa en plena canción). Esto recuerda los pipelines que se usaron
// (IndexedDB, entre sesiones) y los compila de antemano SÓLO en cargas/menús (CTRL.STAGE = 1), de a pocos
// (maxInFlight) y sólo si el gobernador está en normal (CTRL.LEVEL = 0). Con la canción en juego no compila nada
// por su cuenta ni guarda: sólo anota. No toca audio, entradas ni el juego.
import {C} from './control.mjs';

// Lo que define un pipeline (renderer.mjs pipeline()): nada más se guarda.
export const pipelineDesc=m=>({vs:m.vs,ps:m.ps,blend:m.blend,raster:m.raster,depth:m.depth,stencil:m.stencil,writeMask:m.writeMask});
export const descKey=d=>JSON.stringify([d.vs,d.ps,d.blend,d.raster&7,d.depth,d.stencil>>>8,d.writeMask]);

// Almacén en IndexedDB (también existe en workers). Si no hay o falla (privado, cuota): sin memoria, sin error.
export function idbStore(name='gh3-native60',key='pipelines'){
 const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const run=(mode,fn)=>open().then(db=>new Promise((resolve,reject)=>{const tx=db.transaction('kv',mode),r=fn(tx.objectStore('kv'));tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=tx.onabort=()=>{db.close();reject(tx.error);};}));
 return {load:()=>typeof indexedDB==='undefined'?Promise.resolve([]):run('readonly',s=>s.get(key)).then(v=>Array.isArray(v)?v:[],()=>[]),
  save:list=>typeof indexedDB==='undefined'?Promise.resolve():run('readwrite',s=>s.put(list,key)).catch(()=>{})};
}

// renderer: {prebuild(desc)→Promise<bool>, has(desc)→bool}. board: tablero (Int32Array) o null. store: {load, save}.
export function createPreloader({renderer,store,board=null,maxInFlight=2,maxEntries=512,saveDelayMs=2000,now=()=>Date.now()}){
 const entries=new Map();  // key → {d: desc, n: sesiones en que se usó, s: se usó con la canción en juego, t: último uso}
 const seen=new Set();let queue=[],inFlight=0,loaded=false,dirty=false,saveAt=0,lastStage=0;
 const stats={recorded:0,preloaded:0,failed:0,songBuilds:0,skippedBusy:0};
 const stage=()=>board?Atomics.load(board,C.STAGE):0,calm=()=>!board||Atomics.load(board,C.LEVEL)===0;
 const publish=()=>{if(!board)return;Atomics.store(board,C.PRELOADED,stats.preloaded);Atomics.store(board,C.PRELOAD_PENDING,queue.length+inFlight);Atomics.store(board,C.SONG_BUILDS,stats.songBuilds);};
 // Orden: primero lo que se usó en canciones, después lo más usado y lo más reciente.
 const order=()=>[...entries.values()].sort((a,b)=>(b.s-a.s)||(b.n-a.n)||(b.t-a.t));
 const ready=store.load().then(list=>{
  for(const e of list)if(e?.d?.vs&&e?.d?.ps){const k=descKey(e.d);if(!entries.has(k))entries.set(k,{d:pipelineDesc(e.d),n:e.n|0,s:e.s?1:0,t:e.t||0});}
  queue=order().map(e=>e.d).filter(d=>!renderer.has(d));loaded=true;publish();
 },()=>{loaded=true;});
 // Llamado por el renderer cuando compiló un pipeline (preload=true si lo pidió la precarga).
 function record(m,preload=false){
  const d=pipelineDesc(m),k=descKey(d),inSong=stage()===2;
  if(preload)stats.preloaded++;else if(inSong)stats.songBuilds++;
  let e=entries.get(k);if(!e)entries.set(k,e={d,n:0,s:0,t:0});
  if(!preload){if(!seen.has(k)){seen.add(k);e.n++;}if(inSong)e.s=1;e.t=now();dirty=true;stats.recorded++;}
  publish();
 }
 // Una vuelta: guarda si hace falta y lanza compilaciones dentro del presupuesto. Barato; se llama cada ~100 ms.
 function pump(){
  const s=stage();
  if(lastStage===2&&s!==2)saveAt=0;  // al terminar la canción se guarda enseguida
  lastStage=s;
  if(!loaded||s!==1)return;  // 0 = sin dato (página vieja): no precarga; 2 = canción en juego
  if(dirty&&now()>=saveAt){dirty=false;saveAt=now()+saveDelayMs;let list=order();if(list.length>maxEntries){list=list.slice(0,maxEntries);entries.clear();for(const e of list)entries.set(descKey(e.d),e);}store.save(list);}
  if(!calm()){if(queue.length)stats.skippedBusy++;return;}
  while(inFlight<maxInFlight&&queue.length){
   const d=queue.shift();if(renderer.has(d))continue;
   inFlight++;renderer.prebuild(d).then(ok=>{if(!ok){stats.failed++;entries.delete(descKey(d));dirty=true;}},()=>{stats.failed++;}).finally(()=>{inFlight--;publish();});
  }
  publish();
 }
 return {record,pump,ready,stats,get pending(){return queue.length+inFlight;},get size(){return entries.size;}};
}
