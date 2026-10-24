import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const html=`<!doctype html><meta charset="utf-8"><title>WebGPU pthread probe</title><p>Prueba técnica de worker, no GH3</p><script src="/build/probe.js"></script><script>
window.probeFinished=null;
createGraphicsWorkerProbe({onProbeResult:json=>{window.probeFinished=JSON.parse(json);},onAbort:error=>{window.probeFinished={ok:false,error:String(error)};}}).catch(error=>{window.probeFinished={ok:false,error:String(error)};});
</script>`;
const server=createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');res.setHeader('Cache-Control','no-store');
 const path=new URL(req.url,'http://localhost').pathname;
 try{if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);}else if(/^\/build\/probe\.(js|wasm)$/.test(path)){res.setHeader('Content-Type',path.endsWith('.wasm')?'application/wasm':'text/javascript');res.end(await readFile('artifacts/graphics-worker'+path));}else res.writeHead(404).end();}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'msedge',headless:true});
const evidence={browser:browser.version(),verifiedAt:new Date().toISOString(),integration:'Emscripten pthread + asynchronous callback, no rexglue linkage',ok:false,pageErrors:[]};
try{
 const page=await browser.newPage();page.on('console',m=>console.log('BROWSER',m.type(),m.text()));page.on('pageerror',e=>evidence.pageErrors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 evidence.isolation=await page.evaluate(()=>({isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer!=='undefined'}));
 await page.waitForFunction(()=>window.probeFinished,{},{timeout:25000});
 evidence.result=await page.evaluate(()=>window.probeFinished);
 assert.equal(evidence.result.ok,true,JSON.stringify(evidence.result));assert.deepEqual(evidence.pageErrors,[]);evidence.ok=true;
 console.log(JSON.stringify(evidence,null,2));
}catch(e){evidence.error=String(e);console.error(e);process.exitCode=1;}finally{await writeFile('artifacts/graphics-worker/verification.json',JSON.stringify(evidence,null,2));await browser.close();await new Promise(resolve=>server.close(resolve));}
