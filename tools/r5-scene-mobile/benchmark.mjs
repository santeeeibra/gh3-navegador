// Reuse ONE real song frame, no GH3 restarts. Not a phone or whole-game FPS claim.
import fs from 'node:fs';import path from 'node:path';import {createServer} from 'node:http';import {chromium} from 'playwright';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
import {png} from '../gpu-capture/lib.mjs';
const root='artifacts/r5-scene-mobile',label=process.env.SCENE_BENCH_LABEL||(process.env.SCENE_MOBILE?'renderer-mobile2':'renderer-pc'),out=root+'/runs/'+label;fs.mkdirSync(out,{recursive:true});
const turn='artifacts/PRUEBAS-EN-CURSO.md',token='codex-scene-bench-'+Date.now();
if(process.argv.includes('--wait'))while(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))await new Promise(r=>setTimeout(r,5000));
if(!fs.readFileSync(turn,'utf8').includes('Estado: LIBRE'))throw Error('Turno ocupado, benchmark no ejecutado');
fs.writeFileSync(turn,`Estado: OCUPADO\nQuién: Codex\nReserva: ${token}\nQué: benchmark renderer captura real, ${label}, sin GH3\nDesde: ${new Date().toISOString()}\nFin: estimado 5 min\n`);
let browser,server;const report={label,scope:'renderer-only, same immutable real GH3 song frame; no CPU/audio/guest running',affinity:[],results:[],errors:[]};
const configs=process.env.SCENE_FINAL?[
 {name:'final-bc',fixed:true,arena:true,renderScale:1,textureScale:1,final:true},
 {name:'final-rgba',fixed:true,arena:true,renderScale:1,textureScale:1,forceRGBA:true,final:true},
 {name:'final-half-textures',fixed:true,arena:true,renderScale:1,textureScale:.5,forceRGBA:true,final:true},
 {name:'final-scale75',fixed:true,arena:true,renderScale:.75,textureScale:.5,forceRGBA:true,final:true}
]:[
 {name:'base',fixed:false,arena:false,renderScale:1,textureScale:1},
 {name:'correction',fixed:true,arena:false,renderScale:1,textureScale:1},
 {name:'arena',fixed:true,arena:true,renderScale:1,textureScale:1},
 {name:'resolution-75',fixed:true,arena:true,renderScale:.75,textureScale:1},
 {name:'rgba-full',fixed:true,arena:true,renderScale:1,textureScale:1,forceRGBA:true},
 {name:'rgba-textures-half',fixed:true,arena:true,renderScale:1,textureScale:.5,forceRGBA:true},
 {name:'mobile-combined',fixed:true,arena:true,renderScale:.75,textureScale:.5,forceRGBA:true},
 {name:'mobile-two-flight',fixed:true,arena:true,renderScale:.75,textureScale:.5,forceRGBA:true,inflight:2}
];
try{
 server=createServer((req,res)=>{const u=new URL(req.url,'http://local').pathname;if(u==='/'){res.setHeader('Content-Type','text/html');return res.end('<canvas width="1280" height="720"></canvas>');}
 const file=path.resolve('.'+u);if(!file.startsWith(path.resolve('tools')+path.sep)&&!file.startsWith(path.resolve(root)+path.sep)){res.writeHead(403).end();return;}
 res.setHeader('Cache-Control','max-age=3600');res.setHeader('Content-Type',/\.(mjs|js)$/.test(file)?'text/javascript':'application/octet-stream');fs.createReadStream(file).on('error',()=>res.destroy()).pipe(res);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 browser=await chromium.launchPersistentContext(out+'/edge-profile',{channel:'msedge',headless:true,viewport:{width:1280,height:720}});const page=browser.pages()[0];page.on('pageerror',e=>report.errors.push(e.message));
 if(process.env.SCENE_MOBILE){
  const r=spawnSync('powershell.exe',['-NoProfile','-File','tools/d1-wasm/set-affinity.ps1','-Mask','3','-Pattern',path.resolve(out+'/edge-profile')],{encoding:'utf8',windowsHide:true});report.affinity.push({tool:'set-affinity.ps1',mask:3,stdout:r.stdout,stderr:r.stderr});
  const cdp=await browser.browser().newBrowserCDPSession();for(const p of (await cdp.send('SystemInfo.getProcessInfo')).processInfo){const r=spawnSync('powershell.exe',['-NoProfile','-Command',`$p=Get-Process -Id ${p.id};$p.ProcessorAffinity=[IntPtr]3;[string]$p.Id+':'+[string]$p.ProcessorAffinity`],{encoding:'utf8',windowsHide:true});report.affinity.push({pid:p.id,type:p.type,stdout:r.stdout,stderr:r.stderr});}
 }
 for(const config of configs){
  if(!fs.readFileSync(turn,'utf8').includes(token))throw Error('Reserva cambiada');
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const result=await page.evaluate(async config=>{
   globalThis.__r5Options=config;await import('/tools/r5-scene-mobile/memory.js');
   const module=config.fixed?(config.arena?'renderer.mjs':'renderer-perdraw.mjs'):null;
   const {createLiveSongRenderer}=await import(module?'/tools/r5-scene-mobile/src/'+module:'/tools/r5-live-song/live-renderer.mjs');
   const {sceneTexture}=await import('/tools/r5-scene-mobile/src/texture-policy.mjs');
   const dir='/artifacts/r5-scene-mobile/song-'+(config.fixed?(config.final?'actors':'fixed'):'baseline');
   const f=await(await fetch(dir+'/fixture.json')).json(),allShaders=await(await fetch('/artifacts/r5-scene-mobile/shaders.json')).json(),inputs=[];
   const ids=new Set(f.ops.flatMap(o=>[o.manifest.vs,o.manifest.ps])),shaders=Object.fromEntries(Object.entries(allShaders).filter(([id])=>ids.has(id)));
   const cache=new Map(),get=(p,hash)=>{if(!cache.has(hash))cache.set(hash,fetch(dir+'/'+p).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b)));return cache.get(hash);};
   // Read unique immutable blobs once, batch independent loads. No guest reads.
   for(let base=0;base<f.ops.length;base+=8)await Promise.all(f.ops.slice(base,base+8).map(async o=>{
    const assets=Object.fromEntries(await Promise.all(Object.entries(o.assets).map(async([k,a])=>[k,await get(a.file,a.sha256)])));
    const textures=await Promise.all(o.textures.map(async t=>({...t,texture:{...t.texture,data:await get(t.texture.file,t.texture.sha256)}})));
    inputs[o.manifest.draw]={manifest:o.manifest,assets,textures};
   }));
   const compact=inputs.filter(Boolean);inputs.length=0;inputs.push(...compact);
   const adapter=await navigator.gpu.requestAdapter(),bc=adapter.features.has('texture-compression-bc')&&!config.forceRGBA;
   const device=await adapter.requestDevice({requiredFeatures:bc?['texture-compression-bc']:[]}),errors=[];device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
   const n=config.inflight||1,renderers=[],contexts=[],targets=[];const create=device.createTexture.bind(device);let rendererIndex=0;
   device.createTexture=d=>{const t=create(d);if(d.format==='rgba8unorm'&&(d.usage&GPUTextureUsage.RENDER_ATTACHMENT)&&(d.usage&GPUTextureUsage.COPY_SRC))targets[rendererIndex]=t;return t;};
   for(let i=0;i<n;i++){rendererIndex=i;const canvas=i?new OffscreenCanvas(1280,720):document.querySelector('canvas');const ctx=canvas.getContext('webgpu');ctx.configure({device,format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST,alphaMode:'opaque'});contexts.push(ctx);renderers.push(await createLiveSongRenderer(device,shaders,{prepareTexture:t=>sceneTexture(t,bc)}));}
   const render=()=>Promise.all(renderers.map((r,i)=>r.render(inputs,contexts[i])));let last;
   for(let i=0;i<8;i++)last=await render();
   const start=performance.now(),samples=[];let frames=0;
   while(performance.now()-start<8000){const t=performance.now();last=await render();frames+=n;samples.push(performance.now()-t);}
   const elapsed=performance.now()-start,memory={...globalThis.__sceneMemory};
   const target=targets[0],w=target.width,h=target.height,row=Math.ceil(w*4/256)*256,read=device.createBuffer({size:row*h,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});const e=device.createCommandEncoder();e.copyTextureToBuffer({texture:target},{buffer:read,bytesPerRow:row},[w,h]);device.queue.submit([e.finish()]);await read.mapAsync(GPUMapMode.READ);const raw=new Uint8Array(read.getMappedRange()),rgba=new Uint8Array(w*h*4);for(let y=0;y<h;y++)rgba.set(raw.subarray(y*row,y*row+w*4),y*w*4);read.unmap();read.destroy();
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',rgba))].map(n=>n.toString(16).padStart(2,'0')).join('');samples.sort((a,b)=>a-b);device.destroy();return {config,frames,elapsedMs:elapsed,fps:frames*1000/elapsed,p50Ms:samples[Math.floor(samples.length*.5)],p95Ms:samples[Math.floor(samples.length*.95)],memory,last:last.map(r=>({accepted:r.accepted,rejected:r.rejected,bufferBuilds:r.bufferBuilds})),errors,availableFeatures:[...adapter.features],width:w,height:h,rgba:Array.from(rgba),imageHash:hash};
  },config);
  fs.writeFileSync(out+'/'+config.name+'.png',png(new Uint8Array(result.rgba),result.width,result.height));delete result.rgba;report.results.push(result);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,1));console.log(JSON.stringify({name:config.name,fps:result.fps,memory:result.memory,errors:result.errors}));
 }
 report.ok=report.errors.length===0&&report.results.every(r=>r.errors.length===0&&r.last.every(s=>!Object.keys(s.rejected).length));
}catch(e){report.error=e.stack;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));if(fs.readFileSync(turn,'utf8').includes(token))fs.writeFileSync(turn,`Estado: LIBRE\nQuién: Codex\nQué: ${label} terminado, procesos propios cerrados\nFin: ${new Date().toISOString()}\n`);fs.writeFileSync(out+'/verification.json',JSON.stringify(report,null,1));}
console.log(JSON.stringify({label,ok:report.ok,error:report.error}));
