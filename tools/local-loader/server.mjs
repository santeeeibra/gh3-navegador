import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.json':'application/json; charset=utf-8'};
const headers={'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','X-Content-Type-Options':'nosniff'};
export function createLoaderServer({root,game,catalog,assets,onRequest=()=>{}}){
  const manifest=JSON.stringify(catalog);
  return http.createServer((req,res)=>{
    for(const [k,v] of Object.entries(headers))res.setHeader(k,v);
    res.setHeader('Cache-Control','no-store');
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){res.writeHead(403).end();return;}
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){res.writeHead(403).end();return;}
    if(req.headers['sec-fetch-site']==='cross-site'){res.writeHead(403).end();return;}
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405).end();return;}
    let url;try{url=new URL(req.url,`http://${host}`);}catch{res.writeHead(400).end();return;}
    onRequest(url.pathname);
    if(url.pathname==='/local-manifest.json'){
      res.writeHead(200,{'Content-Type':types['.json'],'Content-Length':Buffer.byteLength(manifest)});res.end(req.method==='HEAD'?undefined:manifest);return;
    }
    if(url.pathname.startsWith('/local-chunk/')){
      const match=url.pathname.match(/^\/local-chunk\/([a-f0-9]{64})\/(0|[1-9]\d*)\/(0|[1-9]\d*)$/);
      if(!match||match[1]!==catalog.version){res.writeHead(404).end();return;}
      const file=catalog.files[Number(match[2])],chunk=file?.chunks[Number(match[3])];
      if(!chunk){res.writeHead(404).end();return;}
      const filename=path.resolve(game,...file.path.split('/'));
      if(!filename.startsWith(path.resolve(game)+path.sep)){res.writeHead(403).end();return;}
      try{
        const st=fs.statSync(filename),expected=assets.gameStats[file.id];
        if(st.size!==file.size||st.mtimeMs!==expected.mtimeMs){res.writeHead(409).end('La copia cambió; regenerá la lista.');return;}
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':chunk.size,'ETag':`"${chunk.hash}"`});
        if(req.method==='HEAD'){res.end();return;}
        const stream=fs.createReadStream(filename,{start:chunk.offset,end:chunk.offset+chunk.size-1});
        stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
      }catch{res.writeHead(404).end();}return;
    }
    const name=url.pathname==='/'?'index.html':url.pathname.slice(1),entry=assets.static[name];
    if(!entry){res.writeHead(404).end();return;}
    try{
      const filename=path.resolve(root,name);
      if(!filename.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
      const st=fs.statSync(filename);
      res.setHeader('Cache-Control','no-cache');res.setHeader('ETag',`"${entry.hash}"`);
      if(req.headers['if-none-match']===`"${entry.hash}"`){res.writeHead(304).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','Content-Length':st.size});
      if(req.method==='HEAD'){res.end();return;}
      const stream=fs.createReadStream(filename);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch{res.writeHead(404).end();}
  });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const out=path.resolve(process.env.GH3_LOADER_OUT||'artifacts/local-loader'),config=JSON.parse(fs.readFileSync(path.join(out,'server-config.json')));
  const catalog=JSON.parse(fs.readFileSync(path.join(out,'catalog.json'))),assets=JSON.parse(fs.readFileSync(path.join(out,'assets.json')));
  const port=Number(process.argv[2]||5440);
  createLoaderServer({root:path.join(out,'demo'),game:config.game,catalog,assets}).listen(port,'127.0.0.1',()=>console.log(`Cargador local: http://127.0.0.1:${port}/`));
}
