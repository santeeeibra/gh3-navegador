// Offline inventory only. Never launches GH3, modifies source data, or loads GPU.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const source=resolve(root,'artifacts/g0/g0-native-3');
const output=resolve(root,'artifacts/r5-menu');
const wallTime='2026-10-09 11:08:26';
// Window comes from screen-182s.png filesystem time, not an instrumented frame ID.
const millis=s=>Date.parse(s.replace(' ','T')+'Z'); // compare wall times only, NOT UTC conversion
const target=millis(wallTime),windowMs=3000;
const resources=JSON.parse(await readFile(resolve(root,'artifacts/r5-pipelines/resources.json'),'utf8'));
const cache=JSON.parse(await readFile(resolve(root,'artifacts/r5-pipelines/native-cache.json'),'utf8'));
const pipelines=JSON.parse(await readFile(resolve(root,'artifacts/r5-pipelines/native-pair-pipelines.json'),'utf8'));
const byHash=new Map(resources.results.map(r=>[r.name.match(/shader_([0-9a-f]+)\./i)[1].toLowerCase()+':'+r.stage,r]));
const shaders=[];
for(const name of (await readdir(resolve(source,'shaders'))).sort()){
  const m=name.match(/^shader_([0-9a-f]+)\.ucode\.bin\.(vert|frag)$/i);if(!m)continue;
  const bytes=await readFile(resolve(source,'shaders',name));
  const stage=m[2]==='vert'?'vertex':'fragment',hash=m[1].toLowerCase();
  const textPath=resolve(source,'shaders',name.replace('.ucode.bin.','.ucode.'));
  const text=await readFile(textPath,'utf8');
  const wgsl=byHash.get(hash+':'+stage);
  shaders.push({hash,stage,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),
    source:relative(root,resolve(source,'shaders',name)).replaceAll('\\','/'),
    disassemblySource:relative(root,textPath).replaceAll('\\','/'),
    vertexFetchInstructionIndices:[...new Set([...text.matchAll(/\bvf(\d+)\b/g)].map(m=>+m[1]))],
    textureFetchInstructionIndices:[...new Set([...text.matchAll(/\btf(\d+)\b/g)].map(m=>+m[1]))],
    wgsl:wgsl?{name:wgsl.name,moduleValid:wgsl.moduleValid,bindings:wgsl.bindings}:null});
}
const textureMap=new Map(),resolves=new Map(),pairs=new Map(),files=[];
let timestamped=0,inWindow=0,loadedLines=0,resolveLines=0;
for(const name of (await readdir(source)).filter(n=>/^native(?:\.\d+)?\.log$/.test(n)).sort()){
  let lineNumber=0,first=null,last=null;
  for await(const line of createInterface({input:createReadStream(resolve(source,name)),crlfDelay:Infinity})){
    lineNumber++;const time=line.match(/^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\]/)?.[1];
    if(!time)continue;timestamped++;first??=time;last=time;
    const nearby=Math.abs(millis(time)-target)<=windowMs;if(nearby)inWindow++;
    const location={file:'artifacts/g0/g0-native-3/'+name,line:lineNumber,time};
    const t=line.match(/Loaded (tiled|linear) (\d+)x(\d+)x(\d+) (\S+) (\S+) texture with (\d+) (unpacked|packed) mip levels?, base at (0x[0-9A-F]+) \(pitch (\d+), size (0x[0-9A-F]+)\), mips at (0x[0-9A-F]+) \(size (0x[0-9A-F]+)\)/i);
    if(t){
      loadedLines++;const key=t.slice(1).join(':');
      if(!textureMap.has(key))textureMap.set(key,{layout:t[1],width:+t[2],height:+t[3],depth:+t[4],dimension:t[5],format:t[6],mipLevels:+t[7],mipLayout:t[8],base:t[9],pitch:+t[10],baseBytes:parseInt(t[11],16),mipBase:t[12],mipBytes:parseInt(t[13],16),count:0,nearReferenceCount:0,first:location,last:location,nearReference:[]});
      const x=textureMap.get(key);x.count++;x.last=location;if(nearby){x.nearReferenceCount++;if(x.nearReference.length<3)x.nearReference.push(location);}
    }
    if(line.includes('Resolve:')){
      resolveLines++;const desc=line.slice(line.indexOf('Resolve:'));const key=desc;
      if(!resolves.has(key))resolves.set(key,{description:desc,count:0,nearReferenceCount:0,first:location,last:location,nearReference:[]});
      const x=resolves.get(key);x.count++;x.last=location;if(nearby){x.nearReferenceCount++;if(x.nearReference.length<3)x.nearReference.push(location);}
    }
    const p=line.match(/Creating graphics pipeline with VS ([0-9A-F]+), PS ([0-9A-F]+)/i);
    if(p){const key=p[1].toLowerCase()+':'+p[2].toLowerCase();if(!pairs.has(key))pairs.set(key,{pair:key,count:0,nearReferenceCount:0,first:location,last:location});const x=pairs.get(key);x.count++;x.last=location;if(nearby)x.nearReferenceCount++;}
  }
  files.push({file:name,lines:lineNumber,first,last});
}
const pairsFromCache=[...new Set(cache.records.filter(r=>r.vertex!=='0000000000000000'&&r.pixel!=='0000000000000000').map(r=>r.vertex+':'+r.pixel))].map(pair=>{
  const [vs,ps]=pair.split(':'),check=pipelines.results.find(r=>r.name===pair);
  return {pair,vertexModuleValid:byHash.get(vs+':vertex')?.moduleValid??null,pixelModuleValid:byHash.get(ps+':fragment')?.moduleValid??null,
    diagnosticPipelineCreated:check?.created??null,records:cache.records.filter(r=>r.vertex===vs&&r.pixel===ps).map(r=>r.record),traceCreation:pairs.get(pair)??null};
});
const textures=[...textureMap.values()],resolveInventory=[...resolves.values()];
const summary={logFiles:files.length,timestampedLines:timestamped,linesNearReference:inWindow,shaderCount:shaders.length,vertexShaders:shaders.filter(s=>s.stage==='vertex').length,fragmentShaders:shaders.filter(s=>s.stage==='fragment').length,
  modulesValid:shaders.filter(s=>s.wgsl?.moduleValid).length,missingModules:shaders.filter(s=>!s.wgsl).length,cachePairs:pairsFromCache.length,
  loadedTextureLines:loadedLines,uniqueTextureDescriptors:textures.length,nearReferenceTextureDescriptors:textures.filter(t=>t.nearReferenceCount).length,
  nearReferenceFormats:[...new Set(textures.filter(t=>t.nearReferenceCount).map(t=>t.format))].sort(),observedFormats:[...new Set(textures.map(t=>t.format))].sort(),
  resolveLines,uniqueResolveDescriptions:resolveInventory.length,nearReferenceResolves:resolveInventory.filter(r=>r.nearReferenceCount).length};
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'inventory.json'),JSON.stringify({scope:'Cumulative native title/menu run, NOT a complete frame capture',reference:{image:'artifacts/g0/g0-native-3/screen-182s.png',wallTime,windowMs,basis:'filesystem last-write time, approximate; texture load and pipeline creation are NOT draw-use logs'},
  warnings:['Cache covers entire run, including earlier scenes. Do not assign every shader/texture to main menu.','Texture load logs omit cache-hit usage, guest bytes, fetch slots and draw associations.','No complete ordered draw list or same-frame native GPU readback.','vf instruction indices are NOT guest fetch-constant slots; derive using translator metadata.','Diagnostic pipeline creation proves neither original states nor pixels.'],summary,files,shaders,pairsFromCache,tracePairs:[...pairs.values()],textures,resolveInventory},null,2));
console.log(JSON.stringify(summary));
