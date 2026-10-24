export const CHUNK_CACHE='gh3-network-chunks-v1';
export async function activateChunkCache(){
  if(!('serviceWorker' in navigator)||!('caches' in globalThis))throw Error('Este navegador no permite la caché compartida del juego.');
  const scope=new URL('/gh3/',location.href).href;
  await navigator.serviceWorker.register('/gh3/gh3-chunks-sw.js',{scope,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(Error('La caché del juego no pudo activarse. Recargá para reintentar.'));},15000);
    const changed=()=>{if(!navigator.serviceWorker.controller)return;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve();};
    navigator.serviceWorker.addEventListener('controllerchange',changed);changed();
  });
}
export async function warmChunk(url,hash,blob){
  const cache=await caches.open(CHUNK_CACHE),old=await cache.match(url);
  if(old&&old.headers.get('X-GH3-Hash')===hash&&Number(old.headers.get('Content-Length'))===blob.size)return;
  await cache.put(url,new Response(blob,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(blob.size),'X-GH3-Hash':hash}}));
}
