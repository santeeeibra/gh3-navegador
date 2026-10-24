import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { createFeedbackHandler } from '../tools/analytics/supabase/gh3-feedback/handler.js';
import { buildFeedback } from '../tools/analytics/supabase/gh3-analytics-dashboard/feedback.js';

const root=path.resolve('artifacts/feedback/demo');
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/gh3/gh3-feedback.js" defer></script><script src="/gh3/gh3-input.js" defer></script></head><body><div id="loaderPanel"></div><div id="gh3Panel"></div></body></html>`;
const server=http.createServer((req,res)=>{
  if(req.url==='/fixture'){res.writeHead(200,{'content-type':'text/html;charset=utf-8'}).end(fixture);return;}
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname),relative=pathname.replace(/^\/gh3\//,'')||'index.html';
  const file=path.resolve(root,relative==='/'?'index.html':relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404).end();return;}
  const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.png':'image/png','.json':'application/json','.wasm':'application/wasm','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
  res.writeHead(200,{'content-type':mime,'cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp'});fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  for(const [name,viewport] of [['desktop',{width:1440,height:1100}],['mobile',{width:390,height:844}]]){
    const page=await browser.newPage({viewport});await page.emulateMedia({reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://nvlwlmyuqorxaupcdbdb.supabase.co/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{}'}));
    // Real staged GH3 page, before touching Jugar: no engine or game data fetched.
    if(!process.argv.includes('--fixture-only')){
    await page.goto(origin+'/gh3/',{waitUntil:'networkidle'});
    const button=page.locator('#loaderPanel .gh3FeedbackOpen');await button.waitFor({state:'visible'});await button.click();
    await page.locator('#gh3FeedbackRating').selectOption('3');await page.locator('#gh3FeedbackCategory').selectOption('performance');
    await page.locator('#gh3FeedbackMessage').fill('En mi celular tarda en cargar y a veces el sonido se corta.');await page.locator('#gh3FeedbackNickname').fill('Nico');
    assert.equal(await page.locator('#gh3Feedback').isVisible(),true);
    assert.equal(await page.locator('#gh3Feedback').evaluate(node=>node.scrollWidth>node.clientWidth),false);
    await page.screenshot({path:`artifacts/feedback/formulario-${name}.png`});
    await page.locator('#gh3FeedbackClose').click();
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`artifacts/feedback/boton-${name}.png`});
    }

    await page.goto(origin+'/fixture',{waitUntil:'networkidle'});
    let result='stored',requests=0;const saved=[],ids=[];
    const handler=createFeedbackHandler({bucket:async()=> 'bucket',store:async data=>{requests++;ids.push(data.request_id);if(result==='fail')throw new Error('offline');if(result==='stored')saved.push({...data,created_at:new Date().toISOString()});return result;}});
    await page.route('**/functions/v1/gh3-feedback',async route=>{
      const req=route.request();const reply=await handler(new Request(req.url(),{method:req.method(),headers:{origin:'https://lasvegasherogame.com'},body:req.postData()}));
      console.log(`${name} ${req.method()} feedback ${reply.status} (${result})`);
      await route.fulfill({status:reply.status,headers:{...Object.fromEntries(reply.headers),'access-control-allow-origin':origin},body:await reply.text()});
    });
    await page.locator('#loaderPanel .gh3FeedbackOpen').click();
    // Required rating prevents a submission; typing bound game keys leaves game input unchanged.
    await page.locator('#gh3FeedbackForm [type=submit]').click();assert.equal(requests,0);
    await page.locator('#gh3FeedbackRating').selectOption('2');await page.locator('#gh3FeedbackCategory').selectOption('audio');
    await page.locator('#gh3FeedbackMessage').pressSequentially('asdfg');await page.locator('#gh3FeedbackMessage').press('Enter');await page.locator('#gh3FeedbackMessage').pressSequentially('se corta');
    assert.equal(await page.evaluate(()=>window.gh3Input.stats.buttons),0);
    result='fail';await page.locator('#gh3FeedbackForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#gh3FeedbackStatus').textContent.includes('No se pudo enviar'));
    assert.match(await page.locator('#gh3FeedbackMessage').inputValue(),/se corta/);
    result='limited';await page.locator('#gh3FeedbackForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#gh3FeedbackStatus').textContent.includes('Esperá'),null,{timeout:5000}).catch(async error=>{console.log({requests,status:await page.locator('#gh3FeedbackStatus').textContent(),form:await page.locator('#gh3FeedbackRating').inputValue()});throw error;});
    result='stored';await page.locator('#gh3FeedbackForm [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#gh3FeedbackStatus').textContent.includes('recibió'));
    assert.equal(saved.length,1);assert.equal(new Set(ids).size,1,'Retry preserves idempotency key');assert.equal(await page.locator('#gh3FeedbackMessage').inputValue(),'');
    const report=buildFeedback(saved,30);assert.equal(report.average,2);assert.match(report.recent[0].message,/se corta/);assert.equal(report.total,1);
    await page.locator('#gh3FeedbackClose').click();assert.equal(await page.locator('#loaderPanel .gh3FeedbackOpen').evaluate(node=>node===document.activeElement),true);
    await page.locator('#gh3Panel .gh3FeedbackOpen').click();assert.equal(await page.locator('#gh3Feedback').isVisible(),true);
    assert.deepEqual(errors,[]);await page.close();
    console.log(`PASS ${name}: GH3 real page + comments/rating, keyboard isolation, failure/retry/rate limit, private report, no page errors.`);
  }
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
