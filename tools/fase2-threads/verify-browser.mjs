import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(process.env.BASE_URL||'http://localhost:5174');
 if(!response.ok())throw Error(`HTTP ${response.status()}`);
 for(const v of ['ok32','ok64','nosafepoint32']){
  await page.click(`button[data-v="${v}"]`);
  await page.waitForFunction(v=>window.__last?.variant===v,v,{timeout:35000});
  const r=await page.evaluate(()=>window.__last);
  console.log(`${v}: ${r.unsupported?'NO SOPORTADO ':''}${r.pass}/${r.pass+r.fail}, ${r.ms} ms, esperado=${r.expectedOutcome}, error=${r.error||''}`);
 }
 const evidence=await page.evaluate(()=>window.__phase2);
 evidence.browser=browser.version();evidence.pageErrors.push(...errors);evidence.ok&&=!errors.length;
 await page.screenshot({path:process.env.OUT_SHOT||'artifacts/fase2-threads/shot-edge.png',fullPage:true});
 await writeFile(process.env.OUT_JSON||'artifacts/fase2-threads/edge-browser-verification.json',JSON.stringify(evidence,null,2));
 process.exitCode=evidence.ok?0:1;
}finally{await browser.close();}
