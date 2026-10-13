// Claude 2026-10-12: chequeo rápido en "iPhone" emulado: cruceta visible en menú, sin cartel de diagnóstico, y que ▼ mueve el menú.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {chromium,devices} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const root=path.resolve('artifacts/d1-wasm/movil-memoria/demo'),out=path.resolve('artifacts/d1-wasm/touch-dpad',`run-${Date.now()}`);fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token=`claude-dpad-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,nap=ms=>new Promise(r=>setTimeout(r,ms));
const rep={};let server,browser,reserved=false;
try{
 while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))await nap(10000);
 fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude (sesión A, cruceta)\nReserva: ${token}\nQué: menú táctil emulado\nDesde: ${new Date().toISOString()}\nFin: estimado 5 min\n`);reserved=true;
 const staticNames=fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile());
 server=createDemandServer({root,staticNames});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({...devices['iPhone 13 landscape']});const page=await ctx.newPage();const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.addInitScript(()=>{const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{if(e.data?.type==='g1eInput')window.g1live=1;});return w;};});
 await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url`);
 rep.manifest=await page.evaluate(async()=>{const l=document.querySelector('link[rel=manifest]');const r=await fetch(l.href);return [r.status,(await r.json()).short_name];});
 await page.waitForFunction(()=>!document.getElementById('loaderPlay').disabled,{},{timeout:60000});await page.click('#loaderPlay');
 await page.waitForFunction(()=>gh3Loader.ready||gh3Loader.error,{},{timeout:300000});await page.waitForFunction(()=>window.g1live,{},{timeout:180000});
 const t0=Date.now();while(!(await page.evaluate(()=>!!window.navSeen?.menu))){if(Date.now()-t0>200000)throw Error('sin menú');await page.evaluate(()=>gh3Input.tap('start'));await nap(1200);}
 await nap(3000);await page.screenshot({path:out+'/menu.png'});
 rep.dpadVisible=await page.evaluate(()=>{const d=document.querySelector('#gh3Touch .dpad');return !!d&&getComputedStyle(d).display!=='none'&&!document.getElementById('gh3Touch').hidden;});
 rep.diagHidden=await page.evaluate(()=>getComputedStyle(document.getElementById('gh3Diag')||document.body).display==='none');
 const before=await page.screenshot();const b=await page.locator('#gh3Touch .dpad .down').boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);await nap(1500);
 await page.screenshot({path:out+'/menu-tras-abajo.png'});rep.menuMoved=!before.equals(await page.screenshot());rep.errors=errs;rep.ok=rep.dpadVisible&&rep.diagHidden&&!errs.length;
}catch(e){rep.error=e.message;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(reserved&&fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude (sesión A)\nQué: cruceta; terminado\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/r.json',JSON.stringify(rep,null,1));console.log(out,JSON.stringify(rep));}
