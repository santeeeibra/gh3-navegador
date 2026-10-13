import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root='artifacts/r5-scene-mobile';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const game=[];
for(const label of ['diagnostic-pc','baseline-mobile2','final-pc','final-mobile2','final-mobile2-light']){
 const file=root+'/runs/'+label+'/verification.json',r=read(file);
 const s=(r.samples||[]).filter(x=>x.clock>=15000&&x.clock<=45000),a=s[0],b=s.at(-1);
 const memory=x=>x.renderer?.gpuMemory||x.renderer?.gpu?.gpuMemory;
 const m=s.map(memory).filter(Boolean);
 game.push({label,file,ok:r.ok,error:r.error||null,pageErrors:r.pageErrors,
  wallMs:a&&b?b.wall-a.wall:null,frames:a&&b?b.presented-a.presented:null,
  fps:a&&b?(b.presented-a.presented)*1000/(b.wall-a.wall):null,
  windowGuestMs:a&&b?[a.clock,b.clock]:null,
  maxExplicitAllocationBytes:m.length?Math.max(...m.map(x=>x.textureBytes+x.bufferBytes)):null,
  maxTextureBytes:m.length?Math.max(...m.map(x=>x.textureBytes)):null,
  maxBufferBytes:m.length?Math.max(...m.map(x=>x.bufferBytes)):null,
  gpuErrors:b?.renderer?.gpu?.gpuErrors||0,audioUnderruns:b?.audio?.underruns??null,
  lastClock:r.samples?.at(-1)?.clock,finalClock:r.final?.clock,
  strums:r.final?.bot?.strums,affinity:r.affinity||[]});
}
const renderer=[];
for(const label of ['renderer-pc','renderer-mobile2','actors-renderer-mobile2']){
 const file=root+'/runs/'+label+'/verification.json';if(!fs.existsSync(file))continue;
 const r=read(file);renderer.push({label,file,scope:r.scope,ok:r.ok,results:(r.results||[]).map(x=>({name:x.config.name,fps:x.fps,
  allocationBytes:x.memory.textureBytes+x.memory.bufferBytes,textureBytes:x.memory.textureBytes,
  bufferBytes:x.memory.bufferBytes,width:x.width,height:x.height,hash:x.imageHash,last:x.last,errors:x.errors}))});
}
const initial=read(root+'/base-integrity.json'),files=['r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js','r5snap-song-gpu.js'];
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const integrity={base:initial.base,delivery:files.map(file=>({file,sha256:sha(root+'/demo/'+file)})),
 ownUnchanged:Object.keys(initial.files).filter(file=>!files.includes(file)).map(file=>({file,sha256:sha(root+'/demo/'+file),matchesInitial:sha(root+'/demo/'+file)===initial.files[file].sha256})),
 activeBaseDifferences:Object.keys(initial.files).filter(file=>sha(initial.base+'/'+file)!==initial.files[file].sha256)};
const out={scope:'Partial original GH3 rendering, not a completed full port or online game',
 memoryDefinition:'Estimated explicit WebGPU texture + buffer allocations. Excludes driver overhead, presentation surfaces and wasm RAM. Not physical GPU telemetry.',
 mobileDefinition:'Edge on PC, all own Chromium processes pinned to two logical CPUs (mask 3). Not physical iOS.',game,renderer,integrity};
fs.writeFileSync(root+'/summary.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({game:game.map(({label,fps,maxExplicitAllocationBytes,error})=>({label,fps,MiB:maxExplicitAllocationBytes/1048576,error})),renderer:renderer.map(r=>({label:r.label,ok:r.ok,results:r.results.map(({name,fps,allocationBytes})=>({name,fps,MiB:allocationBytes/1048576}))})),unchanged:integrity.ownUnchanged.filter(x=>!x.matchesInitial),activeBaseDifferences:integrity.activeBaseDifferences},null,1));
