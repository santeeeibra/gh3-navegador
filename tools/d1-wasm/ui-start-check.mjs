// Claude 2026-10-12: tiempos de arranque (página → Jugar → juego listo → menú) y capturas del panel/cinta/PS4.
// Uso: [LAT_MS=150 BW_KBPS=5000] [DEMO_ROOT=...] node tools/d1-wasm/ui-start-check.mjs [--wait] [--noshots]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const wait=process.argv.includes('--wait'),shots=!process.argv.includes('--noshots');
const LAT=Number(process.env.LAT_MS||0),BW=Number(process.env.BW_KBPS||0);
const root=path.resolve(process.env.DEMO_ROOT||'artifacts/d1-wasm/movil-memoria/demo');
const out=path.resolve('artifacts/d1-wasm/inicio',`run-lat${LAT}-bw${BW}-${Date.now()}`);fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`claude-inicio-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
const nap=ms=>new Promise(r=>setTimeout(r,ms));let reserved=false,server,browser;
const report={root,latMs:LAT,bwKBps:BW,started:new Date().toISOString(),marks:{},network:[],pageErrors:[]};
const write=()=>fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));
const ownTurn=()=>fs.readFileSync(turn,'utf8').includes('Reserva: '+token);
try{
 const since=Date.now();
 while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE')){if(!wait||Date.now()-since>45*60000)throw Error('Turno ocupado; no se ejecutó el juego.');await nap(10000);}
 fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude (sesión A, inicio + panel)\nReserva: ${token}\nQué: arranque y menú, perfil aislado\nDesde: ${new Date().toISOString()}\nFin: estimado 6 min\n`);
 reserved=true;
 const m=JSON.parse(fs.readFileSync(root+'/manifest.json')),byHash=new Map(m.files.flatMap(f=>f.chunks.map(c=>[c.hash,f.path])));
 const staticNames=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile());
 server=createDemandServer({root,staticNames,latencyMs:LAT,bandwidthKBps:BW,onChunk:r=>report.network.push({at:r.at,size:r.size,path:byHash.get(r.hash)})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launchPersistentContext(out+'/edge-profile',{channel:'msedge',headless:true,viewport:{width:1600,height:900}});
 const page=browser.pages()[0];page.on('pageerror',e=>report.pageErrors.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live=1;});return w;};});
 const t0=Date.now(),mark=k=>{report.marks[k]=Date.now()-t0;write();console.log(k,report.marks[k]);};
 await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?${process.env.GH3_QUERY||'manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url'}`);mark('pagina');
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled||gh3Loader.error,{},{timeout:60000});mark('botonJugar');
 await page.click('#loaderPlay');mark('click');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:300000});mark('cargadorListo');
 if(await page.evaluate(()=>gh3Loader.error))throw Error('Cargador: '+await page.evaluate(()=>gh3Loader.error));
 await page.waitForFunction(()=>window.g1live,{},{timeout:180000});mark('juegoVivo');
 await page.waitForFunction(()=>document.getElementById('gh3Panel'),{},{timeout:60000}).catch(()=>{});mark('panel');
 const key={start:'Enter',a:'Digit1',down:'ArrowDown'},tap=async b=>{await page.keyboard.down(key[b]);await nap(150);await page.keyboard.up(key[b]);};
 while(!(await page.evaluate(()=>!!window.navSeen?.menu))){if(Date.now()-t0>400000)throw Error('No llegó al menú.');await tap('start');await nap(1000);}
 mark('menu');
 const upTo=k=>report.network.filter(n=>n.at-t0<=report.marks[k]);
 report.bytes={hastaListo:+(upTo('cargadorListo').reduce((s,n)=>s+n.size,0)/1048576).toFixed(1),hastaMenu:+(upTo('menu').reduce((s,n)=>s+n.size,0)/1048576).toFixed(1),partesHastaListo:upTo('cargadorListo').length,partesHastaMenu:upTo('menu').length};
 const top={};for(const n of upTo('menu')){top[n.path]=(top[n.path]||0)+n.size;}report.topFiles=Object.entries(top).sort((a,b)=>b[1]-a[1]).slice(0,25).map(([p,s])=>[p,+(s/1048576).toFixed(1)]);
 if(shots){
  await nap(3000);await page.screenshot({path:out+'/pagina-menu.png'});
  // cinta: tocar verde/rojo/rasgueo un rato
  for(const k of ['Digit1','Digit2','ArrowDown','Digit3','Digit4','Digit5']){await page.keyboard.down(k);await nap(250);await page.keyboard.up(k);await nap(120);}
  await page.locator('#gh3Row').screenshot({path:out+'/fila-juego-cinta-panel.png'}).catch(e=>report.shotError=e.message);
  report.tape=await page.evaluate(()=>({exists:!!document.getElementById('gh3Tape'),visible:!document.getElementById('gh3Tape')?.hidden,h:document.getElementById('gh3Tape')?.height,touch:window.gh3Touch?.enabled?.(),fullBtn:!!document.getElementById('gh3Full2'),panelScroll:(()=>{const p=document.getElementById('gh3Panel');return p?[p.scrollHeight,p.clientHeight]:null;})()}));
  await page.click('#controllerGuide [data-platform="ps4"]').catch(()=>{});await nap(400);
  await page.locator('#gh3Panel').screenshot({path:out+'/panel-ps4.png'}).catch(()=>{});
 }
 report.ok=report.pageErrors.length===0;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{
 await browser?.close();try{fs.rmSync(out+'/edge-profile',{recursive:true,force:true});}catch{}if(server)await new Promise(r=>server.close(r));
 if(reserved&&ownTurn())fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude (sesión A)\nQué: arranque y panel; ${report.ok?'prueba terminada':'fallo'}\nFin: ${new Date().toISOString()}\n`);
 write();console.log(JSON.stringify({out,ok:report.ok,error:report.error?.split('\n')[0],marks:report.marks,bytes:report.bytes,tape:report.tape,top:report.topFiles?.slice(0,12)}));
}
