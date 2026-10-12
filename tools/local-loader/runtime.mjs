import {sha256} from './sha256.mjs';
import {openCache,put} from './cache.mjs';
import {chunkURL} from './cache.mjs';
import {createSongPrefetcher} from './song-prefetch.mjs';
// Adapter only in the isolated copy: retains WORKERFS directory/stat/seek and
// the game's existing synchronous read interface. Prepared Blob chunks remain
// disk-backed. Unexpected dependencies are fetched from the loopback server.
export function createReader({cached=new Map(),fetchSync,readBlob,persist=()=>{},onMiss=()=>{},beforeRead=()=>{},maxBytes=32*1048576}){
  const hot=new Map(),verified=new Set();let bytes=0;
  return (f,buffer,offset,length,position)=>{
    if(position>=f.size||length<=0)return 0;
    beforeRead(f);
    const end=Math.min(f.size,position+length);let at=position;
    while(at<end){
      const i=Math.floor(at/f.chunkSize),c=f.chunks[i];if(!c)throw Error('Parte ausente.');
      let b=hot.get(c.hash);
      if(b){hot.delete(c.hash);hot.set(c.hash,b);}else{
        const blob=cached.get(c.hash);b=blob?readBlob(blob):fetchSync(f,i);
        if(b.length!==c.size||(!verified.has(c.hash)&&sha256(b)!==c.hash))throw Error('Integridad de archivo incorrecta: '+f.path);
        verified.add(c.hash);
        if(!blob){onMiss(f,c);persist(c.hash,new Blob([b]));}
        hot.set(c.hash,b);bytes+=b.length;
        while(bytes>maxBytes&&hot.size>1){const [key,old]=hot.entries().next().value;hot.delete(key);bytes-=old.length;}
      }
      const start=at-c.offset,n=Math.min(end-at,c.size-start);if(n<=0)throw Error('Lectura fuera de la parte.');
      buffer.set(b.subarray(start,start+n),offset+at-position);at+=n;
    }
    return end-position;
  };
}
export function install(WORKERFS,configuration){
  const cached=new Map(configuration.chunks),db=openCache();let misses=0;
  db.catch(e=>self.postMessage({type:'localCache',error:e.message}));
  const readBlob=blob=>new Uint8Array(WORKERFS.reader.readAsArrayBuffer(blob));
  const persist=(hash,blob)=>{cached.set(hash,blob);db.then(d=>put(d,'chunks',hash,blob)).catch(e=>self.postMessage({type:'localCache',error:e.message}));};
  const fetchSync=(f,i)=>{
      const xhr=new XMLHttpRequest();xhr.open('GET',chunkURL(configuration,f,i),false);xhr.responseType='arraybuffer';xhr.send();
      if(xhr.status!==200)throw Error('Falta un archivo y el servidor local no está disponible: '+f.path);
      return new Uint8Array(xhr.response);
    };
  const prefetch=createSongPrefetcher({packages:configuration.songFiles||{},notify:m=>self.postMessage(m),ensureChunk:(f,i)=>{
    const c=f.chunks[i],existing=cached.get(c.hash);
    const bytes=existing?readBlob(existing):fetchSync(f,i);
    if(bytes.length!==c.size||sha256(bytes)!==c.hash)throw Error('Integridad de canción incorrecta: '+f.path);
    if(!existing)persist(c.hash,new Blob([bytes]));
  }});
  const reader=createReader({cached,readBlob,fetchSync,persist,beforeRead:prefetch,
    onMiss:(f,c)=>self.postMessage({type:'localCache',misses:++misses,path:f.path,bytes:c.size}),
  });
  const original=WORKERFS.stream_ops.read;
  WORKERFS.stream_ops.read=function(stream,...args){
    if(!stream.node.contents.gh3Local)return original.call(this,stream,...args);
    try{return reader(stream.node.contents,...args);}catch(e){self.postMessage({type:'localCache',fatal:e.message});throw e;}
  };
}
globalThis.GH3LocalFS={install};
// Count real program bytes while preserving streaming compilation; no second
// copy of the 124 MB response. Runs only in the main worker's isolated adapter.
if(typeof WorkerGlobalScope!=='undefined'&&globalThis instanceof WorkerGlobalScope){
  const nativeFetch=globalThis.fetch;
  globalThis.fetch=async function(...args){
    const response=await nativeFetch(...args),url=typeof args[0]==='string'?args[0]:args[0]?.url;
    if(!/\.wasm(?:\?|$)/.test(url||'')||!response.ok||!response.body)return response;
    const total=Number(response.headers.get('content-length'))||0,reader=response.body.getReader();let loaded=0,last=0;
    self.postMessage({type:'engineLoad',loaded,total,done:false});
    const stream=new ReadableStream({async pull(controller){try{
      const {done,value}=await reader.read();
      if(done){self.postMessage({type:'engineLoad',loaded,total,done:true});controller.close();return;}
      loaded+=value.byteLength;const now=performance.now();if(now-last>150){last=now;self.postMessage({type:'engineLoad',loaded,total,done:false});}controller.enqueue(value);
    }catch(e){controller.error(e);self.postMessage({type:'localCache',fatal:'No se pudo cargar el programa: '+e.message});}},cancel(reason){return reader.cancel(reason);}});
    return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
  };
}
