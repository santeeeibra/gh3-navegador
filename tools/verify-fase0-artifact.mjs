import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const browser = await chromium.launch({channel:'msedge',headless:true});
const evidence = {source:'Fase 0 GH3 Web.html', results:[], pageErrors:[]};
try {
 for (const bits of [32,64]) {
  const page = await browser.newPage();
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  await page.route('https://**/*',route=>route.abort());
  await page.goto(pathToFileURL('D:/guitar hero/artifacts/fase0/Fase 0 GH3 Web.html').href);
  await page.click('#b'+bits);
  await page.waitForFunction(()=>!document.querySelector('#b32').disabled);
  const result = await page.evaluate(()=>({pass:document.querySelector('#s-pass').textContent,fail:document.querySelector('#s-fail').textContent,log:document.querySelector('#log').textContent}));
  evidence.results.push({bits,...result});
  assert.equal(result.pass,'1458');assert.equal(result.fail,'0');
  await page.close();
 }
 assert.deepEqual(evidence.pageErrors,[]);
 evidence.verifiedAt=new Date().toISOString();
 await writeFile('artifacts/fase0/local-browser-verification.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence,null,2));
} finally { await browser.close(); }