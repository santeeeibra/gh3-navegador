// Simula un navegador sin Memory64 (p. ej. Safari iOS) y vista de celular.
import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
 await page.addInitScript(()=>{const v=WebAssembly.validate;WebAssembly.validate=b=>(b.length===13&&b[11]===4)?false:v(b);});
 await page.goto(process.env.BASE_URL||'https://riff-duel.vercel.app/fase2/');
 await page.click('#all');
 await page.waitForFunction(()=>window.__phase2.results.length===3,null,{timeout:90000});
 const e=await page.evaluate(()=>window.__phase2);
 console.log(JSON.stringify({ok:e.ok,memory64:e.memory64,wasm64Skipped:e.wasm64Skipped,results:e.results.map(r=>({v:r.variant,pass:r.pass,fail:r.fail,unsupported:!!r.unsupported,error:r.error,expected:r.expectedOutcome}))}));
 console.log('scrollW',await page.evaluate(()=>document.documentElement.scrollWidth));
 await page.screenshot({path:'artifacts/fase2-threads/shot-prod-mobile-sin-memory64.png',fullPage:true});
 process.exitCode=e.ok&&e.wasm64Skipped?0:1;
}finally{await browser.close();}
