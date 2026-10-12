// Integration check: original R5L producer -> CP renderer -> visible page canvas.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {menuServer} from './serve-runtime.mjs';
const seconds=Number(process.argv[2]||200),label=process.argv[3]||'edge-live-1';
if(!/^[a-zA-Z0-9_-]+$/.test(label)||!Number.isFinite(seconds)||seconds<5)throw Error('Invalid run arguments');
const out=`artifacts/r5-live-menu/${label}`;fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`codex-r5l-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Test turn occupied');
fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: conexión R5L al canvas, Edge oculto ${seconds}s\nDesde: ${new Date().toISOString()}\nFin: estimado ${seconds+90}s\n`);
if(!fs.readFileSync(turn,'utf8').includes(`Reserva: ${token}`))throw Error('Test turn reservation changed');
const report={scope:'Original GH3 in WebAssembly, partial supported menu layers in live canvas',seconds,label,pageErrors:[],consoleErrors:[],samples:[],shots:[]};
let browser,server,page,timer;
try{
 server=await menuServer();browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
 page=await browser.newPage({viewport:{width:1400,height:1150}});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 page.on('pageerror',e=>report.pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.consoleErrors.push(m.text());});
 const base=`http://127.0.0.1:${server.address().port}`;
 assert.equal((await page.request.get(base+'/DATA/default.xex')).status(),404);
 await page.goto(base+'/?press=150:start,175:start&r3acheck=1');
 await page.setInputFiles('#dir','D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
 await page.fill('#secs',String(seconds));await page.click('#go');
 let sampling=false;
 timer=setInterval(async()=>{
  if(sampling)return;sampling=true;
  try{
   const s=await page.evaluate(()=>({t:(performance.now()-r5Menu.started)/1000,frames:r5Menu.frames,exit:r5Menu.exit,report:r5Menu.report,last:r5Menu.last,errors:r5Menu.errors}));
   report.samples.push(s);
   fs.writeFileSync(`${out}/progress.json`,JSON.stringify(s,null,2));
   if(s.errors.length||s.report?.fatal)return;
   const previous=report.shots.at(-1);
   if(s.frames>0&&(!previous||(s.t>178&&previous.t<178)||(s.t>190&&previous.t<190))){
    const pixels=await page.evaluate(()=>{
     const c=new OffscreenCanvas(1280,720),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(document.getElementById('menuCanvas'),0,0);
     const rgba=ctx.getImageData(0,0,1280,720).data;let lit=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]||rgba[i+1]||rgba[i+2])lit++;return lit;
    });
    const file=`canvas-${report.shots.length}.png`;await page.locator('#menuCanvas').screenshot({path:`${out}/${file}`});
    report.shots.push({file,t:s.t,frames:s.frames,sequence:s.last.sequence,accepted:s.last.accepted,litPixels:pixels});
   }
  }catch(e){report.samplingError=String(e);}finally{sampling=false;}
 },1000);
 await page.waitForFunction(()=>r5Menu.exit!==null||r5Menu.errors.length>0,null,{timeout:(seconds+120)*1000});
 clearInterval(timer);timer=null;
 const state=await page.evaluate(()=>({...r5Menu}));
 fs.writeFileSync(`${out}/runtime.log`,state.log.join('\n'));delete state.log;report.state=state;
 await page.locator('#menuCanvas').screenshot({path:`${out}/final.png`});
 await page.screenshot({path:`${out}/page.png`});
 assert.equal(state.exit,0,'Runtime did not exit successfully');
 assert.deepEqual(state.errors,[]);assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.consoleErrors,[]);
 assert(state.frames>2,'No live canvas frames');assert(state.report.ready,'Consumer not initialized');
 assert(state.report.maxAccepted>=12,'Expected 12 supported original menu draws');
 assert(state.last.gpu.draws>=12);assert.equal(state.last.gpu.readbacks,0);
 assert(state.report.last.unsupportedDraws>0);assert(state.report.last.unsupportedCopies>0);
 assert(report.samples.some(s=>s.report?.last?.accepted===0&&s.frames>0),'No persistence through unsupported frames observed');
 assert(report.shots.some(s=>s.t>178),'No supported canvas after the second START');
 assert(report.shots.some(s=>s.t>178&&s.litPixels>1000),'Canvas remained black after START');
 report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{
 if(timer)clearInterval(timer);await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(fs.readFileSync(turn,'utf8').includes(`Reserva: ${token}`))fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Codex\nQué: conexión R5L ${label} terminada\nFin: ${new Date().toISOString()}\n`);
 fs.writeFileSync(`${out}/verification.json`,JSON.stringify(report,null,2));
}
console.log(JSON.stringify({ok:report.ok,frames:report.state?.frames,maxAccepted:report.state?.report?.maxAccepted,exit:report.state?.exit,error:report.error,out}));
