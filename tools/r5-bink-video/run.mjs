import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {chromium} from 'playwright';import {createDemandServer} from '../local-loader/demand-server.mjs';
const label=process.argv[2]||'baseline',root='artifacts/r5-bink-video',out=root+'/'+label;
fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-bink-'+crypto.randomBytes(8).toString('hex');
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado; no se ejecutó GH3.');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: cinemáticas Bink, copia aislada, sin cambios de audio\nDesde: ${new Date().toISOString()}\nFin: estimado 4 min\n`);
let server,browser;const report={label,captures:[],samples:[],errors:[]};
try{
 const delivery=JSON.parse(fs.readFileSync('artifacts/unified-game/build-result.json'));
 server=createDemandServer({root:root+'/demo',staticNames:[...delivery.staticNames,'r5snap-video-diagnostic.js']});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.exposeFunction('saveVideoCapture',async m=>{
  const dir=out+'/'+m.id;fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(dir+'/frame.r5f',Buffer.from(m.frame,'base64'));
  for(const r of m.resources){fs.writeFileSync(dir+`/${r.phys}-${r.length}.bin`,Buffer.from(r.data,'base64'));delete r.data;}
  delete m.frame;fs.writeFileSync(dir+'/capture.json',JSON.stringify(m,null,2));report.captures.push(m);
 });
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{if(!e.data?.data?.videoCapture)return;const m=e.data.data.videoCapture,b64=b=>{const a=new Uint8Array(b);let s='';for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);};m.frame=b64(m.frame);for(const r of m.resources)r.data=b64(r.data);window.saveVideoCapture(m).catch(console.error);});return w;};});
 const consumer=process.env.VIDEO_CONSUMER||'r5snap-video-diagnostic.js';report.consumer=consumer;
 await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?manual=1&r5lite=0&r5liveconsumer=${consumer}&gfx=url`);
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled,null,{timeout:30000});await page.click('#loaderPlay');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,null,{timeout:240000});
 const t0=Date.now();let presses=0;
 while(Date.now()-t0<Number(process.env.VIDEO_SECONDS||150)*1000){
  if(!fs.readFileSync(turn,'utf8').includes('Reserva: '+token))throw Error('Reserva cambió');
  await page.waitForTimeout(5000);
  const s=await page.evaluate(()=>({renderer:d4.songRenderer,presented:d4.songPresented||0,files:d4.log.filter(l=>/\.bik|memcard.*gh\.png/i.test(l)),error:gh3Loader.error,exit:d4.exit}));s.ms=Date.now()-t0;report.samples.push(s);
  await page.locator('#r5Canvas').screenshot({path:out+`/frame-${Math.round(s.ms/1000)}.png`}).catch(()=>{});
  if(s.ms>65000&&presses<4&&s.ms>65000+presses*20000){await page.keyboard.press('Enter',{delay:150});presses++;}
  fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ms:s.ms,captures:report.captures.length,presented:s.presented,skip:s.renderer?.last?.skips,fatal:s.renderer?.fatal}));
 }
 fs.writeFileSync(out+'/runtime.log',(await page.evaluate(()=>d4.log)).join('\n'));report.ok=report.errors.length===0&&!report.samples.some(s=>s.renderer?.fatal||s.error||s.exit!==null)&&(consumer==='r5snap-video-diagnostic.js'?report.captures.length>0:report.samples.some(s=>Object.keys(s.renderer?.last?.pairs||{}).some(p=>p.startsWith('CAC1FD2246E486B4/'))));
 if(!report.ok)process.exitCode=1;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes('Reserva: '+token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: cinemáticas Bink ${label}, procesos propios cerrados\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,ok:report.ok,captures:report.captures.length,error:report.error}));
