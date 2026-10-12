import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const root=path.resolve('artifacts/browser-play/demo'),out='artifacts/browser-play/check-'+Date.now();fs.mkdirSync(out,{recursive:true});
const report={errors:[],chunkRequests:0,workerURLs:[],checks:[]},types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
const server=http.createServer((req,res)=>{for(const [k,v] of Object.entries({'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'}))res.setHeader(k,v);const p=new URL(req.url,'http://127.0.0.1').pathname;
 if(!p.startsWith('/gh3/')){res.writeHead(404).end();return;}const name=p==='/gh3/'?'index.html':p.slice(5),file=path.resolve(root,name);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 if(name.startsWith('chunks/'))report.chunkRequests++;res.setHeader('Content-Type',types[path.extname(name)]||'application/octet-stream');res.setHeader('Content-Length',fs.statSync(file).size);fs.createReadStream(file).pipe(res);
});await new Promise(r=>server.listen(5485,'127.0.0.1',r));let ctx;
try{
 ctx=await chromium.launchPersistentContext(out+'/profile',{channel:'msedge',headless:true,viewport:{width:896,height:414},hasTouch:true,isMobile:true});
 await ctx.addInitScript(()=>{const Original=window.Worker;window.testWorkers=[];window.Worker=function(url){testWorkers.push(String(url));const w=new Original(URL.createObjectURL(new Blob(['onmessage=()=>{}'],{type:'text/javascript'})));return w;};});
 let page=ctx.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5485/gh3/');await page.waitForFunction(()=>window.gh3Loader&&!document.getElementById('loaderPlay').disabled);
 assert.equal(report.chunkRequests,0);assert.equal(await page.locator('#loaderPrepare').isVisible(),false);assert.equal(await page.locator('input[type=file]').isVisible(),false);report.checks.push('one-play-button-no-picker-no-data-before-click');
 await page.click('#loaderPlay');await page.waitForFunction(()=>window.testWorkers.length>0||window.gh3Loader.error,{},{timeout:240000});report.first=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,stats:gh3Loader.stats,workers:testWorkers,isolated:crossOriginIsolated}));assert.equal(report.first.error,null);assert.equal(report.first.ready,true);assert.equal(report.first.isolated,true);assert.ok(report.first.workers.some(u=>u.startsWith('gh3-web.js?')));assert.ok(report.chunkRequests>0);report.checks.push('one-click-prepares-and-launches-with-integrity');
 const firstRequests=report.chunkRequests;await page.screenshot({path:out+'/preparation.png',fullPage:true});
 await ctx.close();ctx=await chromium.launchPersistentContext(out+'/profile',{channel:'msedge',headless:true,viewport:{width:896,height:414},hasTouch:true,isMobile:true});await ctx.addInitScript(()=>{window.Worker=function(){return {addEventListener(){},postMessage(){},terminate(){}};};});page=ctx.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));await page.goto('http://127.0.0.1:5485/gh3/');await page.waitForFunction(()=>window.gh3Loader?.ready||window.gh3Loader?.error,{},{timeout:240000});report.second=await page.evaluate(()=>({ready:gh3Loader.ready,error:gh3Loader.error,stats:gh3Loader.stats}));assert.equal(report.second.ready,true);assert.equal(report.second.error,null);assert.equal(report.chunkRequests,firstRequests);report.checks.push('reopen-reuses-parts-no-new-chunk-transfers');assert.deepEqual(report.errors,[]);report.ok=true;
}catch(e){report.ok=false;report.error=e.stack;process.exitCode=1;}
finally{await ctx?.close();await new Promise(r=>server.close(r));fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify({out,...report}));
