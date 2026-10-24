// Claude 2026-10-12: copia de tools/local-loader/song-game-check.mjs (Codex). Cambio: el reinicio del reloj al arrancar la canción (resets=1 en la 1ª muestra, normal) no cuenta como falla; solo reinicios posteriores.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createLoaderServer} from '../local-loader/server.mjs';
import {navigateFirstTier} from '../local-loader/song-navigation.mjs';
import {installRobot} from '../r5-live-song/install-robot.mjs';
import {FIRST_FOUR} from '../local-loader/songs.mjs';
import {navigateQuick} from './quick-navigation.mjs';
const song=process.argv[2]||'talkdirtytome',full=process.argv.includes('--full'),wait=process.argv.includes('--wait'),quick=process.argv.includes('--quick');
// Claude: latencia simulada en /local-chunk/ (LAT_MS por pedido, BW_KBPS = KB/s); 0 = sin simular.
const LAT=Number(process.env.LAT_MS||0),BW=Number(process.env.BW_KBPS||0);
if(!FIRST_FOUR.includes(song))throw Error('Only first-tier routes have been prepared for automatic tests.');
const root=path.resolve('artifacts/all-songs'),out=path.join(root,'runs',song+'-'+Date.now());fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`codex-songs-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
const nap=ms=>new Promise(r=>setTimeout(r,ms));let reserved=false,server,browser;
const report={song,full,quick,latMs:LAT,bwKBps:BW,stageEvents:[],cacheEvents:[],started:new Date().toISOString(),pageErrors:[],steps:[],samples:[]};
const write=()=>fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
const ownTurn=()=>fs.readFileSync(turn,'utf8').includes('Reserva: '+token);
try{
 const since=Date.now();let previous;
 while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE')){
  const text=fs.readFileSync(turn,'utf8');report.waitingFor=text;write();
  if(text!==previous){console.log(JSON.stringify({waiting:true,song,out,turn:text}));previous=text;}
  if(!wait||Date.now()-since>30*60000)throw Error('Turno de Claude ocupado; no se ejecutó el juego.');await nap(10000);
 }
 fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: otro tema original: ${song}, perfil aislado\nDesde: ${new Date().toISOString()}\nFin: estimado 15 min\n`);
 reserved=true;if(!ownTurn())throw Error('No se pudo conservar la reserva.');delete report.waitingFor;
 const m=JSON.parse(fs.readFileSync(root+'/catalog.json')),assets=JSON.parse(fs.readFileSync(root+'/assets.json')),config=JSON.parse(fs.readFileSync(root+'/server-config.json'));
 const cc={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),cc);
 const chart=cc.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(path.join(config.game,`DATA/COMPRESSED/SONGS/${song}_song.pak.xen`)))),song,'medium');
 report.notes=chart.notes.length;report.lastNoteMs=chart.notes.at(-1).t+chart.notes.at(-1).len;
 server=createLoaderServer({root:root+'/demo',game:config.game,catalog:m,assets});if(LAT||BW){const [h]=server.listeners('request');server.removeAllListeners('request');server.on('request',(req,res)=>{if(!req.url.startsWith('/local-chunk/'))return h(req,res);const end=res.end.bind(res),parts=[];res.write=(c)=>{parts.push(Buffer.from(c));return true;};res.end=(c)=>{if(c&&typeof c!=='function')parts.push(Buffer.from(c));const b=Buffer.concat(parts);setTimeout(()=>end(b),LAT+(BW?b.length/BW:0));return res;};h(req,res);});}await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launchPersistentContext(out+'/edge-profile',{channel:'msedge',headless:true,viewport:{width:1280,height:900}});
 const page=browser.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));
 report.openedFiles=[];
 report.openedAt=[];const t0=Date.now();report.t0=t0;await page.exposeFunction('songTestFileOpened',line=>{report.openedFiles.push(line);report.openedAt.push(Date.now()-t0);});await page.addInitScript({path:'artifacts/d1-wasm/carga/gh3-stage.js'});await page.exposeFunction('songTestStage',d=>{report.stageEvents.push({...d,ms:Date.now()-t0});console.log('etapa',d.stage,d.song,Date.now()-t0);});await page.exposeFunction('songTestCache',d=>{report.cacheEvents.push({...d,ms:Date.now()-t0});});await page.addInitScript(()=>{addEventListener('gh3stage',e=>window.songTestStage(e.detail).catch(()=>{}));});
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1Mem'||e.data?.type==='g1eInput')window.g1mem={sab:e.data.sab,seg:e.data.seg};if(e.data?.type==='log'&&/\[g1-file\]/.test(e.data.text))window.songTestFileOpened(e.data.text).catch(()=>{});if(e.data?.type==='localCache')window.songTestCache({misses:e.data.misses,path:e.data.path,bytes:e.data.bytes,fatal:e.data.fatal,error:e.data.error}).catch(()=>{});});return w;};});
 await page.goto(`http://127.0.0.1:${server.address().port}/?manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url`);
 await page.waitForFunction(()=>!document.getElementById('loaderPrepare').disabled||gh3Loader.error,{},{timeout:30000});
 await page.selectOption('#loaderSongs',song);await page.click('#loaderPrepare');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:240000});assert.equal(await page.evaluate(()=>gh3Loader.error),null);
 // All navigation is controlled below, including Slow Ride's baseline case.
 await page.evaluate(()=>{document.getElementById('goSong').onclick=()=>{};});
 await page.click('#loaderPlay');await installRobot(page,chart);
 const status=async()=>page.evaluate(()=>({live:!!window.g1live,menu:!!window.navSeen?.menu,careerIntro:d4.log.some(l=>/singleplayer_01\.bik/i.test(l)),song:window.songPak,clock:gh3Song.clock?.(),error:gh3Loader.error||d4.songRenderer?.fatal||(d4.exit!==null?'Game exited '+d4.exit:null)}));
 let latest=await status();
 const update=async()=>{if(!ownTurn())throw Error('La reserva de pruebas cambió; deteniendo esta corrida.');latest=await status();return latest;};
 const tap=async button=>{
  const keys={start:'Enter',a:'Digit1',down:'ArrowDown'};await page.keyboard.down(keys[button]);await nap(150);await page.keyboard.up(keys[button]);await update();
 };
 await (quick?navigateQuick:navigateFirstTier)({shot:name=>page.locator('#r5Canvas').screenshot({path:out+'/nav-'+name+'.png',timeout:3000}).catch(()=>{}),stage:()=>report.stageEvents,song,tap,status:()=>latest,sleep:async ms=>{await nap(ms);await update();},clearSchedule:()=>page.evaluate(()=>g1worker.postMessage({type:'pressClear'})),onStep:label=>{report.steps.push({at:new Date().toISOString(),label,...latest});write();console.log(label);}});
 await page.locator('#r5Canvas').screenshot({path:out+'/song-start.png'});
 const target=full?report.lastNoteMs+500:45000,deadline=Date.now()+(full?report.lastNoteMs*2+180000:180000);
 while(Date.now()<deadline){await nap(2000);await update();
  const s=await page.evaluate(()=>({song:window.songPak,clock:gh3Song.clock?.(),presented:d4.songPresented||0,renderer:d4.songRenderer,audio:d4.r6Audio,bot:window.botStats,loaderError:gh3Loader.error,exit:d4.exit}));
  report.samples.push(s);write();{const p=report.samples.at(-2);if(p&&p.clock===s.clock&&!report.stallShot){report.stallShot=true;await page.locator('#r5Canvas').screenshot({path:out+'/stall-'+Math.round(s.clock)+'.png'}).catch(()=>{});}const q=report.samples.at(-4);if(q&&q.clock===s.clock&&!report.stallShot2){report.stallShot2=true;await page.locator('#r5Canvas').screenshot({path:out+'/stall2-'+Math.round(s.clock)+'.png'}).catch(()=>{});}}if(s.loaderError||s.renderer?.fatal||s.exit!==null)throw Error('Fallo del juego: '+JSON.stringify(s));report.resets0??=s.bot?.resets||0;if((s.bot?.resets||0)>report.resets0)throw Error('La canción se reinició durante la prueba.');if(s.clock>=target)break;
 }
 report.stepsAt=report.steps.map(x=>Date.parse(x.at)-t0);report.final=report.samples.at(-1);assert.equal(report.final.song,song);assert.ok(report.final.clock>=target,'La canción no avanzó hasta el objetivo.');assert.ok(report.final.presented>100);assert.equal(report.pageErrors.length,0);
 report.audioSignal=await page.evaluate(async()=>{const a=r6ctx.createAnalyser();a.fftSize=2048;r6node.connect(a);await new Promise(r=>setTimeout(r,100));const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);r6node.disconnect(a);return {max:Math.max(...b.map(Math.abs)),rms:Math.sqrt(b.reduce((s,v)=>s+v*v,0)/b.length)};});
 assert.ok(report.audioSignal.max>0,'No se detectó sonido.');
 report.log=await page.evaluate(()=>d4.log);fs.writeFileSync(out+'/runtime.log',report.log.join('\n'));delete report.log;
 await page.locator('#r5Canvas').screenshot({path:out+'/song-final.png'});report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;try{const pg=browser?.pages()[0];if(pg){const L=await pg.evaluate(()=>d4.log);fs.writeFileSync(out+'/runtime.log',L.join(String.fromCharCode(10)));}}catch{}}
finally{report.stepsAt=report.steps.map(x=>Date.parse(x.at)-(report.t0||Date.parse(report.started)));
 await browser?.close();if(server)await new Promise(r=>server.close(r));
 if(reserved&&ownTurn())fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Codex\nQué: otros temas, ${song}; ${report.ok?'prueba terminada':'resultado pendiente/fallo'}\nFin: ${new Date().toISOString()}\n`);
 write();console.log(JSON.stringify({out,song,ok:report.ok,error:report.error,final:report.final&&{clock:report.final.clock,presented:report.final.presented,strums:report.final.bot?.strums},audio:report.audioSignal}));
}
