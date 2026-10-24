// Loopback allowlist: never serve commercial DATA or local instructions.
import {createServer} from 'node:http';
import {createReadStream,statSync} from 'node:fs';
import {resolve} from 'node:path';
export async function menuServer(port=0){
 const demo=resolve(import.meta.dirname,'../../artifacts/r5-live-menu/demo');
 const files={'/':demo+'/index.html','/index.html':demo+'/index.html','/gh3-web.js':demo+'/gh3-web.js','/r5snap-r5l-codex.js':demo+'/r5snap-r5l-codex.js','/gh3-web.wasm':resolve(import.meta.dirname,'../../artifacts/d1-wasm/r5live/d4/gh3-web.wasm')};
 const server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('Cache-Control','no-store');
  const name=files[new URL(req.url,'http://localhost').pathname];if(!name){res.writeHead(404).end();return;}
  try{res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'text/html; charset=utf-8','Content-Length':statSync(name).size});createReadStream(name).pipe(res);}catch{res.writeHead(404).end();}
 });
 await new Promise((ok,fail)=>{server.once('error',fail);server.listen(port,'127.0.0.1',ok);});return server;
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(import.meta.filename)){const server=await menuServer(Number(process.argv[2]||5196));console.log('GH3 parcial en vivo: http://127.0.0.1:'+server.address().port+'/');}
