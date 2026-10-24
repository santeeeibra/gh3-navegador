// Diagnóstico Claude (r5pipe): 1) dibujos descartados por shader/motivo (consumidor r5snap-song-diag.js),
// 2) ventana real de acierto (robot con adelanto distinto cada 3 notas + contador de aciertos hallado en memoria),
// 3) sonido de salida (envolvente por bloque) para medir cuándo suena cada nota respecto del juicio.
// Uso: GPUCAP_TURN=<t> node tools/d1-wasm/r5pipe-diag.mjs <etiqueta> [segundos] [puerto]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {requireTurn} from '../gpu-capture/lib.mjs';
requireTurn();
const label=process.argv[2]||'diag-1',duration=Number(process.argv[3]||175),port=Number(process.argv[4]||5433);if(!/^[\w-]+$/.test(label))throw Error('Label');
const out='artifacts/d1-wasm/r5pipe/runs/'+label;if(fs.existsSync(out))throw Error('Run exists');fs.mkdirSync(out,{recursive:true});
const game='D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock',ctx={window:{}};vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js','utf8'),ctx);
const chart=ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game+'/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))),'slowride','medium');
const notes=chart.notes.map(n=>({t:n.t,mask:n.mask}));
const report={label,pageErrors:[],samples:[],started:new Date().toISOString(),notes:notes.length,scan:[]};let browser;
const stdout=fs.openSync(out+'/server.stdout.log','w'),stderr=fs.openSync(out+'/server.stderr.log','w');
const server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:path.resolve('artifacts/d1-wasm/r5pipe/demo')},windowsHide:true,stdio:['ignore',stdout,stderr]});
const BASE=-350,DELTAS=[-180,-140,-110,-80,-50,-20,10,40,70,100,130,160];
const robotSrc=`
const FRET=[0,0x0100,0x0200,0,0x1000],DOWN=0x0002;let M=null,L=null,armed=false,notes=[],addr=0,base=0,deltas=[],counters=null,sweepFrom=1e12;
const st={strums:0,clockMax:-1e9,resets:0,clockSamples:[],strumLog:[]};const ep=()=>performance.timeOrigin+performance.now();
onmessage=e=>{const d=e.data;if(d.type==='init')({notes,addr,base,deltas}=d);if(d.type==='mem')M={sab:d.sab,seg:d.seg};if(d.type==='live')L=new Int32Array(d.sab,d.ptr,11);if(d.type==='arm')armed=true;
 if(d.type==='counters'){counters=d.offs;sweepFrom=d.fromIndex;}if(d.type==='stats')postMessage({st:d.full?st:{strums:st.strums,clockMax:st.clockMax,resets:st.resets},now:clock(),counters,sweepFrom});};
const clock=()=>{if(!M)return NaN;const t=new Uint32Array(M.sab,M.seg,256),h=(t[addr>>>24]+addr)>>>0;if(h+4>M.sab.byteLength)return NaN;return new DataView(M.sab).getFloat32(h,false);};
const readC=()=>counters?counters.map(o=>new DataView(M.sab).getUint32(o,false)):null;
const nap=new Int32Array(new SharedArrayBuffer(4));let i=0,frets=0,strumUntil=0,prev=null,last=-1,lastSample=0,k=0,frozenSince=0,nextA=0,aUntil=0;
const deltaOf=j=>(j>=sweepFrom&&(j-sweepFrom)%3===1)?deltas[Math.floor((j-sweepFrom)/3)%deltas.length]:0;
(function loop(){for(;;){Atomics.wait(nap,0,0,1);k++;
 if(!armed||!L){if(k%50===0){setTimeout(loop,0);return;}continue;}
 const raw=clock();if(!Number.isFinite(raw))continue;const pnow=performance.now();
 if(pnow-lastSample>=40){lastSample=pnow;st.clockSamples.push([+ep().toFixed(2),raw]);}
 if(prev!==null&&raw<prev-1000){st.resets++;i=0;frets=0;}
 if(prev===null||raw!==prev)frozenSince=pnow;prev=raw;if(raw>st.clockMax)st.clockMax=raw;
 if(raw>5000&&pnow-frozenSince>2500&&pnow>nextA){nextA=pnow+3000;aUntil=pnow+150;Atomics.or(L,10,0x1000);}
 if(pnow<aUntil){Atomics.store(L,2,0);Atomics.store(L,1,0x1000);Atomics.add(L,0,1);last=0x1000;continue;}
 while(i<notes.length&&raw>notes[i].t-base+deltaOf(i)+150)i++;
 let tap=0;if(i<notes.length){const n=notes[i],at=n.t-base+deltaOf(i);
  if(raw>=at-70)frets=n.mask&31;
  if(raw>=at){tap=DOWN;strumUntil=performance.now()+30;st.strums++;st.strumLog.push({i,delta:deltaOf(i),noteT:n.t,clock:raw,epoch:+ep().toFixed(2),c:readC()});i++;}}
 let b=0;for(let q=0;q<5;q++)if(frets&(1<<q))b|=FRET[q];const tr=(frets&1?255:0)|(frets&8?255<<8:0);if(performance.now()<strumUntil)b|=DOWN;
 const key=b|(tr<<16);if(key!==last||tap){if(tap)Atomics.or(L,10,tap);Atomics.store(L,2,tr);Atomics.store(L,1,b);Atomics.add(L,0,1);last=key;}
 if(k%200===0){setTimeout(loop,0);return;}}})();`;
try{
 for(let s=Date.now();;){try{if((await fetch('http://127.0.0.1:'+port)).ok)break;}catch{}if(Date.now()-s>10000)throw Error('Server timeout');await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();const page=await browser.newPage({viewport:{width:1400,height:1150}});page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live={sab:e.data.sab,ptr:e.data.ptr};if(e.data?.type==='g1eInput'||e.data?.type==='g1Mem')window.g1mem={sab:e.data.sab,seg:e.data.seg};});return w;};});
 await page.goto('http://127.0.0.1:'+port+'/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&r5lite=1&cpasync=1&r5liveconsumer=r5snap-song-diag.js');
 await page.setInputFiles('#dir',game);await page.fill('#secs',String(duration+30));await page.selectOption('#gpu','null');await page.click('#go');
 await page.evaluate(({src,notes,base,deltas})=>{
  const bw=new Worker(URL.createObjectURL(new Blob([src],{type:'text/javascript'})));window.diagRobot=bw;bw.postMessage({type:'init',notes,addr:0x829B57B0,base,deltas});
  window.botStats={strums:0};bw.onmessage=e=>{if(e.data.st.clockSamples)window.botFull=e.data;else Object.assign(window.botStats,e.data.st,{now:e.data.now});};
  let sentLive=false,armed=false;setInterval(()=>{if(window.g1mem)bw.postMessage({type:'mem',sab:g1mem.sab,seg:g1mem.seg});if(!sentLive&&window.g1live){bw.postMessage({type:'live',sab:g1live.sab,ptr:g1live.ptr});sentLive=true;}
   if(!armed&&d4.log.some(l=>/_song.pak.xen/.test(l))){bw.postMessage({type:'arm'});armed=true;}bw.postMessage({type:'stats'});},1000);
 },{src:robotSrc,notes,base:BASE,deltas:DELTAS});
 await page.click('#goSong');const start=Date.now();let audioOn=false,cands=null,candN=0,nextScan=0,countersSent=false,nextImage=0;
 while((Date.now()-start)/1000<duration){
  await page.waitForTimeout(1000);
  const s=await page.evaluate(()=>({clockMs:window.gh3Song.clock?.(),exit:d4.exit,presented:d4.songPresented||0,fatal:d4.songRenderer?.fatal,bot:{strums:botStats.strums,clockMax:botStats.clockMax,resets:botStats.resets}}));
  report.samples.push({wallS:(Date.now()-start)/1000,epoch:Date.now(),...s});
  if(s.clockMs>0&&report.songAt===undefined){report.songAt=(Date.now()-start)/1000;console.log('Song clock started at '+report.songAt);}
  if(s.clockMs>0&&!audioOn){audioOn=true;report.audioSetup=await page.evaluate(async()=>{
   const code="class R extends AudioWorkletProcessor{constructor(){super();this.b=[]}process(i){const c=i[0]&&i[0][0];if(c){let s=0;for(let k=0;k<c.length;k++)s+=c[k]*c[k];this.b.push(currentTime,s)}if(this.b.length>=750){this.port.postMessage(this.b);this.b=[]}return true}}registerProcessor('env-rec',R)";
   await r6ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));const rec=new AudioWorkletNode(r6ctx,'env-rec'),g=r6ctx.createGain();g.gain.value=0;r6node.connect(rec);rec.connect(g);g.connect(r6ctx.destination);
   window.envRec=[];rec.port.onmessage=e=>{for(const x of e.data)envRec.push(x);};window.ctxMap=[];setInterval(()=>ctxMap.push([r6ctx.currentTime,performance.timeOrigin+performance.now()]),50);
   return {sampleRate:r6ctx.sampleRate,outputLatency:r6ctx.outputLatency,baseLatency:r6ctx.baseLatency};});}
  // Contador de aciertos: buscar enteros BE que suban igual que los rasgueos del robot (todos aciertos antes del barrido).
  if(!countersSent&&s.clockMs>12000&&s.bot.strums>=12&&Date.now()>nextScan&&(!cands||s.bot.strums-candN>=3)){
   const N=s.bot.strums;
   const r=await page.evaluate(({N,prev,prevN})=>{const sab=g1mem.sab,dv=new DataView(sab),len=sab.byteLength-sab.byteLength%4;
    if(!prev){const c=[];for(let o=0;o<len;o+=4){const v=dv.getUint32(o,false);if(v>=N-4&&v<=N+1)c.push(o,v);}return c.length>200000?{tooMany:c.length/2}:{c};}
    const c=[];for(let j=0;j<prev.length;j+=2){const v=dv.getUint32(prev[j],false),d=v-prev[j+1];if(d>=N-prevN-2&&d<=N-prevN+1&&d>0)c.push(prev[j],v);}return {c};},{N,prev:cands,prevN:candN});
   report.scan.push({N,clockMs:s.clockMs,found:r.c?r.c.length/2:null,tooMany:r.tooMany});
   if(r.c){cands=r.c;candN=N;}nextScan=Date.now()+3000;
   if(cands&&cands.length>0&&cands.length/2<=16&&report.scan.length>=3){const offs=[];for(let j=0;j<cands.length;j+=2)offs.push(cands[j]);
    await page.evaluate(({offs})=>{diagRobot.postMessage({type:'counters',offs,fromIndex:0});},{offs});
    await page.evaluate(()=>diagRobot.postMessage({type:'stats'}));countersSent=true;report.counters=offs;console.log('Counters: '+offs.length);}
  }
  if(s.presented&&s.clockMs>0&&s.clockMs/1000>=nextImage){await page.locator('#r5Canvas').screenshot({path:out+'/song-'+Math.floor(s.clockMs/1000)+'.png'});nextImage=s.clockMs/1000+4;}
  if(s.exit!==null||s.fatal)break;
 }
 await page.evaluate(()=>diagRobot.postMessage({type:'stats',full:true}));await page.waitForTimeout(1500);
 report.final=await page.evaluate(()=>({exit:d4.exit,renderer:d4.songRenderer,presented:d4.songPresented,audio:d4.r6Audio,bot:window.botFull,log:d4.log}));
 fs.writeFileSync(out+'/runtime.log',report.final.log.join('\n'));delete report.final.log;
 report.env=await page.evaluate(()=>({env:window.envRec||[],map:window.ctxMap||[]}));
 report.ok=!report.pageErrors.length&&!report.final.renderer?.fatal&&report.songAt!==undefined;
}catch(e){report.error=e.stack;report.ok=false;}
finally{await browser?.close();server.kill();fs.closeSync(stdout);fs.closeSync(stderr);
 const env=report.env;delete report.env;fs.writeFileSync(out+'/verification.json',JSON.stringify(report));if(env)fs.writeFileSync(out+'/audio-env.json',JSON.stringify(env));}
console.log(JSON.stringify({label,ok:report.ok,songAt:report.songAt,counters:report.counters?.length,scan:report.scan,error:report.error}));if(!report.ok)process.exitCode=1;
