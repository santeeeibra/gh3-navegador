import http from 'node:http';
import {stat,readFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
const root=path.resolve('D:/guitar hero');
const dist=path.join(root,'toolchain/bottleship/dist');
const out=path.join(root,'artifacts/graphics-probe/extended');
const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.png':'image/png','.woff2':'font/woff2','.wgb':'application/octet-stream'};
export function startServer(){return new Promise((resolve,reject)=>{
 const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://127.0.0.1');
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return;}
  const bundle=/^\/(triangle|texture|shader)\.wgb$/.exec(u.pathname);const base=bundle?out:dist;
  const rel=bundle?bundle[1]+'/probe.wgb':decodeURIComponent(u.pathname==='/'?'index.html':u.pathname.slice(1));
  const file=path.resolve(base,rel);if(!file.startsWith(base+path.sep)){res.writeHead(403);res.end();return;}
  const st=await stat(file);if(!st.isFile()){res.writeHead(404);res.end();return;}
  const headers={'Content-Type':types[path.extname(file)]??'application/octet-stream','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store','Accept-Ranges':'bytes'};
  let start=0,end=st.size-1,status=200;
  if(req.headers.range){const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!m){res.writeHead(416);res.end();return;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end){res.writeHead(416);res.end();return;}status=206;headers['Content-Range']=`bytes ${start}-${end}/${st.size}`;}
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);
  if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).pipe(res);
 }catch(e){res.writeHead(404);res.end();}});
 server.once('error',reject);server.listen(5188,'127.0.0.1',()=>resolve(server));
});}

