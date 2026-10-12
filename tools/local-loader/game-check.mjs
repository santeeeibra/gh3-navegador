import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
import {createLoaderServer} from './server.mjs';
import {installRobot} from '../r5-live-song/install-robot.mjs';
requireTurn();
const duration=Number(process.argv[2]||140),root=path.resolve('artifacts/local-loader');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'catalog.json'))),assets=JSON.parse(fs.readFileSync(path.join(root,'assets.json'))),config=JSON.parse(fs.readFileSync(path.join(root,'server-config.json')));
const out=path.join(root,'game-'+Date.now());fs.mkdirSync(out,{recursive:true});
const report={pageErrors:[],assetRequests:0,samples:[]};let ctx;
const server=createLoaderServer({root:path.join(root,'demo'),game:config.game,catalog,assets,onRequest:p=>{if(p.startsWith('/local-chunk/'))report.assetRequests++;}});
await new Promise(r=>server.listen(5441,'127.0.0.1',r));
try{
  const chartCtx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),chartCtx);
  const chart=chartCtx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(path.join(config.game,'DATA/COMPRESSED/SONGS/slowride_song.pak.xen')))),'slowride','medium');
  ctx=await chromium.launchPersistentContext(path.join(root,'prepare-check/edge-profile'),{channel:'msedge',headless:true,viewport:{width:1400,height:1000}});
  const page=ctx.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1Mem'||e.data?.type==='g1eInput')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
  await page.goto('http://127.0.0.1:5441/');
  await page.waitForFunction(()=>window.gh3Loader?.ready||window.gh3Loader?.error,{},{timeout:240000});
  report.preparation=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,stats:gh3Loader.stats}));assert.equal(report.preparation.ready,true);assert.equal(report.preparation.error,null);
  await page.evaluate(d=>{document.getElementById('secs').value=String(d+60);},duration);
  await page.click('#loaderPlay');await installRobot(page,chart);const start=Date.now();
  while(Date.now()-start<duration*1000){
    await page.waitForTimeout(2000);
    const sample=await page.evaluate(()=>({clock:gh3Song.clock?.(),song:window.songPak,presented:d4.songPresented||0,renderer:d4.songRenderer,audio:d4.r6Audio,exit:d4.exit,loader:{misses:gh3Loader.misses,error:gh3Loader.error,phase:gh3Loader.phase,engine:gh3Loader.engine,overlay:!document.getElementById('gameLoading').hidden,title:document.getElementById('loadTitle').textContent},bot:window.botStats&&{strums:botStats.strums,clockMax:botStats.clockMax},save:window.gh3Save}));
    report.samples.push({seconds:(Date.now()-start)/1000,...sample});fs.writeFileSync(path.join(out,'progress.json'),JSON.stringify(report.samples.at(-1)));
    if(sample.presented&&sample.clock>10000&&!report.picture){await page.locator('#r5Canvas').screenshot({path:path.join(out,'song.png')});report.picture='song.png';}
    if(sample.loader.overlay&&!report.loadingPicture){await page.locator('#r5Box').screenshot({path:path.join(out,'loading.png')});report.loadingPicture='loading.png';}
    if(sample.exit!==null||sample.loader.error||sample.renderer?.fatal)break;
  }
  report.final=await page.evaluate(()=>({clock:gh3Song.clock?.(),song:window.songPak,chart:gh3Song.chart?.name,presented:d4.songPresented||0,renderer:d4.songRenderer,audio:d4.r6Audio,exit:d4.exit,loader:{misses:gh3Loader.misses,error:gh3Loader.error},input:gh3Input.stats,save:window.gh3Save,bot:window.botStats,log:d4.log}));
  await page.screenshot({path:path.join(out,'window.png'),fullPage:true});
  report.loading=await page.evaluate(()=>({phase:gh3Loader.phase,engine:gh3Loader.engine,overlay:!document.getElementById('gameLoading').hidden,guideMode:document.getElementById('guideMode').textContent,guideParent:document.getElementById('controllerGuide').parentElement.id}));
  fs.writeFileSync(path.join(out,'runtime.log'),report.final.log.join('\n'));delete report.final.log;
  const audio=await page.evaluate(async()=>{if(!r6node)return null;const a=r6ctx.createAnalyser();a.fftSize=2048;r6node.connect(a);await new Promise(r=>setTimeout(r,100));const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);r6node.disconnect(a);return {rms:Math.sqrt(b.reduce((s,v)=>s+v*v,0)/b.length),max:Math.max(...b.map(Math.abs))};});report.audioSignal=audio;
  await page.keyboard.down('a');await page.waitForTimeout(100);report.keyboard=await page.evaluate(()=>gh3Input.stats);await page.keyboard.up('a');
  assert.equal(report.pageErrors.length,0);assert.equal(report.final.exit,null);assert.equal(report.final.loader.error,null);assert.ok(!report.final.renderer?.fatal);assert.ok(report.final.presented>100);assert.equal(report.final.song,'slowride');assert.equal(report.final.chart,'slowride');assert.ok(report.final.clock>30000);assert.ok(audio?.max>0);
  assert.ok(report.loading.engine?.done&&report.loading.engine.loaded===report.loading.engine.total);assert.equal(report.loading.engine.total,fs.statSync(path.join(root,'demo/gh3-web.wasm')).size);assert.equal(report.loading.overlay,false);assert.equal(report.loading.phase,'playing');assert.equal(report.loading.guideMode,'Canción');assert.equal(report.loading.guideParent,'gh3Panel');report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{await ctx?.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,ok:report.ok,error:report.error,preparation:report.preparation,assetRequests:report.assetRequests,final:report.final&&{song:report.final.song,clock:report.final.clock,presented:report.final.presented,loader:report.final.loader,save:report.final.save},audioSignal:report.audioSignal}));
