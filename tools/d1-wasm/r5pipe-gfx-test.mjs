// Claude (r5pipe): prueba sin juego de la sección Gráficos del panel. Uso: node tools/d1-wasm/r5pipe-gfx-test.mjs <captura.png>
import {spawn} from 'node:child_process';import {chromium} from 'playwright';
const srv=spawn(process.execPath,['tools/d1-wasm/serve-r5pipe.mjs','5434'],{stdio:'ignore',windowsHide:true});
const out=process.argv[2];let b;
try{for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5434/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({channel:'msedge',headless:true});const page=await b.newPage({viewport:{width:1400,height:900}});const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:5434/');await page.waitForSelector('#gh3Panel');
 const s0=await page.evaluate(()=>({url:location.search,fit:document.body.classList.contains('gh3fit'),apply:getComputedStyle(document.getElementById('gh3GfxApply')).display}));
 await page.check('#gh3Scene');await page.uncheck('#gh3Lite');await page.selectOption('#gh3Inflight','1');
 const s1=await page.evaluate(()=>({apply:getComputedStyle(document.getElementById('gh3GfxApply')).display,ls:localStorage.getItem('gh3gfx')}));
 await Promise.all([page.waitForNavigation(),page.click('#gh3GfxApply')]);await page.waitForSelector('#gh3Panel');
 const s2=await page.evaluate(()=>({url:location.search,scene:gh3Scene.checked,lite:gh3Lite.checked,inf:gh3Inflight.value,apply:getComputedStyle(document.getElementById('gh3GfxApply')).display}));
 await page.evaluate(()=>{document.getElementById('r5Box').hidden=false;});await page.waitForTimeout(700);
 const box=await page.evaluate(()=>{const r=document.getElementById('r5Canvas').getBoundingClientRect();return {top:r.top,h:r.height,w:r.width,vh:innerHeight};});
 await page.screenshot({path:out});
 // volver a lo normal
 await page.uncheck('#gh3Scene');await page.check('#gh3Lite');await page.selectOption('#gh3Inflight','2');await Promise.all([page.waitForNavigation(),page.click('#gh3GfxApply')]);await page.waitForSelector('#gh3Panel');
 const s3=await page.evaluate(()=>location.search);
 console.log(JSON.stringify({s0,s1,s2,box,s3,errs},null,1));
}finally{await b?.close();srv.kill();}
