// Isolated server for Claude's real test of the hosted flow, without Preparar.
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';
export function createDemandServer({root,staticNames,latencyMs=0,bandwidthKBps=0,onChunk=()=>{}}){
 const allowed=new Set([...staticNames,'manifest.json']),absoluteRoot=path.resolve(root);
 return http.createServer((req,res)=>{
  for(const [key,value] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-store'}))res.setHeader(key,value);
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
  const p=new URL(req.url,'http://local').pathname;if(!p.startsWith('/gh3/')){res.writeHead(404).end();return;}
  const name=p==='/gh3/'?'index.html':p.slice(5),hash=/^chunks\/([a-f0-9]{64})$/.exec(name)?.[1];
  if(!hash&&!allowed.has(name)){res.writeHead(404).end();return;}
  const file=path.resolve(absoluteRoot,name);if(!file.startsWith(absoluteRoot+path.sep)){res.writeHead(403).end();return;}
  let size;try{size=fs.statSync(file).size;}catch{res.writeHead(404).end();return;}
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.json')?'application/json':name.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.setHeader('Content-Length',size);
  if(req.method==='HEAD'){res.end();return;}
  const stream=()=>{if(res.destroyed)return;const input=fs.createReadStream(file);input.on('error',()=>res.destroy());res.on('close',()=>input.destroy());input.pipe(res);};
  if(hash){onChunk({hash,size,at:Date.now()});setTimeout(stream,latencyMs+(bandwidthKBps?size/bandwidthKBps:0));}else stream();
 });
}
