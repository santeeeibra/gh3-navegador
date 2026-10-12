import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {installRobot} from '../r5-live-song/install-robot.mjs';
requireTurn();
const out='artifacts/mobile-private/check-'+Date.now();fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),report={pageErrors:[],privateNetwork:[],checks:[]};
const data=Buffer.from('LOCAL ONLY'),html=Buffer.from('<!doctype html><title>Private fixture</title><script>window.ready=true;window.w=new Worker("fixture.js");w.onmessage=e=>window.workerResult=e.data;</script>'),worker=Buffer.from('onmessage=()=>{};fetch("/local-manifest.json").then(r=>r.json()).then(m=>fetch("/local-chunk/"+m.version+"/0/0")).then(r=>r.text()).then(v=>postMessage(v));'),wasm=Buffer.from([0,97,115,109,1,0,0,0]);
const bodies=[html,worker,wasm,data],version='a'.repeat(64);let offset=0;
const chunks=bodies.map(b=>{const c={hash:sha(b),size:b.length,offset};offset+=b.length;return c;});
const header={format:'gh3-mobile-private-1',static:[['index.html','text/html',0],['fixture.js','text/javascript',1],['gh3-web.wasm','application/wasm',2]].map(([name,type,i])=>({url:'/iphone/private/'+name,type,size:bodies[i].length,parts:[chunks[i].hash]})),chunks,catalog:{format:1,chunkSize:2*1048576,version,files:[{id:0,path:'DATA/test.bin',size:data.length,chunks:[{hash:chunks[3].hash,offset:0,size:data.length}]}],packages:{base:{files:[0]},slowride:{files:[]}}}};
function fixture(name,h=header,corrupt=false){const bytes=Buffer.from(JSON.stringify(h)),pre=Buffer.alloc(12);pre.write('GH3MOB01');pre.writeUInt32LE(bytes.length,8);const b=Buffer.concat([pre,bytes,...bodies]);if(corrupt)b[b.length-1]^=1;const f=out+'/'+name;fs.writeFileSync(f,b);return f;}
const good=fixture('fixture.gh3mobile'),bad=fixture('damaged.gh3mobile',header,true),invalid=fixture('path.gh3mobile',{...header,static:[...header.static,{url:'/outside.js',type:'text/javascript',size:worker.length,parts:[chunks[1].hash]}]});
const server=http.createServer((req,res)=>{
 for(const [k,v] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);
 const u=new URL(req.url,'http://127.0.0.1'),name=u.pathname==='/iphone/'?'index.html':u.pathname.slice('/iphone/'.length);
 if(u.pathname.startsWith('/iphone/private/')||u.pathname.startsWith('/local-'))report.privateNetwork.push(u.pathname);
 if(!['index.html','preparar.html','private-store.js','private-import.js','private-sw.js'].includes(name)||!u.pathname.startsWith('/iphone/')){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',name.endsWith('.html')?'text/html':'text/javascript');res.end(fs.readFileSync('tools/iphone-probe/'+name));
});
await new Promise(r=>server.listen(5483,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:5483/iphone/preparar.html');await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 async function importFile(file){await page.locator('#file').setInputFiles(file);await page.click('#import');await page.waitForFunction(()=>!document.getElementById('pause').disabled===false);return page.locator('#status').innerText();}
 assert.match(await importFile(bad),/dañada/);report.checks.push('corrupt-part-rejected');
 assert.match(await importFile(invalid),/inválido/);report.checks.push('out-of-scope-path-rejected');
 assert.match(await importFile(good),/Paquete listo/);report.checks.push('import-verified');
 await page.goto('http://127.0.0.1:5483/iphone/private/index.html');await page.waitForFunction(()=>window.workerResult==='LOCAL ONLY');assert.equal(await page.evaluate(()=>crossOriginIsolated),true);report.checks.push('isolated-navigation-and-worker-local-fetch');
 const missing=await page.evaluate(async()=>{const r=await fetch('/iphone/private/nope.js');return r.status;});assert.equal(missing,404);report.checks.push('missing-private-file-no-network');
 await page.goto('http://127.0.0.1:5483/iphone/preparar.html');await page.waitForSelector('#play:not([hidden])');report.checks.push('reopen-package');
 assert.match(await importFile(good),/Paquete listo/);report.checks.push('repeat-import-reuses-parts');
 // A real Worker loading the real runtime through the service worker, not a route mock.
 if(process.argv.includes('--game')){
  const file=path.resolve('artifacts/mobile-private/GH3-Slow-Ride-privado.gh3mobile');assert.match(await importFile(file),/Paquete listo/);report.checks.push('real-package-import');
  await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1Mem'||e.data?.type==='g1eInput')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
  await page.goto('http://127.0.0.1:5483/iphone/private/index.html');await page.waitForFunction(()=>window.gh3Loader?.ready||window.gh3Loader?.error||!document.getElementById('loaderPrepare')?.disabled,{},{timeout:240000});
  const ready=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,status:document.getElementById('loaderStatus').textContent}));
  if(!ready.ready&&!ready.error){await page.click('#loaderPrepare');await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:240000});}
  else if(!ready.ready)throw Error(JSON.stringify(ready));
  // The first import hasn't prepared chunks in the runtime UI yet.
  await page.evaluate(()=>{document.getElementById('secs').value='180';});
  await page.click('#loaderPlay');
  const gameConfig=JSON.parse(fs.readFileSync('artifacts/local-loader/server-config.json'));
  const chartContext={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),chartContext);
  const chart=chartContext.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(path.join(gameConfig.game,'DATA/COMPRESSED/SONGS/slowride_song.pak.xen')))),'slowride','medium');
  await installRobot(page,chart);
  await page.waitForFunction(()=>window.d4?.songPresented>10||window.gh3Loader?.error||window.d4?.songRenderer?.fatal,{},{timeout:240000});
  report.game=await page.evaluate(()=>({presented:d4.songPresented,renderer:d4.songRenderer,loaderError:gh3Loader.error,log:d4.log.slice(-35),audio:d4.r6Audio,save:window.gh3Save}));
  assert.ok(report.game.presented>10,JSON.stringify(report.game));assert.ok(!report.game.renderer?.fatal);assert.equal(report.game.loaderError,null);report.checks.push('real-runtime-private-first-image');
  report.samples=[];report.starDrawFrames=0;
  const start=Date.now();while(Date.now()-start<150000){await page.waitForTimeout(500);const s=await page.evaluate(()=>({clock:gh3Song.clock?.(),presented:d4.songPresented,star:Object.keys(d4.songRenderer?.last?.pairs||{}).some(k=>k.startsWith('19815E13AC0DCC92/')),fatal:d4.songRenderer?.fatal,error:gh3Loader.error,audio:d4.r6Audio,exit:d4.exit}));if(s.star)report.starDrawFrames++;if(report.samples.length===0||s.clock-(report.samples.at(-1)?.clock||0)>5000)report.samples.push(s);if(s.fatal||s.error||s.exit!==null)throw Error(JSON.stringify(s));if(s.clock>40000)break;}
  report.final=await page.evaluate(()=>({clock:gh3Song.clock?.(),presented:d4.songPresented,conversion:d4.songRenderer?.gpu?.conversion,rendererFatal:d4.songRenderer?.fatal}));
  assert.ok(report.final.clock>40000);assert.ok(report.starDrawFrames>0,'No se observó el shader de notas estrella.');assert.equal(report.final.conversion?.mode,'rgba8-no-bc');assert.ok(report.final.conversion.textures>0);report.checks.push('real-star-notes-song-clock-and-rgba-without-bc');
  await page.screenshot({path:out+'/private-game.png',fullPage:true});
 }
 assert.deepEqual(report.privateNetwork,[]);assert.deepEqual(report.pageErrors,[]);
 await page.goto('http://127.0.0.1:5483/iphone/');await page.click('#textures');await page.waitForFunction(()=>!document.getElementById('textures').disabled,{},{timeout:40000});report.textures=await page.locator('#o').innerText();assert.match(report.textures,/BC1\/BC2\/BC3\/BC5: creación y carga correctas/);report.checks.push('real-bc-texture-upload');
 report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,...report,game:report.game&&{presented:report.game.presented,loaderError:report.game.loaderError}}));
