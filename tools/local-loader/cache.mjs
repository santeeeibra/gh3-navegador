export const DB_NAME='gh3-local-chunks-v1';
export const request = q => new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
function openOnce(){
  return new Promise((resolve,reject)=>{
    const q=indexedDB.open(DB_NAME,1);
    q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('chunks'))d.createObjectStore('chunks');if(!d.objectStoreNames.contains('meta'))d.createObjectStore('meta');};
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);
    q.onblocked=()=>reject(Error('Cerrá las otras pestañas de esta prueba y reintentá.'));
  });
}
// 2026-10-24: en Safari algunas bases quedaban sin sus tablas ("object stores was not found"); se borra la vacía y se vuelve a crear.
export async function openCache(){
  const db=await openOnce();
  if(db.objectStoreNames.contains('chunks')&&db.objectStoreNames.contains('meta'))return db;
  db.close();
  await new Promise(r=>{const d=indexedDB.deleteDatabase(DB_NAME);d.onsuccess=d.onerror=d.onblocked=()=>r();});
  return openOnce();
}
export function get(db,store,key){return request(db.transaction(store).objectStore(store).get(key));}
export function put(db,store,key,value){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);
    tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error||Error('No se pudo guardar en el navegador.'));
  });
}
export const digest=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
export function validateManifest(m){
  if(m?.format!==1||!Number.isSafeInteger(m.chunkSize)||m.chunkSize<=0||m.chunkSize>8*1048576||!Array.isArray(m.files)||!/^[a-f0-9]{64}$/.test(m.version)||!m.files.length)throw Error('Lista de archivos inválida.');
  const paths=new Set();
  if(m.delivery&&!/^(\/[a-zA-Z0-9_-]+)+$/.test(m.delivery.chunks||''))throw Error('Ruta de entrega inválida.');
  for(const [i,f] of m.files.entries()){
    if(f.id!==i||typeof f.path!=='string'||!f.path||f.path.includes('\\')||f.path.split('/').some(x=>!x||x==='.'||x==='..')||f.path.includes(':')||paths.has(f.path.toLowerCase()))throw Error('Ruta de archivo inválida.');
    paths.add(f.path.toLowerCase());
    if(!Number.isSafeInteger(f.size)||f.size<0||!Array.isArray(f.chunks))throw Error('Tamaño inválido.');
    let at=0;
    for(const c of f.chunks){if(c.offset!==at||!Number.isSafeInteger(c.size)||c.size<=0||c.size>m.chunkSize||!/^[a-f0-9]{64}$/.test(c.hash))throw Error('Parte de archivo inválida.');at+=c.size;}
    if(at!==f.size)throw Error('Archivo incompleto en la lista.');
  }
  for(const p of Object.values(m.packages||{}))if(!Array.isArray(p.files)||p.files.some(i=>!Number.isInteger(i)||!m.files[i]))throw Error('Paquete inválido.');
  return m;
}
export const chunkURL=(m,f,i)=>m.delivery?.chunks ? `${m.delivery.chunks}/${f.chunks[i].hash}` : `/local-chunk/${m.version}/${f.id}/${i}`;
export async function loadChunk(db,m,f,i,stats,signal){
  const c=f.chunks[i];let blob=await get(db,'chunks',c.hash);
  const share=async()=>{if(m.delivery?.sharedCache){const {warmChunk}=await import('./network-cache.mjs');await warmChunk(chunkURL(m,f,i),c.hash,blob);}};
  if(blob instanceof Blob&&blob.size===c.size&&await digest(await blob.arrayBuffer())===c.hash){await share();stats.cached+=c.size;return blob;}
  // Retry interrupted/incorrect transfers, keeping already committed chunks.
  for(let attempt=0;attempt<3;attempt++){
    if(signal?.aborted)throw new DOMException('Preparación pausada.','AbortError');
    try{
      const r=await fetch(chunkURL(m,f,i),{signal,cache:'no-store'});
      if(!r.ok)throw Object.assign(Error(`No se pudo cargar una parte (${r.status}).`),{resource:chunkURL(m,f,i),status:r.status});
      const b=await r.arrayBuffer();
      if(b.byteLength!==c.size||await digest(b)!==c.hash)throw Error('Una parte llegó incompleta o modificada.');
      // Si el celular no tiene espacio, la parte igual sirve para esta sesión (no queda guardada).
      blob=new Blob([b]);try{await put(db,'chunks',c.hash,blob);}catch(e){if(e.name!=='QuotaExceededError')throw e;}
      await share();stats.downloaded+=c.size;return blob;
    }catch(e){if(!e.resource)try{e.resource=chunkURL(m,f,i);}catch{}if(signal?.aborted||e.name==='QuotaExceededError'||attempt===2)throw e;}
  }
}
export async function prepare(db,m,packageIds,{signal,onProgress=()=>{}}={}){
  const ids=[...new Set(packageIds.flatMap(id=>{if(!m.packages[id])throw Error('Paquete desconocido.');return m.packages[id].files;}))];
  const total=ids.reduce((n,i)=>n+m.files[i].size,0),stats={total,done:0,cached:0,downloaded:0},chunks=new Map();
  for(const id of ids){const f=m.files[id];for(let i=0;i<f.chunks.length;i++){
    if(signal?.aborted)throw new DOMException('Preparación pausada.','AbortError');
    const c=f.chunks[i],blob=await loadChunk(db,m,f,i,stats,signal);chunks.set(c.hash,blob);stats.done+=c.size;onProgress({...stats,path:f.path});
  }}
  return {chunks,stats,ids};
}
