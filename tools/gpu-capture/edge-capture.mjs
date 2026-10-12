// Step 1: run our existing menu renderer in Edge (WebGPU) under WebGPUReconstruct
// and store: .wgpur capture, per-DRAW readbacks, final image, and a manifest that
// identifies the capture, every operation and every resource by SHA-256.
// usage: node tools/gpu-capture/edge-capture.mjs <label> [--mode main|worker] [--no-capture] [--present] [--fixture <menu-layers.json>]
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {sha256,hashJson,short,readJson,writeJson,png,requireTurn} from './lib.mjs';

const args=process.argv.slice(2),label=args[0];
if(!label||label.startsWith('--'))throw Error('usage: edge-capture.mjs <label> [--mode main|worker] [--no-capture] [--present]');
const mode=args.includes('--mode')?args[args.indexOf('--mode')+1]:'main';
const capture=!args.includes('--no-capture'),present=args.includes('--present');
requireTurn();
const WGPUR='toolchain/gpu-capture/webgpureconstruct-2.1/capture/module/WebGPUReconstruct.js';
// Default: Codex output (read-only). --fixture: e.g. prepare-layers.mjs output for a new capture.
const FIXTURE=args.includes('--fixture')?args[args.indexOf('--fixture')+1]:'artifacts/r5-menu/menu-layers.json';
const out=`artifacts/gpu-capture/runs/${label}`;fs.mkdirSync(out,{recursive:true});
const fixture=readJson(FIXTURE);
const ASSETS=fixture.assetDir||'artifacts/r5-menu';

// Assets served to the page (same files Codex's verify-menu-layers.mjs serves).
const assets=new Map(),resources={};
const names=['system.bin','fetch.bin','float-vs.bin','memory.bin','texture.bin','indices.bin'];
for(const m of fixture.layers)for(const n of names){
 const p=`${ASSETS}/isolated-draw-${m.draw}/${n}`,b=fs.readFileSync(p);
 assets.set(`/${m.draw}/${n}`,b);resources[`${m.draw}/${n}`]={path:p,bytes:b.length,sha256:sha256(b)};
}
const shaders={vert:'B43CF443883B8351',frag:'526B394DE2AB8891'};
for(const [stage,h] of Object.entries(shaders)){
 const p=`artifacts/r4-shaders/wgsl-repacked/shader_${h}.ucode.bin.${stage}.spv.wgsl`,b=fs.readFileSync(p);
 assets.set('/'+stage,b);resources[`shader/${stage}`]={path:p,guestHash:h,bytes:b.length,sha256:sha256(b)};
}
assets.set('/layers.json',Buffer.from(JSON.stringify(fixture.layers)));
const page_dir='tools/gpu-capture/page';
for(const f of ['render-layers.js','driver.js','worker.js'])assets.set('/'+f,fs.readFileSync(path.join(page_dir,f)));
assets.set('/wgpur.js',fs.readFileSync(WGPUR));
assets.set('/',Buffer.from('<!doctype html><style>html,body{margin:0;background:#000}canvas{display:block}</style><canvas width="1280" height="720"></canvas><script type="module" src="/driver.js"></script>'));

const uploads={};
const server=createServer((req,res)=>{
 if(req.method==='POST'&&req.url.startsWith('/upload/')){
  const name=path.basename(req.url.slice(8)),chunks=[];
  req.on('data',c=>chunks.push(c));req.on('end',()=>{const b=Buffer.concat(chunks);fs.writeFileSync(`${out}/${name}`,b);uploads[name]=b.length;res.end('ok');});
  return;
 }
 const b=assets.get(req.url);
 if(!b){res.statusCode=404;return res.end();}
 res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':req.url==='/'?'text/html':'application/octet-stream');
 res.end(b);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={label,mode,capture,present,tool:{webgpureconstruct:'2.1',module:WGPUR,moduleSha256:sha256(fs.readFileSync(WGPUR))},fixture:{path:FIXTURE,sha256:sha256(fs.readFileSync(FIXTURE)),scope:fixture.scope,assetDir:ASSETS,capture:fixture.capture||'artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f'},pageErrors:[],console:[]};
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 report.browser=browser.version();
 const ctx=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:720}});
 const page=await ctx.newPage();
 page.on('pageerror',e=>report.pageErrors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')report.console.push(`${m.type()}: ${m.text()}`.slice(0,400));});
 const dl=capture&&mode==='main'?page.waitForEvent('download',{timeout:120000}):null;
 await page.goto(`http://127.0.0.1:${server.address().port}/`);
 await page.waitForFunction(()=>typeof window.__run==='function');
 const t0=Date.now();
 report.result=await page.evaluate(o=>window.__run(o),{mode,capture,present,perDraw:true});
 report.ms=Date.now()-t0;
 if(dl){const d=await dl;await d.saveAs(`${out}/capture.wgpur`);}
 await ctx.close();
}catch(e){report.error=String(e.stack||e);process.exitCode=1;}
finally{await browser?.close();await new Promise(r=>server.close(r));}

// Identification by hashes.
const W=1280,H=720;
if(!report.error){
 const ops=fixture.layers.map((m,i)=>{
  const state={vs:m.vs,ps:m.ps,indices:m.indices,texture:m.texture,sampler:m.sampler,blend:m.blend,raster:m.raster,depth:m.depth,target:m.target,load:i?'load':'clear'};
  const res=Object.fromEntries(names.map(n=>[n,resources[`${m.draw}/${n}`].sha256]));
  const img=fs.readFileSync(`${out}/draw-${m.draw}.rgba`);
  return {op:i,draw:m.draw,stateHash:hashJson(state),resourceHash:hashJson(res),state,resources:res,image:sha256(img)};
 });
 const final=fs.readFileSync(`${out}/final.rgba`);
 fs.writeFileSync(`${out}/final.png`,png(final,W,H));
 report.final={sha256:sha256(final),png:`${out}/final.png`};
 report.ops=ops;
 report.opsHash=hashJson(ops.map(o=>[o.draw,o.stateHash,o.resourceHash]));
 if(fs.existsSync(`${out}/capture.wgpur`)){const c=fs.readFileSync(`${out}/capture.wgpur`);report.captureFile={path:`${out}/capture.wgpur`,bytes:c.length,sha256:sha256(c),id:short(sha256(c))};}
 report.ok=report.result.errors.length===0&&report.pageErrors.length===0&&(!capture||!!report.captureFile);
 if(!report.ok)process.exitCode=1;
}
report.resources=resources;
writeJson(`${out}/edge-manifest.json`,report);
console.log(JSON.stringify({label,ok:report.ok,error:report.error?.split('\n')[0],browser:report.browser,ms:report.ms,errors:report.result?.errors,pageErrors:report.pageErrors,console:report.console.slice(0,5),final:report.final?.sha256,capture:report.captureFile,adapter:report.result?.adapter}));
