// Deterministic replay of Claude's real highway snapshot. No GH3 execution.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const out = path.resolve('artifacts/hw60-codex/offline');
fs.mkdirSync(out, {recursive:true});
const turn = 'artifacts/PRUEBAS-EN-CURSO.md', token = `hw60-offline-${process.pid}`;
assert.ok(fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'), 'Turno ocupado');
fs.writeFileSync(turn, `Estado: OCUPADO\nQuién: Codex hw60 replay\nReserva: ${token}\n`);
const html = `<!doctype html><style>body{margin:0}#r5Canvas{width:1280px;height:720px;display:block}</style><canvas id="r5Canvas" width="1280" height="720"></canvas>
<script>
window.testNow=1000;performance.now=()=>window.testNow;
let raf;window.requestAnimationFrame=fn=>(raf=fn,1);window.step=()=>raf(testNow);
window.gh3Song={clock:()=>19024.06883239746+testNow-1000};
window.BroadcastChannel=class {constructor(){window.tapChannel=this;}postMessage(){}};
window.load=async()=>{
 const dec=(k,v)=>v&&v.$t?new globalThis[v.$t](Uint8Array.from(atob(v.b64),c=>c.charCodeAt(0)).buffer):v;
 window.messages=JSON.parse(await(await fetch('/messages.json')).text(),dec);
 const im=new Image();im.src='/game.png';await im.decode();r5Canvas.getContext('2d').drawImage(im,0,0);
 for(const m of messages)tapChannel.onmessage({data:m});
 step();
};
</script><script src="/source.js"></script>`;
let source, browser;
const server=createServer((req,res)=>{
 const name=new URL(req.url,'http://x').pathname;
 const files={'/messages.json':'artifacts/hw60/offline/messages.json','/game.png':'artifacts/hw60/offline/game.png'};
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.png')?'image/png':name.endsWith('.json')?'application/json':'text/html');
 if(name==='/')res.end(html);else if(name==='/source.js')res.end(fs.readFileSync(source));else if(files[name])res.end(fs.readFileSync(files[name]));else res.writeHead(404).end();
});
const report={errors:[],variants:[]};
try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 for(const [label,file] of [['baseline','tools/hw60/src/hw60.js'],['candidate','tools/hw60/codex/hw60.js']]){
  source=file;
  const page=await browser.newPage({viewport:{width:1280,height:720}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(()=>load());
  for(const ms of [0,100,200]){
   await page.evaluate(ms=>{testNow=1000+ms;step();},ms);
   await page.screenshot({path:out+`/${label}-${ms}.png`});
  }
  await page.evaluate(()=>{testNow=1000;step();});
  const state=await page.evaluate(()=>JSON.parse(JSON.stringify(hw60)));
  const cadence=label==='candidate'?await page.evaluate(()=>{
   const T=19024.06883239746, m=structuredClone(messages.at(-1));
   const counts=[];
   for(const hz of [60,100,120]){
    const begin=hw60.shown; let sentAt=-Infinity;
    for(let i=0;i<=hz;i++){
     testNow=10000+1000*i/hz;
     if(testNow-sentAt>30){sentAt=testNow;m.draws.find(d=>d.vs==='80708BD1B82638B0').vk[7]=(T+testNow-10000)/1000;tapChannel.onmessage({data:m});}
     gh3Song.clock=()=>T+testNow-10000;step();
    }
    counts.push({rafHz:hz,draws:hw60.shown-begin});
   }
   // Frames keep arriving but the gameplay clock is frozen: don't drift.
   testNow=14000;gh3Song.clock=()=>T;step();
   testNow=15000;m.draws.find(d=>d.vs==='80708BD1B82638B0').vk[7]=T/1000;tapChannel.onmessage({data:m});step();
   return {counts,frozenDeltaMs:hw60.visualTimeMs-hw60.sourceTimeMs};
  }):null;
  if(cadence){assert.ok(cadence.counts.every(x=>x.draws>=59&&x.draws<=61),JSON.stringify(cadence));assert.equal(cadence.frozenDeltaMs,0);}
  report.variants.push({label,state,cadence});
  await page.evaluate(()=>{hw60.setEnabled(false);step();});
  await page.screenshot({path:out+`/${label}-off.png`});
  await page.close();
 }
 assert.equal(report.errors.length,0);
 assert.ok(report.variants.every(v=>v.state.errors===0));
 report.ok=true;
}finally{
 await browser?.close();await new Promise(r=>server.close(r));
 if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex hw60 replay\nFin: ${new Date().toISOString()}\n`);
 fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));
}
