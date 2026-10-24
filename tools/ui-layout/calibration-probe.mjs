import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const out='artifacts/ui-layout/calibration';fs.mkdirSync(out,{recursive:true});
const root=path.resolve('artifacts/ui-layout/demo');
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-calibration-'+crypto.randomBytes(5).toString('hex');
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado');
fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: reproducir STRUM en calibración original, copia UI local\nDesde: ${new Date().toISOString()}\nFin: estimado 15 min\n`);
const server=createDemandServer({root,staticNames:fs.readdirSync(root).filter(n=>fs.statSync(path.join(root,n)).isFile())});
await new Promise(r=>server.listen(5458,'127.0.0.1',r));
let browser;const errors=[];let page;
const snap=async name=>{await page.screenshot({path:out+'/'+name+'.png'});fs.writeFileSync(out+'/runtime.json',JSON.stringify(await page.evaluate(()=>({diag:window.gh3Diag,input:window.gh3Input?.stats,log:window.d4?.log,exit:window.d4?.exit})),null,2));console.log('SHOT '+name);};
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  page=await browser.newPage({viewport:{width:1600,height:900}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5458/gh3/',{waitUntil:'networkidle'});
  await page.locator('#loaderPlay').click();
  for(let i=0;i<60&&!await page.evaluate(()=>window.gh3Input?.attached);i++) {
    await page.waitForTimeout(2000);
    if(i%5===0)console.log('LOAD '+JSON.stringify(await page.evaluate(()=>({status:document.getElementById('loaderStatus')?.textContent,errors:window.gh3Diag?.errors,exit:window.d4?.exit}))));
  }
  if(!await page.evaluate(()=>window.gh3Input?.attached)){await snap('boot-failed');throw Error('Input no inicializado');}
  for(let i=0;i<90;i++){
    if(await page.evaluate(()=>(window.d4?.log||[]).some(x=>/GH3_Intro\.bik/i.test(x))))break;
    await page.evaluate(()=>window.gh3Input.tap('start'));await page.waitForTimeout(1500);
    if(i%10===0)console.log('BOOT '+i);
  }
  await page.waitForTimeout(3000);await snap('menu');
  console.log('READY commands: tap/n/wait, key, shot, state, quit');
  const reader=readline.createInterface({input:process.stdin,terminal:false});
  for await(const line of reader){
    try{
      const c=JSON.parse(line);
      if(c.quit){reader.close();break;}
      if(c.tap)for(let i=0;i<(c.n||1);i++){await page.evaluate(key=>window.gh3Input.tap(key),c.tap);await page.waitForTimeout(c.wait||500);}
      if(c.key){await page.keyboard.press(c.key,{delay:c.hold||120});await page.waitForTimeout(c.wait||500);}
      if(c.shot)await snap(c.shot.replace(/[^a-z0-9_-]/gi,''));
      if(c.state)console.log(JSON.stringify(await page.evaluate(()=>({exit:window.d4?.exit,input:window.gh3Input?.stats,diagErrors:window.gh3Diag?.errors,tail:window.d4?.log?.filter(x=>/\[c1\]|\[g1-file\]/.test(x)).slice(-15)}))));
      console.log('DONE');
    }catch(e){console.log('COMMAND ERROR '+e.message);}
  }
}finally{
  await browser?.close();await new Promise(r=>server.close(r));
  fs.writeFileSync(out+'/page-errors.json',JSON.stringify(errors));
  if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Codex\nQué: calibración, navegador y servidor cerrados\nFin: ${new Date().toISOString()}\n`);
}
