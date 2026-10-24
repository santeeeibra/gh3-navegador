import {chromium} from 'playwright';import http from 'http';import fs from 'fs';import path from 'path';
const dir=process.argv[2];
const srv=http.createServer((q,r)=>{const f=path.join(dir,decodeURIComponent(q.url.split('?')[0]).replace(/\/$/,'/index.html'));r.setHeader('Cross-Origin-Opener-Policy','same-origin');r.setHeader('Cross-Origin-Embedder-Policy','require-corp');try{r.setHeader('content-type',({js:'text/javascript',html:'text/html; charset=utf-8',json:'application/json',css:'text/css',wasm:'application/wasm'})[f.split('.').pop()]||'application/octet-stream');r.end(fs.readFileSync(f));}catch{r.statusCode=404;r.end();}}).listen(0);
await new Promise(r=>srv.on('listening',r));
const b=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-webgpu']});
const p=await b.newPage({viewport:{width:1280,height:720}});
await p.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{get:()=>false}));
const errs=[];p.on('pageerror',e=>errs.push(e.message));
const url=`http://localhost:${srv.address().port}/index.html`;
// base de datos rota: existe pero sin tablas (el caso de Safari)
await p.goto(url+'?equipo=0');
await p.evaluate(()=>new Promise((ok)=>{const d=indexedDB.deleteDatabase('gh3-local-chunks-v1');d.onsuccess=d.onerror=()=>{const q=indexedDB.open('gh3-local-chunks-v1',1);q.onsuccess=()=>{q.result.close();ok();};};}));
await p.reload();await p.waitForTimeout(3000);
console.log('tablas tras reparar:',await p.evaluate(()=>new Promise(ok=>{const q=indexedDB.open('gh3-local-chunks-v1');q.onsuccess=()=>{const n=[...q.result.objectStoreNames];q.result.close();ok(n.join(','));};q.onerror=()=>ok('error');})));
// recurso roto: debe nombrar el archivo
await p.evaluate(()=>{const i=document.createElement('img');i.src='/no-existe-prueba.png';document.body.appendChild(i);});
await p.waitForTimeout(800);
console.log('errores de página:',errs);
await b.close();srv.close();
