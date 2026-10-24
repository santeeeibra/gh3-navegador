// Public infrastructure only. Game bytes are selected locally and never uploaded.
globalThis.GH3PrivateStore = (() => {
  const req = q => new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
  function open(name,stores){return new Promise((resolve,reject)=>{const q=indexedDB.open(name,1);q.onupgradeneeded=()=>stores.forEach(s=>q.result.createObjectStore(s));q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);q.onblocked=()=>reject(Error('Cerrá las otras pestañas y reintentá.'));});}
  const openChunks=()=>open('gh3-local-chunks-v1',['chunks','meta']);
  const openPrivate=()=>open('gh3-mobile-private-v1',['meta']);
  const get=(db,store,key)=>req(db.transaction(store).objectStore(store).get(key));
  const put=(db,store,key,value)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||Error('No pude guardar.'));});
  const hash=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
  function validate(m,fileSize,bodyOffset){
    if(m?.format!=='gh3-mobile-private-1'||!Array.isArray(m.chunks)||!m.chunks.length||m.chunks.length>4096||!Array.isArray(m.static)||!m.static.length||m.static.length>64)throw Error('Paquete no reconocido.');
    let offset=0;const sizes=new Map(),paths=new Set();
    for(const c of m.chunks){if(!/^[a-f0-9]{64}$/.test(c.hash)||sizes.has(c.hash)||c.offset!==offset||!Number.isSafeInteger(c.size)||c.size<1||c.size>2*1048576)throw Error('Parte inválida.');sizes.set(c.hash,c.size);offset+=c.size;}
    if(bodyOffset+offset!==fileSize)throw Error('Paquete incompleto o con datos extra.');
    for(const f of m.static){if(!/^\/iphone\/private\/[a-zA-Z0-9._-]+$/.test(f.url)||paths.has(f.url)||typeof f.type!=='string'||!Array.isArray(f.parts)||f.parts.some(h=>!sizes.has(h))||f.parts.reduce((n,h)=>n+sizes.get(h),0)!==f.size)throw Error('Archivo del programa inválido.');paths.add(f.url);}
    if(!paths.has('/iphone/private/index.html')||!paths.has('/iphone/private/gh3-web.wasm'))throw Error('Falta el programa.');
    const catalog=m.catalog;
    if(catalog?.format!==1||!/^[a-f0-9]{64}$/.test(catalog.version)||!Array.isArray(catalog.files)||!catalog.packages?.base||!catalog.packages?.slowride)throw Error('Lista del juego inválida.');
    for(const [i,f] of catalog.files.entries()){
      if(f.id!==i||typeof f.path!=='string'||!f.path||f.path.includes('\\')||f.path.includes(':')||f.path.split('/').some(p=>!p||p==='.'||p==='..')||!Number.isSafeInteger(f.size)||f.size<0||!Array.isArray(f.chunks))throw Error('Ruta de juego inválida.');
      let at=0;for(const c of f.chunks){if(c.offset!==at||!Number.isSafeInteger(c.size)||c.size<1||c.size>2*1048576||!/^[a-f0-9]{64}$/.test(c.hash))throw Error('Lista de partes inválida.');at+=c.size;}if(at!==f.size)throw Error('Archivo de juego incompleto.');
    }
    for(const p of Object.values(catalog.packages))if(!Array.isArray(p.files)||p.files.some(i=>!Number.isInteger(i)||!catalog.files[i]))throw Error('Canción inválida.');
    for(const id of [...catalog.packages.base.files,...catalog.packages.slowride.files])for(const c of catalog.files[id].chunks)if(sizes.get(c.hash)!==c.size)throw Error('Falta una dependencia inicial.');
    return m;
  }
  return {openChunks,openPrivate,get,put,hash,validate};
})();
