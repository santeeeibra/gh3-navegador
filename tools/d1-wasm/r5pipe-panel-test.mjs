import {spawn} from 'node:child_process';import {chromium} from 'playwright';
const srv=spawn(process.execPath,['tools/d1-wasm/serve-r5pipe.mjs','5434'],{stdio:'ignore',windowsHide:true});
const out=process.argv[2];let b;
try{for(let i=0;i<50;i++){try{if((await fetch('http://127.0.0.1:5434/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 b=await chromium.launch({channel:'msedge',headless:true});const page=await b.newPage({viewport:{width:1400,height:900}});const errs=[];page.on('pageerror',e=>errs.push(e.message));
 await page.goto('http://127.0.0.1:5434/');await page.waitForSelector('#gh3Panel');
 await page.evaluate(()=>{document.getElementById('r5Box').hidden=false;});
 const btn=page.locator('#gh3Keys tr').first().locator('button').first();await btn.click();await page.keyboard.press('KeyJ');
 const after=await page.evaluate(()=>gh3Input.getBinds().verde);
 await page.reload();await page.waitForSelector('#gh3Panel');const persisted=await page.evaluate(()=>gh3Input.getBinds().verde);
 await page.keyboard.down('KeyJ');await page.waitForTimeout(50);const held=await page.evaluate(()=>gh3Input.stats.buttons);await page.keyboard.up('KeyJ');
 await page.evaluate(()=>document.getElementById('r5Box').hidden=false);await page.screenshot({path:out});
 await page.click('#gh3KeysReset');const reset=await page.evaluate(()=>gh3Input.getBinds().verde);
 console.log(JSON.stringify({after,persisted,held,reset,errs}));
}finally{await b?.close();srv.kill();}
