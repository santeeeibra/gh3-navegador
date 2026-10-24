importScripts('private-store.js');
self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
async function local(request,url){
  let priv,chunks;
  try{
    priv=await GH3PrivateStore.openPrivate();const m=await GH3PrivateStore.get(priv,'meta','active');
    if(!m)return new Response('Primero importá el paquete privado.',{status:503,headers});
    if(request.method!=='GET'&&request.method!=='HEAD')return new Response(null,{status:405,headers});
    let type,parts,size;
    if(url.pathname==='/local-manifest.json'){const body=JSON.stringify(m.catalog);return new Response(request.method==='HEAD'?null:body,{headers:{...headers,'Content-Type':'application/json'}});}
    const match=url.pathname.match(/^\/local-chunk\/([a-f0-9]{64})\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/);
    if(match){if(match[1]!==m.catalog.version)return new Response(null,{status:404,headers});const c=m.catalog.files[+match[2]]?.chunks[+match[3]];if(!c)return new Response(null,{status:404,headers});parts=[c.hash];size=c.size;type='application/octet-stream';}
    else{const entry=m.static.find(f=>f.url===url.pathname);if(!entry)return new Response('Archivo privado no disponible.',{status:404,headers});({parts,size,type}=entry);}
    if(request.method==='HEAD')return new Response(null,{headers:{...headers,'Content-Type':type,'Content-Length':String(size)}});
    chunks=await GH3PrivateStore.openChunks();const blobs=[];
    for(const hash of parts){const b=await GH3PrivateStore.get(chunks,'chunks',hash);if(!(b instanceof Blob))return new Response('Falta una parte. Volvé a importar el paquete.',{status:503,headers});blobs.push(b);}
    const blob=new Blob(blobs,{type});if(blob.size!==size)return new Response('Parte incompleta.',{status:503,headers});
    return new Response(blob,{headers:{...headers,'Content-Type':type,'Content-Length':String(size)}});
  }catch(e){return new Response('No pude recuperar el paquete privado: '+e.message,{status:503,headers});}
  finally{priv?.close();chunks?.close();}
}
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);if(u.origin!==self.location.origin)return;
  // Never send private filenames, program bytes or missing parts to the server.
  if(u.pathname.startsWith('/iphone/private/')||u.pathname==='/local-manifest.json'||u.pathname.startsWith('/local-chunk/'))e.respondWith(local(e.request,u));
});
