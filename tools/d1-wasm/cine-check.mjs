// Claude 2026-10-12: copia de tools/r5-bink-video/run.mjs (Codex) para la copia integrada artifacts/d1-wasm/cine/demo.
// Arranque SIN saltear: logos + intro visibles, audio (d4.r6Audio) por muestra. Turno a nombre de Claude.
// Uso: node tools/d1-wasm/cine-check.mjs <etiqueta>   (CINE_SECONDS=110, GH3_QUERY='manual=1', DEMO_ROOT, PRESS_AFTER=65)
import fs from 'node:fs';import crypto from 'node:crypto';
import {chromium} from 'playwright';import {createDemandServer} from '../local-loader/demand-server.mjs';
const label=process.argv[2]||'cine',demo=process.env.DEMO_ROOT||'artifacts/d1-wasm/cine/demo',out='artifacts/d1-wasm/cine/runs/'+label;
fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='claude-cine-'+crypto.randomBytes(8).toString('hex');
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado; no se ejecutó GH3.');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Claude\nReserva: ${token}\nQué: cinemáticas + audio, copia integrada d1-wasm/cine\nDesde: ${new Date().toISOString()}\nFin: estimado 4 min\n`);
let server,browser;const report={label,demo,samples:[],errors:[],console:[]};
const write=()=>fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
try{
 const delivery=JSON.parse(fs.readFileSync('artifacts/unified-game/build-result.json'));
 if(!process.env.BASE_URL){server=createDemandServer({root:demo,staticNames:[...delivery.staticNames,...(process.env.EXTRA_STATIC||'').split(',').filter(Boolean)]});await new Promise(r=>server.listen(0,'127.0.0.1',r));}
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.console.push(m.text().slice(0,300));});
 if(process.env.CINE_WAV)await page.addInitScript(()=>{let inner;Object.defineProperty(window,'r6StartAudio',{configurable:true,get:()=>(sab,ptr)=>{const w=new Uint32Array(sab,ptr,1),cap=new Uint32Array(sab,ptr+4,1)[0],d=new Float32Array(sab,ptr+8,cap*2);const c2=window.r6cap={chunks:[],total:0,lost:0,r:Atomics.load(w,0)};setInterval(()=>{const now=Atomics.load(w,0);let n=(now-c2.r)>>>0;if(n>cap-4096){c2.lost+=n;c2.r=now;return;}const c=new Int16Array(n*2);for(let i=0;i<n;i++){const s=((c2.r+i)%cap)*2;c[i*2]=d[s]*32767;c[i*2+1]=d[s+1]*32767;}c2.r=now;c2.total+=n;c2.chunks.push(c);},100);return inner(sab,ptr);},set:f=>{inner=f;}});});
 report.query=process.env.GH3_QUERY??'manual=1';
 report.base=process.env.BASE_URL||null;await page.goto(`${process.env.BASE_URL||'http://127.0.0.1:'+server.address().port}/gh3/?${report.query}`);
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled,null,{timeout:30000});await page.click('#loaderPlay');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,null,{timeout:240000});
 const t0=Date.now();let presses=0;const after=Number(process.env.PRESS_AFTER||65)*1000;
 while(Date.now()-t0<Number(process.env.CINE_SECONDS||110)*1000){
  if(!fs.readFileSync(turn,'utf8').includes('Reserva: '+token))throw Error('Reserva cambió');
  await page.waitForTimeout(5000);
  const s=await page.evaluate(()=>({diagErrors:(window.gh3Diag?.errors||[]).length,pairs:Object.keys(d4.songRenderer?.last?.pairs||{}),skips:d4.songRenderer?.last?.skips,fatal:d4.songRenderer?.fatal,presented:d4.songPresented||0,files:d4.log.filter(l=>/\.bik/i.test(l)).length,lastBik:d4.log.filter(l=>/\.bik/i.test(l)).at(-1),audio:d4.r6Audio&&{underruns:d4.r6Audio.underruns,silentBlocks:d4.r6Audio.silentBlocks,skips:d4.r6Audio.skips,lag:d4.r6Audio.lag,ratio:d4.r6Audio.productionRatio,state:d4.r6Audio.ctxState},error:gh3Loader.error,exit:d4.exit}));s.ms=Date.now()-t0;
  s.video=s.pairs.some(p=>/^(CAC1FD2246E486B4|57F6448DAC5BEB74)\//.test(p));report.samples.push(s);
  await page.locator('#r5Canvas').screenshot({path:out+`/frame-${Math.round(s.ms/1000)}.png`}).catch(()=>{});
  if(process.env.APPLY_AT&&!report.applied&&s.ms>Number(process.env.APPLY_AT)*1000){report.applied={at:s.ms};page.once('dialog',d=>d.accept());await page.evaluate(()=>{const q=document.getElementById('gh3Quality');q.value=q.value==='muy'?'liviano':'muy';q.onchange();document.getElementById('gh3GfxApply').onclick();});await page.waitForNavigation({timeout:20000}).catch(e=>report.applied.navError=e.message);await page.waitForFunction(()=>window.gh3Loader&&(!document.getElementById('loaderPlay').disabled||gh3Loader.ready||gh3Loader.error),null,{timeout:60000});report.applied.autostart=await page.evaluate(()=>!!(gh3Loader.ready||window.g1worker));if(!report.applied.autostart){await page.click('#loaderPlay');}await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,null,{timeout:240000});report.applied.quality=await page.evaluate(()=>window.gh3Quality);report.applied.diag=await page.evaluate(()=>gh3Diag.events.slice(-12).map(e=>e.what));console.log('aplicado',JSON.stringify(report.applied));}
  if(s.ms>after&&presses<4&&s.ms>after+presses*20000){await page.keyboard.press('Enter',{delay:150});presses++;}
  write();console.log(JSON.stringify({ms:s.ms,video:s.video,presented:s.presented,bik:s.lastBik?.slice(-60),audio:s.audio,fatal:s.fatal}));
 }
 fs.writeFileSync(out+'/runtime.log',(await page.evaluate(()=>d4.log)).join('\n'));
 if(process.env.CINE_WAV){const n=await page.evaluate(()=>{const a=new Int16Array(r6cap.total*2);let o=0;for(const c of r6cap.chunks){a.set(c,o);o+=c.length;}window.r6all=new Uint8Array(a.buffer);return r6all.length;});const parts=[];for(let o=0;o<n;o+=4<<20)parts.push(Buffer.from(await page.evaluate(o=>{let s='';const a=r6all.subarray(o,o+(4<<20));for(let i=0;i<a.length;i+=32768)s+=String.fromCharCode(...a.subarray(i,i+32768));return btoa(s);},o),'base64'));const pcm=Buffer.concat(parts),h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(2,22);h.writeUInt32LE(48000,24);h.writeUInt32LE(192000,28);h.writeUInt16LE(4,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);fs.writeFileSync(out+'/audio.wav',Buffer.concat([h,pcm]));report.wav=await page.evaluate(()=>({total:r6cap.total,lost:r6cap.lost}));}
 report.bik=[...new Set((await page.evaluate(()=>d4.log)).map(l=>(l.match(/[\w]+\.bik/i)||[])[0]).filter(Boolean))];
 report.ok=report.errors.length===0&&!report.samples.some(s=>s.fatal||s.error||s.exit!==null)&&report.samples.some(s=>s.video);
 if(!report.ok)process.exitCode=1;
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes('Reserva: '+token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Claude\nQué: cinemáticas ${label}, procesos propios cerrados\nFin: ${new Date().toISOString()}\n`);write();}
console.log(JSON.stringify({out,ok:report.ok,bik:report.bik,error:report.error}));
