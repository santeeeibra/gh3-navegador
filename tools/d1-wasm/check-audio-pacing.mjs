// Actual GH3 audio production versus WebAudio. One owned server/browser/turn.
// No synthetic input or changes to game files. Stops before no-input song loss.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const [label='pacing',root='artifacts/song-sync/pacing/song']=process.argv.slice(2);
if(!/^[a-z0-9-]+$/i.test(label))throw Error('Invalid label');
const turnFile='artifacts/PRUEBAS-EN-CURSO.md';
if(fs.readFileSync(turnFile,'utf8').includes('Estado: OCUPADO'))throw Error('Test turn occupied');
const reservation=`codex-audio-${process.pid}-${Date.now()}`;
fs.writeFileSync(turnFile,`Estado: OCUPADO\nQuién: Codex\nReserva: ${reservation}\nQué: Slow Ride, prueba audio ${label}; servidor propio5189\n`);
const report={label,root,scope:'Original GH3 audio queue, actual song; no judgement certification',pageErrors:[],samples:[]};
let browser,server;
try{
 server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs','5189'],{env:{...process.env,D4_ROOT:path.resolve(root)},stdio:['ignore','pipe','pipe']});
 await new Promise((res,rej)=>{server.stdout.once('data',res);server.once('error',rej);server.once('exit',c=>rej(Error('Server exit '+c)));});
 browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1050,height:900}});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.goto('http://127.0.0.1:5189/?song=1&cpwait=event&audio=silent&xma=decode&waitmulti=event&audiotap=1');
 await page.setInputFiles('#dir','D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
 await page.click('#go');await page.click('#goSong');const start=Date.now();
 while(Date.now()-start<150000){
  await page.waitForTimeout(2000);
  const s=await page.evaluate(()=>({clock:window.gh3Song.clock?.(),song:window.songPak,audio:window.d4.r6Audio,nav:document.getElementById('navStat').textContent,exit:window.d4.exit}));
  report.samples.push({wallMs:Date.now()-start,...s});
  if(s.clock>0&&report.songAt===undefined)report.songAt=Date.now()-start;
  if(report.samples.length%5===0)console.log(JSON.stringify({label,wall:Math.round((Date.now()-start)/1000),clock:s.clock,audio:s.audio&&{underruns:s.audio.underruns,lag:s.audio.lag,productionRatio:s.audio.productionRatio}}));
  if(s.clock>22000&&report.samples.filter(x=>x.clock>2000).length>=8)break;
  if(s.exit!==null)throw Error('Unexpected game exit '+s.exit);
 }
 const song=report.samples.filter(s=>s.clock>2000&&s.audio?.ctxState==='running');
 if(song.length<8)throw Error('Insufficient song audio samples');
 const first=song[0],last=song.at(-1),seconds=(last.wallMs-first.wallMs)/1000;
 report.song={seconds,producedSamples:(last.audio.wNow-first.audio.wNow)>>>0,underruns:last.audio.underruns-first.audio.underruns,lagMs:last.audio.lag/48};
 report.song.productionRatio=report.song.producedSamples/(seconds*48000);
 report.log=await page.evaluate(()=>window.d4.log.filter(l=>/r6-pacing|r6-cb|r6-audio/.test(l)).slice(-40));
 report.ok=report.pageErrors.length===0&&report.song.underruns===0&&report.song.productionRatio>.98&&report.song.productionRatio<1.02;
 if(!report.ok)process.exitCode=1;
 console.log(JSON.stringify({label,ok:report.ok,song:report.song,pageErrors:report.pageErrors}));
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{
 await browser?.close();
 if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}
 if(fs.readFileSync(turnFile,'utf8').includes(`Reserva: ${reservation}`))fs.writeFileSync(turnFile,'Estado: LIBRE\nQuién: Codex\nQué: prueba audio cerrada; browser/servidor propios terminados\n');
 fs.mkdirSync('artifacts/song-sync',{recursive:true});fs.writeFileSync(`artifacts/song-sync/${label}.json`,JSON.stringify(report,null,2));
}
