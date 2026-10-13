// Compare the common Bink path against the previously validated native pixels.
import fs from 'node:fs';import {createServer} from 'node:http';import {chromium} from 'playwright';
import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {readSnapshotV1} from '../r5-runtime/snapshot-reader.mjs';
import {createResourceReader,prepareLiveSongDraw} from '../r5-live-song/live-prepare.mjs';
const root='artifacts/r5-bink-video',out=root+'/gpu-check';fs.mkdirSync(out,{recursive:true});
const b=new Uint8Array(fs.readFileSync('artifacts/r5-runtime/snapshot-fixture.bin')),s=readSnapshotV1(b,0,b.length),h=s.header;
const all=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),shaders={};
for(const id of ['57F6448DAC5BEB74','AB008EF1D1A8CB6D']){const q=all[id];shaders[id]={id,constants:q.constants,code:fs.readFileSync(q.wgsl,'utf8')};}
const d={index:h.drawIndex,vs:h.vsHash,ps:h.psHash,issued:true,unsupported:0,primitive:h.primType,indexCount:h.indexCount,indexSource:0,indexEndian:h.indexEndian,registers:new Uint32Array(s.registers.buffer,s.registers.byteOffset,s.registers.length/4).slice(),vertices:[{...s.vertex,status:0}],textures:s.textures.map(t=>({...t,pitch:t.pitchBlocks,status:0,baseDependency:0}))};
const ranges=new Map([[s.vertex.phys+':'+s.vertex.byteLength,s.vertex.data],...s.textures.map(t=>[t.basePhys+':'+t.baseBytes,t.base])]);
const reader=createResourceReader((p,n)=>ranges.get(p+':'+n));reader.begin();const input=prepareLiveSongDraw(d,reader,shaders);
const assets=new Map([['/fixture',Buffer.from(JSON.stringify({manifest:input.manifest,shaders,textures:input.textures.map(t=>({...t,texture:{...t.texture,data:null}})),names:Object.keys(input.assets)}))],['/reference',fs.readFileSync('artifacts/r5-replay/data/native-rgba.bin')]]);
for(const [name,bytes] of Object.entries(input.assets))assets.set('/assets/'+name,bytes);
for(const t of input.textures)assets.set('/planes/'+t.slot,t.texture.data);
const html=`<!doctype html><script type="module">
window.run=async()=>{
 const f=await(await fetch('/fixture')).json(),get=async url=>new Uint8Array(await(await fetch(url)).arrayBuffer());
 const assets=Object.fromEntries(await Promise.all(f.names.map(async n=>[n,await get('/assets/'+n)])));
 const textures=await Promise.all(f.textures.map(async t=>({...t,texture:{...t.texture,data:await get('/planes/'+t.slot)}})));
 const input={manifest:f.manifest,assets,textures},reference=await get('/reference'),results=[];
 for(const mode of ['live','arena']){
  const {createLiveSongRenderer}=await import('/tools/r5-live-song/'+(mode==='live'?'live-renderer':'arena-renderer')+'.mjs');
  const adapter=await navigator.gpu.requestAdapter(),device=await adapter.requestDevice(),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
  const canvas=new OffscreenCanvas(1280,720),ctx=canvas.getContext('webgpu');ctx.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT,alphaMode:'opaque'});
  // Canvas swap textures may be recycled while awaiting GPU completion. Read
  // the renderer's persistent target, never a newly acquired swap texture.
  let target;const createTexture=device.createTexture.bind(device);device.createTexture=q=>{const t=createTexture(q);if(q.format==='rgba8unorm'&&(q.usage&GPUTextureUsage.COPY_SRC))target=t;return t;};
  const renderer=await createLiveSongRenderer(device,f.shaders);
  async function draw(){const gpu=await renderer.render([input],ctx),buffer=device.createBuffer({size:1280*720*4,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ}),e=device.createCommandEncoder();e.copyTextureToBuffer({texture:target},{buffer,bytesPerRow:5120},[1280,720]);device.queue.submit([e.finish()]);await buffer.mapAsync(GPUMapMode.READ);const rgba=new Uint8Array(buffer.getMappedRange()).slice();buffer.unmap();buffer.destroy();let different=0,max=0;for(let i=0;i<rgba.length;i++){const d=Math.abs(rgba[i]-reference[i]);different+=d!==0;max=Math.max(max,d);}return {gpu,different,max};}
  const positive=await draw(),v=new DataView(assets['float-ps.bin'].buffer),old=v.getFloat32(12,true);v.setFloat32(12,old+.125,true);const negative=await draw();v.setFloat32(12,old,true);const restored=await draw();
  const plane=textures.find(t=>t.slot===0).texture.data,originalPlane=plane.slice();plane.fill(0);const changedPlane=await draw();plane.set(originalPlane);const restoredPlane=await draw();
  results.push({mode,positive,negative,restored,changedPlane,restoredPlane,errors});ctx.unconfigure();device.destroy();
 }
 return results;
};</script>`;
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-bink-gpu-'+crypto.randomBytes(6).toString('hex');
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado: replay no ejecutado');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: regresión píxeles Bink, Edge propio (sin arrancar GH3)\nDesde: ${new Date().toISOString()}\nFin: estimado 1 min\n`);
let server,browser,report;
try{
 server=createServer((req,res)=>{res.setHeader('Cross-Origin-Opener-Policy','same-origin');res.setHeader('Cross-Origin-Embedder-Policy','require-corp');if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}if(assets.has(req.url)){res.end(assets.get(req.url));return;}if(['/tools/r5-live-song/live-renderer.mjs','/tools/r5-live-song/arena-renderer.mjs'].includes(req.url)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(req.url.slice(1)));return;}res.writeHead(404).end();});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForFunction(()=>window.run);report=await page.evaluate(()=>run());
 for(const r of report){assert.equal(r.positive.different,0,r.mode+' vs native');assert.equal(r.restored.different,0);assert.ok(r.negative.different>10000);assert.ok(r.changedPlane.different>10000);assert.equal(r.restoredPlane.different,0);assert.equal(r.restoredPlane.gpu.textureUploads,4,'Four GPU planes reused while pixels change');assert.deepEqual(r.errors,[]);assert.equal(r.positive.gpu.accepted,1);}
 console.log(JSON.stringify(report.map(r=>({mode:r.mode,identical:r.positive.different===0,negativeBytes:r.negative.different,restored:r.restored.different,errors:r.errors}))));
}finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes('Reserva: '+token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: replay Bink cerrado\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/verification.json',JSON.stringify(report||{},null,2));}
