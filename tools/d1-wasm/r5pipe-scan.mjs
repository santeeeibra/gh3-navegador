// Claude (r5pipe): busca claves QB (BE uint32) en la memoria del juego durante la canción y vuelca el entorno.
// Uso: GPUCAP_TURN=<t> node tools/d1-wasm/r5pipe-scan.mjs <etiqueta> [segundos] [puerto] [claves hex separadas por coma]
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
requireTurn();
const label=process.argv[2]||'scan-1',duration=Number(process.argv[3]||90),port=Number(process.argv[4]||5433);
const keys=String(process.argv[5]||'941F62C4,B349D5AA,C79B27C1,82CDF5CA,978F5B87,77C71B72').split(',').map(h=>parseInt(h,16)>>>0);
const out='artifacts/d1-wasm/r5pipe/runs/'+label;if(fs.existsSync(out))throw Error('Run exists');fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const report={label,keys:keys.map(k=>k.toString(16).toUpperCase()),scans:[],pageErrors:[]};let browser;
const server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:path.resolve('artifacts/d1-wasm/r5pipe/demo')},windowsHide:true,stdio:'ignore'});
try{
 for(let s=Date.now();;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()-s>10000)throw Error('Server timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput'||e.data?.type==='g1Mem')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
 await page.goto('http://127.0.0.1:'+port+'/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&r5lite=1&cpasync=1&r5liveconsumer=r5snap-song-render.js');
 await page.setInputFiles('#dir',game);await page.fill('#secs',String(duration+30));await page.selectOption('#gpu','null');await page.click('#go');await page.click('#goSong');
 const start=Date.now();let done=0;
 while((Date.now()-start)/1000<duration){
  await page.waitForTimeout(2000);const clock=await page.evaluate(()=>window.gh3Song.clock?.());
  if(clock>3000&&done<2){
   const r=await page.evaluate(({keys})=>{const sab=g1mem.sab,dv=new DataView(sab),u8=new Uint8Array(sab),len=sab.byteLength-sab.byteLength%4,seg=new Uint32Array(sab,g1mem.seg,256),hits=[];
    const set=new Set(keys);for(let o=0;o<len;o+=4){const v=dv.getUint32(o,false);if(set.has(v)&&hits.length<400){const a=Math.max(0,o-16),b=Math.min(len,o+32);hits.push({off:o,key:v.toString(16).toUpperCase(),hex:[...u8.subarray(a,b)].map(x=>x.toString(16).padStart(2,'0')).join(''),from:a});}}
    return {hits,seg:[...seg]};},{keys});
   report.scans.push({clock,...r});done++;console.log('scan at clock',clock,'hits',r.hits.length);
  }
  if(done>=2)break;
 }
}catch(e){report.error=e.stack;}
finally{await browser?.close();server.kill();fs.writeFileSync(out+'/scan.json',JSON.stringify(report,null,1));}
console.log(JSON.stringify({label,scans:report.scans.map(s=>({clock:s.clock,hits:s.hits.length})),error:report.error,pageErrors:report.pageErrors}));
