// Real delivered consumers + real GPU, delayed page acknowledgement and gaps
// in R5L sequence numbers. This is fixture replay, not game/phone performance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const root='artifacts/r5-live-ready',demo=root+'/demo';
const fixtures=['artifacts/r5-live-song/capture-2/0','artifacts/r5-live-song/capture-3/0'];
const worker=`importScripts(new URLSearchParams(location.search).get('consumer'));
let physical=new Map();const api={readPhysical:(p,n)=>{let b=physical.get(p+':'+n);if(!b)for(const [key,bytes] of physical){const base=Number(key.split(':')[0]);if(base<=p&&p+n<=base+bytes.length){b=bytes.subarray(p-base,p-base+n);break;}}if(!b)throw Error('Missing fixture '+p+':'+n);return b;}};
const send=self.postMessage.bind(self);self.postMessage=(m,...args)=>{if(m.handler==='r5SongFrame')m.testReady=__r5liveReady();send(m,...args);};
onmessage=({data:m})=>{try{
 if(m.type==='probe'){send({test:m.id,ready:__r5liveReady(),again:__r5liveReady(),state:__testLiveState()});return;}
 if(m.type==='seed'){const before=__r5liveReady();__r5liveConsumer(new Uint8Array(),{seq:0,swap:0},api);send({test:m.id,before,ready:__r5liveReady()});return;}
 if(m.type==='offer'){
  const ready=__r5liveReady();if(!ready){send({test:m.id,ready,skipped:true});return;}
  physical=new Map(m.ranges.map(r=>[r.phys+':'+r.length,new Uint8Array(r.data)]));
  __r5liveConsumer(new Uint8Array(m.bytes),{seq:m.seq,swap:m.seq},api);
  send({test:m.id,ready,after:__r5liveReady()});return;
 }
 if(m.type==='bad'){__r5liveConsumer(new Uint8Array(112),{seq:999,swap:999},api);send({test:m.id,ready:__r5liveReady()});}
}catch(e){send({test:m.id,error:e.stack});}};`;
const html=`<!doctype html><script>
window.run=async()=>{
 const fixtures=await Promise.all([0,1].map(async i=>{const meta=await(await fetch('/fixture/'+i+'/resources.json')).json();return {bytes:await(await fetch('/fixture/'+i+'/frame.r5f')).arrayBuffer(),ranges:await Promise.all(meta.resources.map(async r=>({...r,data:await(await fetch('/fixture/'+i+'/'+r.phys+'-'+r.length+'.bin')).arrayBuffer()})))};}));
 const checks=[],errors=[];const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label);};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 function client(name){
  const w=new Worker('/gh3/test-worker.js?consumer='+name),requests=new Map(),frames=[],reports=[];let id=0;
  w.onerror=e=>errors.push(e.message);
  w.onmessage=({data:m})=>{if(m.test){requests.get(m.test)?.(m);requests.delete(m.test);}if(m.handler==='r5SongReport')reports.push(m.args[0]);if(m.handler==='r5SongFrame')frames.push(m);};
  const ask=m=>new Promise((resolve,reject)=>{const rid=++id;const t=setTimeout(()=>reject(Error('test message timeout')),15000);requests.set(rid,r=>{clearTimeout(t);r.error?reject(Error(r.error)):resolve(r);});w.postMessage({...m,id:rid});});
  async function ready(){for(let i=0;i<1000;i++){const r=await ask({type:'probe'});if(r.ready===1)return;await wait(10);}throw Error('renderer ready timeout');}
  async function frame(){for(let i=0;i<1000;i++){if(frames.length)return frames.shift();if(reports.at(-1)?.fatal)throw Error(reports.at(-1).fatal);await wait(10);}throw Error('bitmap timeout '+name+' '+JSON.stringify(await ask({type:'probe'})));}
  async function consume(m){const [bitmap,info,latch]=m.args,c=new OffscreenCanvas(1280,720),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const pixels=ctx.getImageData(0,0,1280,720).data;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(x=>x.toString(16).padStart(2,'0')).join('');Atomics.store(new Int32Array(latch),0,0);return {seq:info.seq,hash};}
  return {w,ask,ready,frame,consume,reports};
 }
 const results=[];
 for(const name of ['r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js']){
  const a=client(name);try{
   let r=await a.ask({type:'seed'});check(r.before===1&&r.ready===0,name+': bootstrap then wait');await a.ready();
   r=await a.ask({type:'probe'});check(r.ready===1&&r.again===1,name+': read-only ready');
   const hashes=[];
   for(const [index,seq] of [1,9,27].entries()){
    const f=fixtures[index===1?1:0];r=await a.ask({type:'offer',...f,seq});check(r.ready===1&&r.after===0,name+': busy after seq '+seq);
    const m=await a.frame();check(m.testReady===0,name+': pending bitmap seq '+seq);
    await wait(100);r=await a.ask({type:'offer',...f,seq:seq+1});check(r.skipped&&r.ready===0,name+': held ack blocks capture '+seq);
    const hash=await a.consume(m);hashes.push(hash);await a.ready();
    // Fresh consumer drawing that same isolated frame: compare every byte via
    // SHA, not just counters or successful pipeline creation.
    const b=client(name);try{await b.ask({type:'seed'});await b.ready();await b.ask({type:'offer',...f,seq});const reference=await b.consume(await b.frame());check(hash.hash===reference.hash,name+': gap vs fresh pixels '+seq);}finally{b.w.terminate();}
   }
   check(hashes[0].hash!==hashes[1].hash,name+': different snapshot changes pixels');
   check(hashes[0].hash===hashes[2].hash,name+': restored first snapshot');
   r=await a.ask({type:'bad'});check(r.ready===0,name+': parse failure stops admission');
   r=await a.ask({type:'probe'});check(r.ready===0&&r.again===0,name+': fatal remains closed');
   results.push({name,hashes,fatal:a.reports.at(-1)?.fatal});
  }finally{a.w.terminate();}
 }
 return {checks,results,errors};
};</script>`;
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-ready-'+crypto.randomBytes(6).toString('hex');
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado: no GPU replay started');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: readiness R5L, replay Edge con GPU (sin arrancar GH3)\nDesde: ${new Date().toISOString()}\nFin estimado: 3 minutos\n`);
let server,browser,report={ok:false};
try{
 server=createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  const url=new URL(req.url,'http://local');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(url.pathname==='/gh3/test-worker.js'){res.setHeader('Content-Type','text/javascript');res.end(worker);return;}
  let file;
  const match=url.pathname.match(/^\/fixture\/([01])\/([\w.-]+)$/);
  if(match)file=fixtures[Number(match[1])]+'/'+match[2];
  else if(/^\/gh3\/[\w.-]+\.js$/.test(url.pathname))file=demo+'/'+path.basename(url.pathname);
  if(!file||!fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':'application/octet-stream');
  if(/r5snap-song-(render|colas|scene)\.js$/.test(file))res.end(fs.readFileSync(file,'utf8').replace('  globalThis.__r5liveConsumer =','  globalThis.__testLiveState = () => state;\n  globalThis.__r5liveConsumer ='));
  else res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);report=await page.evaluate(()=>run());
 assert.deepEqual(report.errors,[]);assert.deepEqual(pageErrors,[]);report.pageErrors=pageErrors;report.ok=true;
 console.log(JSON.stringify({ok:true,checks:report.checks.length,modes:report.results.map(r=>r.name)}));
}catch(e){report.error=e.stack;process.exitCode=1;console.log(e.stack);}
finally{
 await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(fs.readFileSync(turn,'utf8').includes('Reserva: '+token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: readiness R5L replay cerrado\nFin: ${new Date().toISOString()}\n`);
 fs.writeFileSync(root+'/verification.json',JSON.stringify(report,null,2));
}
