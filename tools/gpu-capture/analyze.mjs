// Step 3: compare images of the same frame (Edge vs native replays), classify every
// operation, check regressions against validated cases, store unknown cases with
// context + resources, and write a short report for Codex.
// usage: node tools/gpu-capture/analyze.mjs <label> [--accept-baseline] [--run-dir <dir>]
//
// Classes (never inferred from "looks similar"):
//  capture-error        tool failed, op missing/mis-mapped in replay, frame count wrong
//  resource-incomplete  preparation lacks guest bytes required by the layout
//  translation          shader/state not supported or rejected by our translation path
//  backend-divergence   same op, same API (D3D12) replay differs from Edge beyond precision
//  color-precision      small per-channel deltas between backends (reported, NOT validated)
//  replay-consistent    Edge readback == D3D12 replay bytes (capture/replay chain consistent;
//                       says nothing about fidelity to the console)
import fs from 'node:fs';
import path from 'node:path';
import {sha256,hashJson,short,readJson,writeJson,png,compareRgba,diffImage} from './lib.mjs';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {prepareTextureBase} from '../r5-menu/texture-layout.mjs';

const args=process.argv.slice(2),label=args[0];
const acceptBaseline=args.includes('--accept-baseline');
const run=args.includes('--run-dir')?args[args.indexOf('--run-dir')+1]:`artifacts/gpu-capture/runs/${label}`;
const KNOWN='tools/gpu-capture/known-cases.json';
const CASES=args.includes('--cases-dir')?args[args.indexOf('--cases-dir')+1]:'artifacts/gpu-capture/cases';
const PRECISION_MAX=4; // per-channel /255; above this a backend diff is not "precision"
const W=1280,H=720;
const known=fs.existsSync(KNOWN)?readJson(KNOWN):{version:1,cases:{}};
const edge=readJson(`${run}/edge-manifest.json`);
const native=fs.existsSync(`${run}/replay-native.json`)?readJson(`${run}/replay-native.json`):{steps:{}};
const fixture=readJson(edge.fixture.path);
const cases=[],checks=[];
const addCase=c=>{c.key=hashJson({class:c.class,draw:c.draw??null,stateHash:c.stateHash??null,resourceHash:c.resourceHash??null,reason:c.reasonKey??c.reason??null});cases.push(c);return c;};

// --- 1. tool/capture health -------------------------------------------------
if(edge.captureFile?.sha256&&edge.fixture.sha256!==sha256(fs.readFileSync(edge.fixture.path)))
 addCase({class:'capture-error',reason:'fixture changed since capture (menu-layers.json hash differs)'});
for(const [k,s] of Object.entries(native.steps)){
 if(k.startsWith('dawn-')){
  checks.push({check:k,status:s.status,frames:s.frames});
  if(s.status!==0)addCase({class:'capture-error',reason:`${k} replay exit ${s.status}`,reasonKey:k+'-exit'});
  if(edge.present&&s.frames!=='2')addCase({class:'capture-error',reason:`${k} replayed ${s.frames} frames, expected 2 (warmup+draws)`,reasonKey:k+'-frames'});
 }
}

// --- 2. per-op comparison Edge vs RenderDoc(D3D12 replay) --------------------
const rd=fs.existsSync(`${run}/rdoc/rdoc-state.json`)?readJson(`${run}/rdoc/rdoc-state.json`):null;
const opResults=[];
if(rd){
 const targetActs=rd.actions.filter(a=>a.target?.name==='Dawn_InternalTexture_target');
 checks.push({check:'rdoc-draw-count',replay:targetActs.length,expected:edge.ops.length,ok:targetActs.length===edge.ops.length});
 if(targetActs.length!==edge.ops.length)addCase({class:'capture-error',reason:`RenderDoc frame has ${targetActs.length} draws on target, Edge ran ${edge.ops.length}`,reasonKey:'rdoc-count'});
 // Images are cumulative (each readback includes every earlier layer), so an op is only
 // comparable with a validated case when the whole ordered prefix of ops is identical.
 const prefix=[];
 for(const [i,op] of edge.ops.entries()){
  const a=targetActs[i];
  prefix.push([op.draw,op.stateHash,op.resourceHash]);
  const r={op:i,draw:op.draw,stateHash:op.stateHash,resourceHash:op.resourceHash,prefixHash:hashJson(prefix),edgeImage:op.image};
  if(!a){r.class='capture-error';opResults.push(r);continue;}
  // Identity by label: the bound texture must be this op's texture.
  const tex=a.pixelReadOnly?.map(x=>x.name)||[];
  r.mappingOk=tex.includes(`Dawn_InternalTexture_${op.draw}/texture`)&&a.numIndices===fixture.layers[i].indices;
  const rb=fs.readFileSync(`${run}/rdoc/draw-${String(a.index).padStart(3,'0')}.rgba`);
  r.d3d12Image=sha256(rb);
  const eb=fs.readFileSync(`${run}/draw-${op.draw}.rgba`);
  r.cmp=compareRgba(eb,rb,W,H);
  r.rdoc={eventId:a.eventId,blend:a.blends?.[0],viewport:a.viewport,shaders:a.shaders};
  if(!r.mappingOk){r.class='capture-error';addCase({class:'capture-error',draw:op.draw,stateHash:op.stateHash,resourceHash:op.resourceHash,reason:`replay op ${i} bound ${tex.join(',')} (expected ${op.draw}/texture)`,reasonKey:'mapping'});}
  else if(r.cmp.identical)r.class='replay-consistent';
  else if(r.cmp.maxAbs<=PRECISION_MAX)r.class='color-precision';
  else r.class='backend-divergence';
  if(r.class==='color-precision'||r.class==='backend-divergence'){
   const c=addCase({class:r.class,draw:op.draw,stateHash:op.stateHash,resourceHash:op.resourceHash,reason:`Edge vs D3D12 replay: ${r.cmp.diffPixels} px, max ${r.cmp.maxAbs}`,reasonKey:'edge-vs-d3d12',cmp:r.cmp});
   c.images={edge:`${run}/draw-${op.draw}.rgba`,d3d12:`${run}/rdoc/draw-${String(a.index).padStart(3,'0')}.rgba`};
  }
  opResults.push(r);
 }
}else checks.push({check:'rdoc',ok:false,note:'no RenderDoc extraction in this run'});

// --- 3. same frame, other backend: Edge final vs GFXReconstruct Vulkan screenshot
const bmpPath=`${run}/gfxr/screenshot_frame_2.bmp`;
let vulkan=null;
if(fs.existsSync(bmpPath)){
 const b=fs.readFileSync(bmpPath),off=b.readUInt32LE(10),bw=b.readInt32LE(18),bh=b.readInt32LE(22),bpp=b.readUInt16LE(28);
 const rgbOf=(src,isBmp)=>{const o=new Uint8Array(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4;
  if(isBmp){const sy=bh>0?H-1-y:y,q=off+(sy*Math.ceil(bw*bpp/8/4)*4)+x*(bpp/8);o[p]=src[q+2];o[p+1]=src[q+1];o[p+2]=src[q];}
  else{o[p]=src[p];o[p+1]=src[p+1];o[p+2]=src[p+2];}o[p+3]=255;}return o;};
 const vk=rgbOf(b,true),ed=rgbOf(fs.readFileSync(`${run}/final.rgba`),false);
 vulkan={bmp:{w:bw,h:bh,bpp},cmp:compareRgba(ed,vk,W,H),note:'RGB only: screenshot has no alpha; swapchain copy of the final target'};
 vulkan.class=vulkan.cmp.identical?'replay-consistent':vulkan.cmp.maxAbs<=PRECISION_MAX?'color-precision':'backend-divergence';
 if(!vulkan.cmp.identical){
  fs.writeFileSync(`${run}/diff-edge-vs-vulkan.png`,png(diffImage(ed,vk,W,H),W,H));
  const c=addCase({class:vulkan.class,reason:`Edge(D3D12) vs Vulkan replay final RGB: ${vulkan.cmp.diffPixels} px, max ${vulkan.cmp.maxAbs}`,reasonKey:'edge-vs-vulkan-final',stateHash:edge.opsHash,cmp:vulkan.cmp});
  c.images={edge:`${run}/final.rgba`,vulkanBmp:bmpPath,diff:`${run}/diff-edge-vs-vulkan.png`};
 }
 // Vulkan call inventory from gfxrecon-convert (cheap structural cross-check).
 const jl=`${run}/gfxr/replay.jsonl`;
 if(fs.existsSync(jl)){const t=fs.readFileSync(jl,'utf8');const count=n=>(t.match(new RegExp(`"name": "${n}"`,'g'))||[]).length;
  vulkan.calls={vkCmdDrawIndexed:count('vkCmdDrawIndexed'),vkCmdDraw:count('vkCmdDraw'),vkQueuePresentKHR:count('vkQueuePresentKHR'),vkCreateGraphicsPipelines:count('vkCreateGraphicsPipelines')};
  const ok=vulkan.calls.vkCmdDrawIndexed===edge.ops.length;
  checks.push({check:'gfxr-drawindexed-count',got:vulkan.calls.vkCmdDrawIndexed,expected:edge.ops.length,ok});
  if(!ok)addCase({class:'capture-error',reason:`Vulkan replay issued ${vulkan.calls.vkCmdDrawIndexed} indexed draws, expected ${edge.ops.length}`,reasonKey:'gfxr-count'});
 }
}else checks.push({check:'gfxr',ok:false,note:'no GFXReconstruct screenshot in this run'});

// --- 4. operations our renderer rejected before the GPU (from preparation) ----
// Re-derive context from the original .r5f so each case is reproducible on its own.
const r5fPath=edge.fixture.capture||'artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f';
const ASSETS=edge.fixture.assetDir||'artifacts/r5-menu';
let r5f=null;
if(fixture.rejected.length&&fs.existsSync(r5fPath)){
 const raw=fs.readFileSync(r5fPath);
 r5f={path:r5fPath,sha256:sha256(raw),capture:readFrameCapture(raw,{hash:await createHash()})};
}
const events=r5f?[...replayEvents(r5f.capture,fixture.frame??3)].filter(e=>e.type==='draw'):[];
for(const rej of fixture.rejected){
 const d=events.find(e=>e.index===(rej.captureIndex??rej.draw));
 const cls=/missing guest bytes/.test(rej.reason)?'resource-incomplete':/shader|WGSL|derivative/i.test(rej.reason)?'translation':'unsupported-state';
 const c={class:cls,draw:rej.draw,reason:rej.reason,reasonKey:rej.reason.replace(/\d+/g,'N')};
 if(d){
  const t=d.textures[0],blob=r5f.capture.blobs.get(t?.baseBlob);
  c.stateHash=sha256(Buffer.from(d.registers.buffer,d.registers.byteOffset,d.registers.byteLength));
  c.resourceHash=blob?sha256(Buffer.from(blob.data)):null;
  c.context={r5f:{path:r5fPath,sha256:r5f.sha256,frame:3,draw:d.index},vs:d.vs.toString(16).toUpperCase(),ps:d.ps.toString(16).toUpperCase(),primitive:d.primitive,indexCount:d.indexCount,
   texture:t&&{format:t.format,width:t.width+1,height:t.height+1,pitch:t.pitch,tiled:t.tiled,packedMips:t.packedMips,endian:t.endian,mipMin:t.mipMin,mipMax:t.mipMax,baseBytes:t.baseBytes,baseDependency:t.baseDependency,raw:[...t.raw].map(x=>'0x'+(x>>>0).toString(16).padStart(8,'0')),blobPhys:blob&&'0x'+blob.phys.toString(16),blobBytes:blob?.data.length}};
  if(cls==='resource-incomplete'&&t&&blob){try{prepareTextureBase(t,blob.data);}catch(e){c.context.requiredBytes=e.requiredBytes;c.context.missingBytes=e.requiredBytes-blob.data.length;}}
  c._blob=blob?.data;
 }
 addCase(c);
}

// --- 5. known cases, regressions, unknown case storage ------------------------
const regressions=[];
for(const r of opResults){
 const k=Object.entries(known.cases).find(([,v])=>v.status==='validated'&&v.prefixHash===r.prefixHash);
 if(!k)continue;
 r.validatedKey=k[0];
 const exp=k[1].expect;
 if(exp.edgeImage!==r.edgeImage||exp.d3d12Image!==r.d3d12Image)regressions.push({key:k[0],draw:r.draw,expected:exp,got:{edgeImage:r.edgeImage,d3d12Image:r.d3d12Image}});
}
fs.mkdirSync(CASES,{recursive:true});
for(const c of cases){
 const k=known.cases[c.key];
 c.status=k?(k.status==='known'?'known':k.status):'unknown';
 if(k?.note)c.knownNote=k.note;
 if(c.status==='unknown'){
  const dir=`${CASES}/${short(c.key)}`;fs.mkdirSync(dir,{recursive:true});
  if(c._blob)fs.writeFileSync(`${dir}/texture-blob.bin`,c._blob);
  if(c.draw&&fs.existsSync(`${ASSETS}/isolated-draw-${c.draw}`))for(const f of ['system.bin','fetch.bin','float-vs.bin','memory.bin','texture.bin','indices.bin','manifest.json']){const p=`${ASSETS}/isolated-draw-${c.draw}/${f}`;if(fs.existsSync(p))fs.copyFileSync(p,`${dir}/${f}`);}
  for(const [n,p] of Object.entries(c.images||{}))if(fs.existsSync(p))fs.copyFileSync(p,`${dir}/${n}${path.extname(p)}`);
  const {_blob,...meta}=c;
  writeJson(`${dir}/case.json`,{...meta,capturedIn:{run,label,captureSha256:edge.captureFile?.sha256,edgeBrowser:edge.browser,adapter:edge.result?.adapter},
   reproduce:c.class==='resource-incomplete'?'node tools/gpu-capture/analyze.mjs <label> re-derives it from the .r5f; texture-blob.bin = captured guest bytes':'node tools/gpu-capture/pipeline.mjs <label> (Edge capture -> native replays -> analyze)'});
  c.saved=dir;
 }
 delete c._blob;
}

// --- 6. optional: accept current replay-consistent ops as validated regressions
if(acceptBaseline){
 const healthy=!cases.some(c=>c.class==='capture-error');
 if(!healthy)throw Error('refusing baseline: capture errors present');
 for(const r of opResults)if(r.class==='replay-consistent'){
  const key=hashJson({validated:r.draw,prefixHash:r.prefixHash});
  known.cases[key]={status:'validated',class:'replay-consistent',draw:r.draw,stateHash:r.stateHash,resourceHash:r.resourceHash,prefixHash:r.prefixHash,
   expect:{edgeImage:r.edgeImage,d3d12Image:r.d3d12Image},
   evidence:{run,captureSha256:edge.captureFile?.sha256,browser:edge.browser,adapter:edge.result?.adapter?.architecture,date:new Date().toISOString().slice(0,10)},
   meaning:'Edge readback == native Dawn D3D12 replay (RenderDoc) byte for byte. Regression lock of OUR renderer; fidelity to the console NOT verified.'};
 }
 writeJson(KNOWN,known);
}

// --- 7. report ---------------------------------------------------------------
const byClass={};for(const r of opResults)byClass[r.class]=(byClass[r.class]||0)+1;
const caseCount={};for(const c of cases)caseCount[`${c.class}/${c.status}`]=(caseCount[`${c.class}/${c.status}`]||0)+1;
const report={label,run,date:new Date().toISOString(),
 identity:{capture:edge.captureFile,fixture:edge.fixture,opsHash:edge.opsHash,edgeFinal:edge.final?.sha256,browser:edge.browser,adapter:edge.result?.adapter,mode:edge.mode},
 tools:{webgpureconstruct:'2.1 (prebuilt)',renderdoc:'1.46 (portable, D3D12)',gfxreconstruct:'1.0.4 (windows zip, Vulkan layer)',dawnReplay:'19696dd088'},
 checks,opsByClass:byClass,vulkanFinal:vulkan,casesByClassStatus:caseCount,regressions,
 cases:cases.map(({cmp,...c})=>({...c,cmp:cmp&&{diffPixels:cmp.diffPixels,maxAbs:cmp.maxAbs,channelMax:cmp.channelMax,bbox:cmp.bbox}})),
 ops:opResults.map(({rdoc,cmp,...r})=>({...r,diffPixels:cmp?.diffPixels,maxAbs:cmp?.maxAbs}))};
writeJson(`${run}/report.json`,report);
const L=[];
L.push(`# Informe automático gpu-capture — ${label}`,'',`Generado: ${report.date}. Captura ${short(edge.captureFile?.sha256||'none')} (${edge.captureFile?.bytes} B), fixture ${short(edge.fixture.sha256)}, ops ${short(edge.opsHash)}, Edge ${edge.browser} ${edge.mode}, ${edge.result?.adapter?.vendor}/${edge.result?.adapter?.architecture}.`,'');
L.push('## Chequeos de cadena');for(const c of checks)L.push(`- ${JSON.stringify(c)}`);L.push('');
L.push('## Operaciones dibujadas (Edge vs replay nativo D3D12 vía RenderDoc)');
L.push(Object.entries(byClass).map(([k,v])=>`- ${k}: ${v}`).join('\n')||'- (sin RenderDoc)');
L.push('',`Validadas como regresión en este run: ${opResults.filter(r=>r.validatedKey).length}; regresiones: ${regressions.length}; operaciones sin caso validado (secuencia nueva): ${opResults.filter(r=>!r.validatedKey).length}.`);
for(const r of regressions)L.push(`- REGRESIÓN draw ${r.draw}: esperado ${short(r.expected.edgeImage)}/${short(r.expected.d3d12Image)}, obtenido ${short(r.got.edgeImage)}/${short(r.got.d3d12Image)}`);
if(vulkan)L.push('',`## Mismo cuadro en Vulkan (GFXReconstruct)`,`- ${vulkan.class}: ${vulkan.cmp.diffPixels} px distintos, máx ${vulkan.cmp.maxAbs}/255, por canal ${JSON.stringify(vulkan.cmp.channelMax)}, caja ${JSON.stringify(vulkan.cmp.bbox)}. Solo RGB. Llamadas: ${JSON.stringify(vulkan.calls)}.`);
L.push('','## Casos (clase / estado)');for(const [k,v] of Object.entries(caseCount))L.push(`- ${k}: ${v}`);
const unk=cases.filter(c=>c.status==='unknown');
if(unk.length){L.push('','## Casos desconocidos guardados (reproducibles)');for(const c of unk)L.push(`- [${c.class}] draw ${c.draw??'-'} — ${c.reason}${c.context?.texture?` — tex ${c.context.texture.format} ${c.context.texture.width}x${c.context.texture.height} tiled${c.context.texture.tiled} packedMips${c.context.texture.packedMips} capturados ${c.context.texture.blobBytes} B, layout pide ${c.context.requiredBytes} B`:''} → ${c.saved}`);}
const kn=cases.filter(c=>c.status==='known');if(kn.length){L.push('','## Casos conocidos (ya clasificados)');for(const c of kn)L.push(`- [${c.class}] draw ${c.draw??'-'} — ${c.reason}${c.knownNote?' — '+c.knownNote:''}`);}
L.push('','## Para Codex',
 '- replay-consistent = nuestro renderer es determinista y la cadena captura/replay no pierde nada; NO certifica fidelidad con la consola.',
 '- color-precision se informa, no se valida. resource-incomplete: no inventar bytes; revisar layout/SDK/productor con el contexto guardado.',
 `- Detalle por operación: ${run}/report.json. Casos: ${CASES}/<clave>/case.json.`);
fs.writeFileSync(`${run}/INFORME.md`,L.join('\n')+'\n');
console.log(L.join('\n'));
// 2 = needs attention: regression, capture error, or any case not yet classified.
if(regressions.length||cases.some(c=>c.class==='capture-error'||c.status==='unknown'))process.exitCode=2;
