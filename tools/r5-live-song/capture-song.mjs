// Short isolated song diagnostic; no native window or global keyboard events.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const label=process.argv[2]||'capture-1';if(!/^[A-Za-z0-9_-]+$/.test(label))throw Error('Invalid label');
const out='artifacts/r5-live-song/'+label,runtime='artifacts/r5-live-song/capture-runtime';fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`codex-song-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Test turn occupied');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: captura corta Slow Ride R5L, Edge oculto\nDesde: ${new Date().toISOString()}\nFin: estimado 4 min\n`);
let browser,server;const report={errors:[],steps:[],ok:false};
try{
 server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  const url=new URL(req.url,'http://localhost').pathname;
  if(req.method==='POST'&&/^\/capture\/\d+\/(?:frame\.r5f|resources\.json|\d+-\d+\.bin)$/.test(url)){
   const filename=out+url.replace('/capture',''),chunks=[];let size=0;
   req.on('data',b=>{size+=b.length;if(size>100*1024*1024)req.destroy();else chunks.push(b);});
   req.on('end',()=>{fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,Buffer.concat(chunks));res.end('ok');});return;
  }
  const files={'/':runtime+'/index.html','/gh3-web.js':runtime+'/gh3-web.js','/r5snap-song-capture.js':runtime+'/r5snap-song-capture.js','/gh3-web.wasm':'artifacts/d1-wasm/r5live/d4/gh3-web.wasm'};
  const file=files[url];if(!file){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.wasm')?'application/wasm':'text/html');fs.createReadStream(file).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.setInputFiles('#dir','D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');await page.click('#go');
 const tap=async(button,delay=1200)=>{await page.evaluate(button=>songWorker.postMessage({type:'press',buttons:button,ms:150}),button);await page.waitForTimeout(delay);};
 const seen=pattern=>page.evaluate(p=>songDiag.lines.some(l=>new RegExp(p,'i').test(l)),pattern);
 const started=Date.now();
 const progress=async(step)=>{report.steps.push({step,t:(Date.now()-started)/1000});fs.writeFileSync(out+'/progress.json',JSON.stringify(report,null,2));};
 await page.waitForFunction(()=>window.songCaptureFlag,null,{timeout:30000});await progress('runtime/consumer ready');
 for(let i=0;i<60&&!await seen('memcard.*gh\\.png');i++)await tap(0x10);
 await progress('title passed');
 for(let i=0;i<40&&!await seen('GH3_Intro\\.bik');i++)await tap(0x10,1500);
 await progress('menu');await page.waitForTimeout(3000);
 await tap(0x1000,2500);await tap(0x1000,1500);await tap(0x10,2500);
 for(let i=0;i<35&&!await seen('slowride_song\\.pak');i++)await tap(0x1000,2500);
 if(!await seen('slowride_song\\.pak'))throw Error('Did not load Slow Ride');await progress('Slow Ride data loaded');
 // Last confirmation is harmless while loading, and starts the venue if needed.
 await tap(0x1000,20000);
 for(let i=0;i<3;i++){
  await page.evaluate(()=>Atomics.store(new Int32Array(songCaptureFlag),0,1));
  await page.waitForFunction(n=>songDiag.saved>n,i,{timeout:30000});await progress('saved frame '+i);await page.waitForTimeout(5000);
 }
 report.state=await page.evaluate(()=>songDiag);fs.writeFileSync(out+'/runtime.log',report.state.lines.join('\n'));delete report.state.lines;report.ok=true;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{
 await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(fs.readFileSync(turn,'utf8').includes(`Reserva: ${token}`))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: captura Slow Ride terminada\nFin: ${new Date().toISOString()}\n`);
 fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
}
console.log(JSON.stringify(report));
