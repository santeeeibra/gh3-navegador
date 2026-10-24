import {createServer} from 'node:http';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// Allowlisted server: never serves commercial game data or project documentation.
const html = `<!doctype html><meta charset="utf-8"><title>Texture upload pthread probe</title>
<p>Prueba técnica de texturas propias; no ejecuta GH3.</p><script src="/build/probe.js"></script><script>
window.probeFinished=null;
createGraphicsUploadProbe({arguments:[new URLSearchParams(location.search).get('mode')||'normal'],
 onProbeResult:json=>window.probeFinished=JSON.parse(json),
 onAbort:error=>window.probeFinished={ok:false,errors:[String(error)]}
}).catch(error=>window.probeFinished={ok:false,errors:[String(error)]});
</script>`;
const server=createServer(async(req,res)=>{
 res.setHeader('Cross-Origin-Opener-Policy','same-origin');
 res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
 res.setHeader('Cache-Control','no-store');
 const path=new URL(req.url,'http://localhost').pathname;
 try {
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end(html);}
  else if(path==='/texture-upload.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile('src/original/graphics/texture-upload.js'));}
  else if(/^\/build\/probe\.(js|wasm)$/.test(path)){
   res.setHeader('Content-Type',path.endsWith('.wasm')?'application/wasm':'text/javascript');
   res.end(await readFile('artifacts/graphics-upload'+path));
  } else res.writeHead(404).end();
 } catch {res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const evidence={verifiedAt:new Date().toISOString(),integration:'Two actual Emscripten pthreads; synthetic linear RGBA8; no rexglue or GH3',
 ok:false,results:[],pageErrors:[],consoleErrors:[]};
let browser;
try {
 browser=await chromium.launch({channel:'msedge',headless:true});
 evidence.browser=browser.version();
 for(const mode of ['normal','corrupt-upload','drop-fence','normal']){
  const page=await browser.newPage();
  page.on('pageerror',e=>evidence.pageErrors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text());});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
  const isolation=await page.evaluate(()=>({isolated:crossOriginIsolated,sab:typeof SharedArrayBuffer!=='undefined'}));
  assert.equal(isolation.isolated,true);assert.equal(isolation.sab,true);
  await page.waitForFunction(()=>window.probeFinished,null,{timeout:25000});
  const r=await page.evaluate(()=>window.probeFinished);
  evidence.results.push({isolation,...r});
  assert.equal(r.mode,mode);assert.equal(r.gpuWorker,true);assert.equal(r.producerWorker,true);
  assert.equal(r.producerDone,true);assert.ok(r.blockingWaits>=1);assert.deepEqual(r.errors,[]);
  assert.deepEqual(r.invalidDescriptors,[true,true,true,true]);assert.equal(r.uploadTimeoutDetected,true);
  assert.deepEqual(r.cases.map(c=>c.seq),Array.from({length:mode==='normal'?6:3},(_,i)=>i+1));
  for(const c of r.cases){assert.equal(c.bytesChecked,c.width*c.height*4);assert.equal(c.readPitch%256,0);}
  if(mode==='normal'){
   assert.equal(r.ok,true);assert.equal(r.completed,6);assert.equal(r.lastFence,6);assert.equal(r.timeoutSequence,0);
   assert.ok(r.cases.every(c=>c.mismatches===0));
  } else if(mode==='corrupt-upload'){
   assert.equal(r.ok,false);assert.equal(r.completed,2);assert.equal(r.lastFence,3);assert.equal(r.timeoutSequence,0);
   assert.deepEqual(r.invalidDescriptors,[true,true,true,true]);assert.equal(r.uploadTimeoutDetected,true);
  assert.deepEqual(r.cases.map(c=>c.mismatches),[0,0,1]);
  } else {
   assert.equal(r.ok,false);assert.equal(r.completed,2);assert.equal(r.lastFence,2);assert.equal(r.timeoutSequence,3);
   assert.ok(r.cases.every(c=>c.mismatches===0));
  }
  console.log(mode+': '+r.completed+' completed; fence '+r.lastFence+'; timeout '+r.timeoutSequence);
  await page.close();
 }
 assert.deepEqual(evidence.pageErrors,[]);assert.deepEqual(evidence.consoleErrors,[]);
 evidence.ok=true;
} catch(error) {evidence.error=String(error);console.error(error);process.exitCode=1;}
finally {
 await mkdir('artifacts/graphics-upload',{recursive:true});
 await writeFile('artifacts/graphics-upload/verification.json',JSON.stringify(evidence,null,2));
 await browser?.close();await new Promise(resolve=>server.close(resolve));
}


