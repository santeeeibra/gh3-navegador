// Claude (r5pipe): prueba si escribir lag_calibration (clave QB 941F62C4 en las opciones del usuario) corre la
// ventana de acierto. LAG=<valor> LAGTYPE=int|float BOT_LEADS=<ms> GPUCAP_TURN=<t> node tools/d1-wasm/r5pipe-lagtest.mjs <etiqueta> [seg] [puerto]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
import {installRobot} from '../r5-live-song/install-robot.mjs';
requireTurn();
const label=process.argv[2]||'lag-1',duration=Number(process.argv[3]||110),port=Number(process.argv[4]||5433);
const lag=Number(process.env.LAG||0),type=process.env.LAGTYPE||'int',keys=String(process.env.LAGKEY||'941F62C4').split(',').map(h=>parseInt(h,16)>>>0),key=keys[0];
const out='artifacts/d1-wasm/r5pipe/runs/'+label;if(fs.existsSync(out))throw Error('Run exists');fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock',ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const chart=ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game+'/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))),'slowride','medium');
const report={label,lag,type,key:key.toString(16),leads:process.env.BOT_LEADS,samples:[],pageErrors:[]};let browser;
const server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:path.resolve('artifacts/d1-wasm/r5pipe/demo')},windowsHide:true,stdio:'ignore'});
try{
 for(let s=Date.now();;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()-s>10000)throw Error('Server timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1eInput'||e.data?.type==='g1Mem')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
 await page.goto('http://127.0.0.1:'+port+'/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&r5lite=1&cpasync=1&r5liveconsumer=r5snap-song-render.js');
 await page.setInputFiles('#dir',game);await page.fill('#secs',String(duration+30));await page.selectOption('#gpu','null');await page.click('#go');
 await page.evaluate(({lag,type,keys})=>{window.lagWrites={found:0,writes:0,values:[]};
  setInterval(()=>{if(!window.g1mem)return;const sab=g1mem.sab,dv=new DataView(sab),lo=0x9C000000,hi=Math.min(0xA2000000,sab.byteLength-16);const vals=[];let f=0;
   for(let o=lo;o<hi;o+=4){const kk=dv.getUint32(o,false);if(!keys.includes(kk))continue;
    if(kk===0x941F62C4){const p1=dv.getUint32(o+8,false)>>>24,p2=dv.getUint32(o+12,false)>>>24;if(p1<0x80||p2<0x80)continue;
     f++;vals.push(dv.getUint32(o+4,false).toString(16));if(type==='float')dv.setFloat32(o+4,lag,false);else dv.setInt32(o+4,lag,false);lagWrites.writes++;continue;}
    // Tabla de globales QB: [clave][archivo][valor][0][puntero]
    {const fl=dv.getUint32(o+4,false),v=dv.getInt32(o+8,false);if((fl!==0xE34DCB0C&&fl!==0xAF3FAD5F)||v<-2000||v>2000||(dv.getUint32(o+16,false)>>>24)<0x80)continue;}
    f++;vals.push(dv.getInt32(o+8,false));dv.setInt32(o+8,lag,false);lagWrites.writes++;}
   lagWrites.found=f;lagWrites.values=vals;},100);},{lag,type,keys});
 await installRobot(page,chart);await page.click('#goSong');const start=Date.now();
 while((Date.now()-start)/1000<duration){await page.waitForTimeout(2000);
  const s=await page.evaluate(()=>({clockMs:gh3Song.clock?.(),bot:window.botStats?{strums:botStats.strums,max:botStats.clockMax,resets:botStats.resets}:null,lag:{...lagWrites}}));report.samples.push(s);}
}catch(e){report.error=e.stack;}
finally{await browser?.close();server.kill();fs.writeFileSync(out+'/lagtest.json',JSON.stringify(report,null,1));}
const last=report.samples.at(-1);console.log(JSON.stringify({label,lag,type,leads:report.leads,last,error:report.error,pageErrors:report.pageErrors}));
