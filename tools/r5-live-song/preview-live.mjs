// Explicitly requested visible Edge preview. Holds only our test reservation.
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {inflateRawSync} from 'node:zlib';
import {chromium} from 'playwright';
import {requireTurn,releaseTurn} from '../gpu-capture/lib.mjs';
import {installRobot} from './install-robot.mjs';
const token=requireTurn(),out='artifacts/r5-songlive/preview';fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock',ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const chart=ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game+'/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))),'slowride','medium');
const log=fs.openSync(out+'/server.log','a'),server=spawn(process.execPath,['tools/r5-live-song/serve-live.mjs','5424'],{windowsHide:true,stdio:['ignore',log,log]});let browser;
const status={url:'http://127.0.0.1:5424/',started:new Date().toISOString(),token,serverPid:server.pid,errors:[]};
try{
 for(let i=0;i<100;i++){try{if((await fetch(status.url)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:false,args:['--start-maximized']});const context=await browser.newContext({viewport:null});const page=await context.newPage();page.on('pageerror',e=>status.errors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);if(a[1]?.name==='gh3-main')window.previewWorkerUrl=new URL(a[0],location.href).href;w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1eInput'||e.data?.type==='g1Mem')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
 await page.goto(status.url+'?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&r5lite=1&cpasync=1&r5liveconsumer=r5snap-song-render.js');
 await page.setInputFiles('#dir',game);await page.fill('#secs','1500');await page.selectOption('#gpu','null');await page.click('#go');await installRobot(page,chart);
 await page.evaluate(()=>{
  const card=document.createElement('div');card.className='card';card.style.margin='12px 0';card.innerHTML='<b>Adelanto en vivo · autopista y notas originales</b><p>Arranca solo en Slow Ride. El robot toca para mostrar la canción; podés tomar los controles.</p><button id="takeControls">Tomar controles</button>';
  document.getElementById('songBox').before(card);document.getElementById('takeControls').onclick=()=>{previewRobot.terminate();clearInterval(previewRobotInterval);const a=new Int32Array(g1live.sab,g1live.ptr,11);Atomics.store(a,1,0);Atomics.store(a,2,0);Atomics.store(a,10,0);Atomics.add(a,0,1);document.getElementById('takeControls').disabled=true;card.querySelector('p').textContent='Ahora tocás vos: mantené A S D F G y rasgueá con ↑ o ↓.';};
 });
 status.pageUrl=page.url();status.workerUrl=await page.evaluate(()=>window.previewWorkerUrl);if(new URL(status.workerUrl).searchParams.get('r5lite')!=='1')throw Error('r5lite=1 not forwarded to game worker');
 await page.click('#goSong');await page.locator('#r5Box').scrollIntoViewIfNeeded().catch(()=>{});status.open=true;fs.writeFileSync(out+'/status.json',JSON.stringify(status,null,2));console.log('Visible Edge started with r5lite=1; navigating to Slow Ride.');
 const start=Date.now();while(browser.isConnected()&&!page.isClosed()){
  await page.waitForTimeout(2000);const s=await page.evaluate(()=>({clockMs:gh3Song.clock?.(),renderer:d4.songRenderer,presented:d4.songPresented,audio:d4.r6Audio,bot:window.botStats?{strums:botStats.strums,max:botStats.clockMax}:null,exit:d4.exit}));
  status.last=s;status.wallS=(Date.now()-start)/1000;fs.writeFileSync(out+'/status.json',JSON.stringify(status,null,2));
  if(s.clockMs>0&&!status.songShown){status.songShown=true;await page.locator('#r5Box').scrollIntoViewIfNeeded();await page.locator('#r5Canvas').screenshot({path:out+'/song.png'});console.log('Original song visible in Edge.');}
  if(s.renderer?.fatal||s.exit!==null)break;
 }
}catch(e){status.errors.push(e.stack);}
finally{status.open=false;status.closed=new Date().toISOString();fs.writeFileSync(out+'/status.json',JSON.stringify(status,null,2));await browser?.close();server.kill();fs.closeSync(log);try{requireTurn(token);releaseTurn(token,'Codex: adelanto visible cerrado');}catch{} }
