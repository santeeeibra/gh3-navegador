// Claude 2026-10-12: mide la "traba" al pasar el selector por los temas de Partida rápida.
// Por cada flecha abajo registra: huecos entre cuadros presentados, cortes de audio y pedidos de partes por red.
// Uso: [LAT_MS=150 BW_KBPS=5000] [DEMO_ROOT=...] node tools/d1-wasm/menu-scroll-check.mjs [pasos=8] [--wait]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const steps=Number(process.argv.find(a=>/^\d+$/.test(a))||8),wait=process.argv.includes('--wait');
const LAT=Number(process.env.LAT_MS||0),BW=Number(process.env.BW_KBPS||0),GAP=Number(process.env.STEP_MS||4000);
const root=path.resolve(process.env.DEMO_ROOT||'artifacts/d1-wasm/movil-memoria/demo');
const out=path.resolve('artifacts/d1-wasm/menu-scroll',`run-lat${LAT}-bw${BW}-${Date.now()}`);fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`claude-menuscroll-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
const nap=ms=>new Promise(r=>setTimeout(r,ms));let reserved=false,server,browser;
const report={root,latMs:LAT,bwKBps:BW,stepMs:GAP,started:new Date().toISOString(),presses:[],network:[],pageErrors:[],shots:[]};
const write=()=>fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
const ownTurn=()=>fs.readFileSync(turn,'utf8').includes('Reserva: '+token);
try{
 const since=Date.now();
 while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE')){if(!wait||Date.now()-since>45*60000)throw Error('Turno ocupado; no se ejecutó el juego.');await nap(10000);}
 fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude (sesión A, traba del menú)\nReserva: ${token}\nQué: menú de temas, perfil aislado\nDesde: ${new Date().toISOString()}\nFin: estimado 10 min\n`);
 reserved=true;
 const m=JSON.parse(fs.readFileSync(root+'/manifest.json')),byHash=new Map(m.files.flatMap(f=>f.chunks.map(c=>[c.hash,f.path])));
 const staticNames=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile());
 server=createDemandServer({root,staticNames,latencyMs:LAT,bandwidthKBps:BW,onChunk:r=>report.network.push({at:r.at,size:r.size,path:byHash.get(r.hash)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launchPersistentContext(out+'/edge-profile',{channel:'msedge',headless:true,viewport:{width:1280,height:900}});
 const page=browser.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live=1;});return w;};});
 // Registro de cuadros presentados (época en ms) y de cortes de audio, desde la página.
 await page.addInitScript(()=>{window.__fr=[];window.__au=[];let last=0;const tick=()=>{const n=window.d4?.songPresented||0;if(n!==last){last=n;window.__fr.push(performance.timeOrigin+performance.now());}requestAnimationFrame(tick);};requestAnimationFrame(tick);setInterval(()=>{const a=window.d4?.r6Audio;if(a)window.__au.push([performance.timeOrigin+performance.now(),a.underruns||0,a.lag||0]);},100);});
 await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?${process.env.GH3_QUERY||'manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url'}`);
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled||gh3Loader.error,{},{timeout:30000});
 await page.click('#loaderPlay');await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:240000});
 if(await page.evaluate(()=>gh3Loader.error))throw Error('Cargador: '+await page.evaluate(()=>gh3Loader.error));
 const shot=async n=>{await page.locator('#r5Canvas').screenshot({path:out+'/'+n+'.png',timeout:3000}).catch(()=>{});report.shots.push(n);};
 const key={start:'Enter',a:'Digit1',down:'ArrowDown'};
 const tap=async(b,label)=>{const at=Date.now();await page.keyboard.down(key[b]);await nap(150);await page.keyboard.up(key[b]);report.presses.push({at,b,label});write();};
 await page.waitForFunction(()=>window.g1live,{},{timeout:120000});await page.evaluate(()=>g1worker.postMessage({type:'pressClear'})).catch(()=>{});
 const t0=Date.now();while(!(await page.evaluate(()=>!!window.navSeen?.menu))){if(Date.now()-t0>180000)throw Error('No llegó al menú.');await tap('start','start');await nap(1500);}
 await nap(3000);await shot('00-menu');
 await tap('down','nav');await nap(4500);await tap('down','nav');await nap(4500);await tap('a','partida-rapida');await nap(8000);await shot('01-dificultad');await tap('a','dificultad');await nap(8000);await shot('02-lista');
 report.listAt=Date.now();
 for(let i=0;i<steps;i++){await tap('down','tema-'+(i+1));await nap(GAP);await shot('tema-'+String(i+1).padStart(2,'0'));}
 report.endAt=Date.now();
 const fr=await page.evaluate(()=>window.__fr),au=await page.evaluate(()=>window.__au);
 // Análisis por flecha: ventana [pulsación, pulsación+GAP).
 report.perStep=report.presses.filter(p=>p.label.startsWith('tema-')).map(p=>{
  const end=p.at+GAP,f=fr.filter(t=>t>=p.at-500&&t<end);let maxGap=0,where=null;for(let i=1;i<f.length;i++){const g=f[i]-f[i-1];if(g>maxGap){maxGap=g;where=Math.round(f[i-1]-p.at);}}
  const a=au.filter(x=>x[0]>=p.at&&x[0]<end),net=report.network.filter(n=>n.at>=p.at&&n.at<end);
  return {label:p.label,frames:f.length,fps:+(f.filter(t=>t>=p.at).length/(GAP/1000)).toFixed(1),maxGapMs:Math.round(maxGap),gapStartMs:where,underruns:a.length?a.at(-1)[1]-a[0][1]:null,chunks:net.length,chunkMB:+(net.reduce((s,n)=>s+n.size,0)/1048576).toFixed(1),files:[...new Set(net.map(n=>n.path))]};
 });
 const base=fr.filter(t=>t>=report.listAt-8000&&t<report.listAt);let bg=0;for(let i=1;i<base.length;i++)bg=Math.max(bg,base[i]-base[i-1]);
 report.baseline={fps:+(base.length/8).toFixed(1),maxGapMs:Math.round(bg)};
 report.ok=report.pageErrors.length===0;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{
 await browser?.close();try{fs.rmSync(out+'/edge-profile',{recursive:true,force:true});}catch{}if(server)await new Promise(r=>server.close(r));
 if(reserved&&ownTurn())fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude (sesión A)\nQué: menú de temas; ${report.ok?'prueba terminada':'fallo'}\nFin: ${new Date().toISOString()}\n`);
 write();console.log(JSON.stringify({out,ok:report.ok,error:report.error?.split('\n')[0],baseline:report.baseline,perStep:report.perStep},null,1));
}
