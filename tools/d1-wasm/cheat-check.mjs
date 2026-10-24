// Claude 2026-10-12: exploratorio — menú → Options (y capturas), para ubicar Cheats. PASOS="d,d,a,..." (d=abajo,u=arriba,a=verde,b=volver,c=botón truco,w=espera)
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const root=path.resolve('artifacts/d1-wasm/movil-memoria/demo'),out=path.resolve('artifacts/d1-wasm/truco',`run-${Date.now()}`);fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`claude-truco-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,nap=ms=>new Promise(r=>setTimeout(r,ms));
const steps=(process.env.PASOS||'').split(',').filter(Boolean);const rep={steps:[]};let server,browser,reserved=false;
try{
 while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))await nap(10000);
 fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude (sesión A, truco)\nReserva: ${token}\nQué: menú Options/Cheats\nDesde: ${new Date().toISOString()}\nFin: estimado 6 min\n`);reserved=true;
 const staticNames=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile());
 server=createDemandServer({root,staticNames});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launchPersistentContext(out+'/p',{channel:'msedge',headless:true,viewport:{width:1600,height:900}});const page=browser.pages()[0];const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live=1;});return w;};});
 await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url`);
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled,{},{timeout:60000});await page.click('#loaderPlay');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:300000});await page.waitForFunction(()=>window.g1live,{},{timeout:180000});
 const t0=Date.now();while(!(await page.evaluate(()=>!!window.navSeen?.menu))){if(Date.now()-t0>200000)throw Error('sin menú');await page.evaluate(()=>gh3Input.tap('start'));await nap(1200);}
 await nap(3000);const shot=n=>page.locator('#r5Canvas').screenshot({path:`${out}/${String(rep.steps.length).padStart(2,'0')}-${n}.png`}).catch(()=>{});await shot('menu');
 const map={d:'down',u:'up',a:'a',b:'b',l:'left',r:'right'};
 for(const s of steps){
  if(s==='w'){await nap(4000);}
  else if(s==='c'){await page.evaluate(()=>{document.querySelector('#gh3Panel [data-tab=save]')?.click();});await page.click('#gh3CheatSongs');await page.waitForFunction(()=>!document.getElementById('gh3CheatSongs').disabled,{},{timeout:60000});await nap(2500);}
  else{await page.evaluate(n=>gh3Input.tap(n),map[s]);await nap(2500);}
  rep.steps.push(s);await shot(s);
 }
 if(steps.includes('c'))await page.locator('#gh3Panel').screenshot({path:out+'/panel.png'}).catch(()=>{});
 rep.errors=errs;rep.ok=!errs.length;
}catch(e){rep.error=e.message;}
finally{await browser?.close();try{fs.rmSync(out+'/p',{recursive:true,force:true});}catch{}if(server)await new Promise(r=>server.close(r));if(reserved&&fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude (sesión A)\nQué: truco; terminado\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/r.json',JSON.stringify(rep,null,1));console.log(out,JSON.stringify(rep));}
