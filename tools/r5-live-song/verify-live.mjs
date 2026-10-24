import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
import {installRobot} from './install-robot.mjs';
requireTurn();
const label=process.argv[2]||'edge-1',duration=Number(process.argv[3]||140),port=Number(process.argv[4]||5423);if(!/^[\w-]+$/.test(label))throw Error('Label');
const out='artifacts/r5-songlive/'+label;if(fs.existsSync(out))throw Error('Run exists');fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock',ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const chart=ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game+'/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))),'slowride','medium');
const report={label,pageErrors:[],samples:[],started:new Date().toISOString(),notes:chart.notes.length};let browser;
const stdout=fs.openSync(out+'/server.stdout.log','w'),stderr=fs.openSync(out+'/server.stderr.log','w');
const server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:path.resolve('artifacts/r5-songlive/demo')},windowsHide:true,stdio:['ignore',stdout,stderr]});
try{
 await new Promise((resolve,reject)=>{const start=Date.now();const check=async()=>{try{const r=await fetch('http://127.0.0.1:'+port);if(r.ok)return resolve();}catch{}if(Date.now()-start>10000)return reject(Error('Server timeout'));setTimeout(check,100);};check();});
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();const page=await browser.newPage({viewport:{width:1400,height:1150}});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1eInput'||e.data?.type==='g1Mem')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
 await page.goto('http://127.0.0.1:'+port+'/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&cpasync=1&r5liveconsumer=r5snap-song-render.js');
 await page.setInputFiles('#dir',game);await page.fill('#secs',String(duration+30));await page.selectOption('#gpu','null');await page.click('#go');await installRobot(page,chart);
 await page.click('#goSong');const start=Date.now();let nextImage=0;
 while((Date.now()-start)/1000<duration){
  await page.waitForTimeout(2000);
  const s=await page.evaluate(()=>({clockMs:window.gh3Song.clock?.(),song:window.songPak,exit:d4.exit,renderer:d4.songRenderer,presented:d4.songPresented||0,audio:d4.r6Audio,bot:window.botStats?{strums:botStats.strums,max:botStats.clockMax}:null,input:window.gh3Input?.stats,nav:document.getElementById('navStat').textContent}));
  report.samples.push({wallS:(Date.now()-start)/1000,...s});fs.writeFileSync(out+'/progress.json',JSON.stringify({samples:report.samples.length,last:s}));
  if(s.clockMs>0&&report.songAt===undefined){report.songAt=(Date.now()-start)/1000;console.log('Song clock started at '+report.songAt);}
  if(s.presented&&((s.clockMs>0&&s.clockMs/1000>=nextImage)||!report.menuImage)){const name=s.clockMs>0?'song-'+Math.floor(s.clockMs/1000):'menu';await page.locator('#r5Canvas').screenshot({path:out+'/'+name+'.png'});if(s.clockMs>0)nextImage=s.clockMs/1000+10;else report.menuImage=true;}
  if(s.exit!==null||s.renderer?.fatal)break;
 }
 await page.keyboard.down('a');await page.waitForTimeout(150);report.keyboardHeld=await page.evaluate(()=>window.gh3Input.stats);await page.keyboard.up('a');
 report.final=await page.evaluate(()=>({exit:d4.exit,renderer:d4.songRenderer,presented:d4.songPresented,audio:d4.r6Audio,bot:window.botStats,input:window.gh3Input?.stats,log:d4.log}));fs.writeFileSync(out+'/runtime.log',report.final.log.join('\n'));delete report.final.log;
 report.audioSignal=await page.evaluate(async()=>{if(!window.r6node)return null;const a=r6ctx.createAnalyser();a.fftSize=2048;r6node.connect(a);await new Promise(r=>setTimeout(r,100));const b=new Float32Array(a.fftSize);a.getFloatTimeDomainData(b);r6node.disconnect(a);return {rms:Math.sqrt(b.reduce((n,x)=>n+x*x,0)/b.length),max:Math.max(...b.map(Math.abs))};});
 await page.locator('#r5Canvas').screenshot({path:out+'/final.png'});report.ok=!report.pageErrors.length&&!report.final.renderer?.fatal&&report.songAt!==undefined;
}catch(e){report.error=e.stack;report.ok=false;}
finally{await browser?.close();server.kill();fs.closeSync(stdout);fs.closeSync(stderr);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({label,ok:report.ok,songAt:report.songAt,presented:report.final?.presented,fatal:report.final?.renderer?.fatal,error:report.error}));if(!report.ok)process.exitCode=1;
