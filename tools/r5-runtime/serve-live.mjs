// Local server with explicit allowlist; never serves the commercial DATA directory.
import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve} from 'node:path';
export async function liveServer(port=0){
 const root=resolve(import.meta.dirname,'../..');
 const live=process.env.R5_LIVE_OUT||'artifacts/r5-live';
 const files={'/':live+'/index.html','/index.html':live+'/index.html','/gh3-web.js':live+'/gh3-web.js','/gh3-web.wasm':process.env.R5_RUNTIME_WASM||'artifacts/d1-wasm/d4/gh3-web.wasm','/r5snap-codex.js':live+'/r5snap-codex.js'};
 const server=createServer((req,res)=>{
   res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
   const name=files[new URL(req.url,'http://localhost').pathname];if(!name){res.writeHead(404).end();return;}
   try{const path=resolve(root,name);res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'text/html','Content-Length':statSync(path).size});createReadStream(path).pipe(res);}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));return server;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){const s=await liveServer(Number(process.argv[2]||5189));console.log('Local R5: http://127.0.0.1:'+s.address().port+'/?cpasync=1&cpwait=event&r5snap=1&r5consumer=r5snap-codex.js&press=150:start,175:start&waitmulti=event');}
