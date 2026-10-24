import {createPreviewServer} from './serve.mjs';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({channel:'msedge',headless:true});
const evidence={verifiedAt:new Date().toISOString(),browser:browser.version(),ok:false,cases:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1200,height:960}});
 page.on('pageerror',e=>evidence.errors.push(e.message));
 for(const [button,mode] of [[null,'normal'],['#corrupt','corrupt-upload'],['#timeout','drop-fence'],['#repeat','normal']]){
  if(button)await page.click(button);else await page.goto(url);
  await page.waitForFunction(()=>window.probeFinished,null,{timeout:25000});
  const actual=await page.evaluate(()=>({result:window.probeFinished,images:window.texturePreviews.length,status:document.querySelector('#status').textContent,canvas:document.querySelectorAll('.tile canvas').length}));
  assert.equal(actual.result.mode,mode);assert.equal(actual.images,mode==='normal'?6:3);assert.equal(actual.canvas,actual.images);
  assert.equal(actual.result.ok,mode==='normal');assert.deepEqual(actual.result.errors,[]);
  if(mode==='normal')assert.equal(await page.locator('.badge.ok').count(),6);
  if(mode==='corrupt-upload')assert.equal(await page.locator('.badge.bad').count(),1);
  if(mode==='drop-fence')assert.equal(actual.result.timeoutSequence,3);
  evidence.cases.push({mode,images:actual.images,status:actual.status});
 }
 await page.screenshot({path:'artifacts/graphics-upload/preview.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.screenshot({path:'artifacts/graphics-upload/preview-mobile.png',fullPage:true});
 evidence.responsive390=true;
 await page.setViewportSize({width:1200,height:960});
 await page.click('a[href="/graphics.html"]');
 await page.waitForFunction(()=>window.__graphicsProbe||!document.querySelector('#graphics-restart').hidden,null,{timeout:20000});
 assert.ok(await page.evaluate(()=>!!window.__graphicsProbe),await page.locator('#graphics-status').textContent());
 await page.waitForFunction(()=>window.__graphicsEvidence.frames>5);
 evidence.scene3D=await page.locator('#graphics-status').textContent();
 await page.screenshot({path:'artifacts/graphics-upload/scene-3d.png',fullPage:true});
 for(const path of ['AGENTS.md','CLAUDE.md','original-data/probe/gh3.exe','src/app.js'])assert.equal((await page.request.get(url+path)).status(),404);
 assert.deepEqual(evidence.errors,[]);evidence.ok=true;
 console.log(JSON.stringify(evidence,null,2));
}catch(error){evidence.error=String(error);console.error(error);process.exitCode=1;}
finally{await writeFile('artifacts/graphics-upload/preview-verification.json',JSON.stringify(evidence,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
