// An independent worker serves cached chunks to synchronous reads in the game.
// It never caches HTML/programs, so updates and COOP/COEP stay server-owned.
const CACHE='gh3-network-chunks-v1',pending=new Map();
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),hash=/^\/gh3\/chunks\/([a-f0-9]{64})$/.exec(url.pathname)?.[1];
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!hash)return;
  event.respondWith(serve(event.request,hash));
});
async function serve(request,hash){
  const cache=await caches.open(CACHE),stored=await cache.match(request.url);
  if(stored)return stored;
  if(pending.has(hash))return (await pending.get(hash)).clone();
  const task=(async()=>{
    // A client cancelling a background preview must not cancel a read needed
    // by the game which joined the same request.
    const response=await fetch(new Request(request,{signal:new AbortController().signal}));
    if(!response.ok)return response;
    const bytes=await response.arrayBuffer();
    const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(actual!==hash)return new Response('La parte recibida está dañada.',{status:502});
    const verified=new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Content-Length':String(bytes.byteLength),'X-GH3-Hash':hash}});
    // A full disk can still serve this read. The foreground preparation reports
    // storage failure and does not claim a song was safely prepared.
    try{await cache.put(request.url,verified.clone());}catch{}
    return verified;
  })();
  pending.set(hash,task);
  try{return (await task).clone();}finally{pending.delete(hash);}
}
