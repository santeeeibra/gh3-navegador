import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=resolve(fileURLToPath(new URL('../../artifacts/fase2-threads/',import.meta.url)));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm'};
createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');
 res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 res.setHeader('Cross-Origin-Resource-Policy','same-origin');
 res.setHeader('Cache-Control','no-store');
 try{
  const url=new URL(req.url,'http://localhost');
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
  const path=resolve(root,name);
  // Solo la demo y sus builds: nunca servir fuentes, disco o datos comerciales.
  if(!path.startsWith(root+sep)||!(name==='index.html'||name==='frame.html'||/^build\/threads-(ok32|ok64|nosafepoint32)\.(js|wasm)$/.test(name))){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
  res.end(await readFile(path));
 }catch{res.writeHead(404).end('No encontrado');}
}).listen(Number(process.env.PORT||5174),'127.0.0.1',()=>console.log('Fase 2: http://localhost:'+ (process.env.PORT||5174)));
