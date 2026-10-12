import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
process.env.GH3_DELIVERY='unified-local';
await import('./build.mjs');
const port=Number(process.env.PORT||5173);
const root=resolve('dist'), types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.wasm':'application/wasm','.json':'application/json'};
createServer(async(req,res)=>{
 for(const [key,value] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'})) res.setHeader(key,value);
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(path!==root && !path.startsWith(root+sep)){res.writeHead(403).end();return;}
 try{const file=new URL(req.url,'http://localhost').pathname.endsWith('/')?resolve(path,'index.html'):path;res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(await readFile(file));}
 catch{res.writeHead(404).end('No encontrado');}
}).listen(port,'0.0.0.0',()=>console.log('http://localhost:'+port));
