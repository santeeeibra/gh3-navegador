// Production smoke test. Use locally verified chunks and a fake main Worker
// to avoid a second large download and interfering with Santi playing on PC.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base='https://riff-duel.vercel.app',out='artifacts/browser-play/public-check-'+Date.now();fs.mkdirSync(out,{recursive:true});
const report={url:base+'/gh3/',errors:[],heads:[],localChunks:0,actualGameExecuted:false};let browser;
try{
 const manifest=JSON.parse(fs.readFileSync('artifacts/browser-play/demo/manifest.json'));
 const sample=manifest.files[manifest.packages.slowride.files[0]].chunks[0];
 for(const p of ['/gh3/','/gh3/gh3-web.wasm','/gh3/gh3-web.js','/gh3/chunks/'+sample.hash,'/fase2/','/']){
  const r=await fetch(base+p,{method:'HEAD',headers:{'Accept-Encoding':'identity'}});report.heads.push({path:p,status:r.status,bytes:r.headers.get('content-length'),type:r.headers.get('content-type'),coop:r.headers.get('cross-origin-opener-policy'),coep:r.headers.get('cross-origin-embedder-policy')});assert.equal(r.status,200);if(p.startsWith('/gh3/'))assert.equal(r.headers.get('cross-origin-embedder-policy'),'require-corp');
 }
 const range=await fetch(base+'/gh3/chunks/'+sample.hash,{headers:{Range:'bytes=0-511','Accept-Encoding':'identity'}});const reader=range.body.getReader(),first=await reader.read();await reader.cancel();const local=fs.readFileSync('artifacts/browser-play/demo/chunks/'+sample.hash);assert.ok(first.value.length>=Math.min(512,local.length));assert.deepEqual([...first.value.slice(0,512)],[...local.subarray(0,512)]);report.remoteChunkSample=true;
 browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:896,height:414},hasTouch:true,isMobile:true});
 await context.route('**/gh3/chunks/*',async route=>{const hash=new URL(route.request().url()).pathname.split('/').at(-1);if(!/^[a-f0-9]{64}$/.test(hash))throw Error('Hash inválido.');report.localChunks++;await route.fulfill({path:path.resolve('artifacts/browser-play/demo/chunks/'+hash),contentType:'application/octet-stream'});});
 await context.addInitScript(()=>{const Native=window.Worker;window.testWorkers=[];window.Worker=function(url){testWorkers.push(String(url));return new Native(URL.createObjectURL(new Blob(['onmessage=()=>{}'],{type:'text/javascript'})));};});
 const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(report.url);await page.waitForFunction(()=>window.gh3Loader&&!document.getElementById('loaderPlay').disabled,{},{timeout:30000});assert.equal(await page.locator('#loaderPrepare').isVisible(),false);await page.click('#loaderPlay');await page.waitForFunction(()=>window.testWorkers.length||window.gh3Loader.error,{},{timeout:240000});
 report.preparation=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,stats:gh3Loader.stats,workers:testWorkers,isolated:crossOriginIsolated,diag:!!window.gh3Diag,touch:!!window.gh3Touch}));
 assert.equal(report.preparation.ready,true);assert.equal(report.preparation.error,null);assert.equal(report.preparation.isolated,true);assert.equal(report.preparation.diag,true);assert.equal(report.preparation.touch,true);assert.deepEqual(report.errors,[]);report.ok=true;
 await page.screenshot({path:out+'/one-click.png',fullPage:true});
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,...report}));
