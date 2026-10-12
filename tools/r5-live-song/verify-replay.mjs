import fs from 'node:fs';
import http from 'node:http';
import {chromium} from 'playwright';
const out='artifacts/r5-live-song/replay',turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-song-replay-'+Date.now();
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Test turn occupied');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: replay gráfico corto Slow Ride\n`);
let browser,server;const report={errors:[],results:[]};
try{
 server=http.createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<canvas width="1280" height="720"></canvas><script type="module">import {createSongRenderer} from "/renderer.mjs";const f=await(await fetch("/fixture.json")).json();const adapter=await navigator.gpu.requestAdapter();const device=await adapter.requestDevice({requiredFeatures:["texture-compression-bc"]});device.addEventListener("uncapturederror",e=>(window.errors??=[]).push(e.error.message));const renderer=await createSongRenderer(device,f.shaders),c=document.querySelector("canvas").getContext("webgpu");c.configure({device,format:"rgba8unorm",usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});window.run=async id=>{const inputs=f.inputs.filter(i=>!id||i.manifest.vs===id).map(i=>({...i,assets:Object.fromEntries(Object.entries(i.assets).map(([k,v])=>[k,new Uint8Array(v)]))}));return renderer.render(inputs,{context:c});};window.ready=true;</script>');return;}
  const file=req.url==='/renderer.mjs'?'tools/r5-live-song/renderer.mjs':req.url==='/fixture.json'?out+'/fixture.json':null;
  if(!file){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.json')?'application/json':'text/javascript');res.end(fs.readFileSync(file));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1300,height:750}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.ready,{timeout:30000});
 for(const id of ['94B97981B512BDA2','80708BD1B82638B0','87D4CAE67E72C501','B43CF443883B8351',null]){const result=await page.evaluate(id=>window.run(id),id);await page.locator('canvas').screenshot({path:out+'/'+(id||'combined')+'.png'});report.results.push({id,...result});}
 report.errors.push(...await page.evaluate(()=>window.errors||[]));report.ok=!report.errors.length;
}catch(e){report.errors.push(e.stack);report.ok=false;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: replay Slow Ride terminado\n`);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
