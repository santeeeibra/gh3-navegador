// Claude (r5pipe): prueba de partida guardada. Arranca el juego, espera que guarde en IndexedDB, recarga la página,
// vuelve a arrancar y comprueba que se restauró. GPUCAP_TURN=<t> node tools/d1-wasm/r5pipe-save-test.mjs [seg] [puerto]
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
requireTurn();
const secs=Number(process.argv[2]||75),port=Number(process.argv[3]||5433);
const out='artifacts/d1-wasm/r5pipe/runs/save-test-'+Date.now();fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:path.resolve('artifacts/d1-wasm/r5pipe/demo')},windowsHide:true,stdio:'ignore'});
const report={rounds:[],pageErrors:[]};let browser;
try{
 for(let s=Date.now();;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()-s>10000)throw Error('Server timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 for(const round of [1,2]){
  await page.goto('http://127.0.0.1:'+port+'/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&r5lite=1&cpasync=1&r5liveconsumer=r5snap-song-render.js&savels=1');
  await page.setInputFiles('#dir',game);await page.fill('#secs',String(secs+30));await page.selectOption('#gpu','null');await page.click('#go');await page.click('#goSong');
  await page.waitForTimeout(secs*1000);
  const r=await page.evaluate(async()=>{
   const db=await new Promise((res,rej)=>{const q=indexedDB.open('gh3-data',1);q.onupgradeneeded=()=>q.result.createObjectStore('files');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});
   const keys=await new Promise(res=>{const q=db.transaction('files').objectStore('files').getAllKeys();q.onsuccess=()=>res(q.result.map(String));});
   const sizes=await Promise.all(keys.map(k=>new Promise(res=>{const q=db.transaction('files').objectStore('files').get(k);q.onsuccess=()=>res([k,q.result?.byteLength]);})));
   db.close();return {ls:window.gh3DataLs,save:window.gh3Save,sizes,saveLog:d4.log.filter(l=>/SAVE:|partida/.test(l)).slice(0,12),panel:document.getElementById('gh3SaveTxt')?.textContent,status:document.getElementById('status')?.textContent,logTail:d4.log.slice(-6),marks:Object.keys(d4.marks||{})};});
  report.rounds.push({round,...r});console.log('round',round,JSON.stringify(r).slice(0,1500));
 }
}catch(e){report.error=e.stack;console.log(e.stack);}
finally{await browser?.close();server.kill();fs.writeFileSync(out+'/save-test.json',JSON.stringify(report,null,1));}
console.log(JSON.stringify({out,pageErrors:report.pageErrors,error:report.error?.slice(0,300)}));
