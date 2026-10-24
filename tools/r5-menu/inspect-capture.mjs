import fs from 'node:fs';
import path from 'node:path';
import {readFrameCapture,replayEvents} from './frame-reader.mjs';
import {createHash} from './hash.mjs';
const file=process.argv[2]??'artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f';
const out=process.argv[3]??'artifacts/r5-menu/edge-replay-inventory.json';
const c=readFrameCapture(fs.readFileSync(file),{hash:await createHash()});
const directory='artifacts/r4-shaders/wgsl-repacked';
const shaderFiles=fs.readdirSync(directory), validation=JSON.parse(fs.readFileSync('artifacts/r4-shaders/edge-repacked.json'));
const prior=new Map(validation.results.map(r=>[r.name,r]));
const shaders=[...c.shaders.values()].map(s=>{
  const name=shaderFiles.find(n=>n.includes(s.hash.toString(16).toUpperCase())&&n.includes(s.stage===0?'.vert.':'.frag.'));
  return {key:s.key,stage:s.stage,hash:s.hash.toString(16).toUpperCase(),file:name?path.join(directory,name):null,moduleValidPreviously:name?prior.get(name)?.moduleValid??null:null,bindings:{vertices:s.vertexBindings,textures:s.textureBindings}};
});
const frames=c.frames.map(f=>{
  const draws=[],copies=[],pairs={},formats={},targets={};
  for(const e of replayEvents(c,f.number)){
    if(e.type==='draw'){
      const k=`${e.vs.toString(16).toUpperCase()}/${e.ps.toString(16).toUpperCase()}`;pairs[k]=(pairs[k]??0)+1;
      for(const t of e.textures){const k=`${t.format}/${t.tiled}/${t.dependency}`;formats[k]=(formats[k]??0)+1;}
      const r=e.registers;const state={surface:r[0x2000],colors:[0x2001,0x2003,0x2004,0x2005].map(i=>r[i]),depthInfo:r[0x2002],depth:r[0x2200],blend:r[0x2201],colorControl:r[0x2202],raster:r[0x2205],viewport:r[0x2206],mask:r[0x2104],scissor:[r[0x2081],r[0x2082]]};
      const tk=JSON.stringify(state);targets[tk]=(targets[tk]??0)+1;
      draws.push({seq:String(e.seq),index:e.index,primitive:e.primitive,count:e.indexCount,pair:k,issued:e.issued,edramPrior:e.edramPrior,vertices:e.vertices.map(v=>({slot:v.slot,blob:v.blob})),textures:e.textures.map(t=>({slot:t.slot,format:t.format,width:t.width+1,height:t.height+1,pitch:t.pitch,tiled:t.tiled,dependency:t.dependency,lastCopySeq:String(t.lastCopySeq),baseBlob:t.baseBlob})),state});
    }else if(e.type==='copy')copies.push({seq:String(e.seq),index:e.index,flags:e.flags,status:e.status,resolve:Array.from(e.resolve),rectBlob:e.rectBlob});
  }
  return {number:f.number,declaredExact:f.declaredExact,swap:{phys:f.swap.phys,width:f.swap.width,height:f.swap.height,dependency:f.swap.dependency},pairs,formats,states:Object.entries(targets).map(([s,count])=>({state:JSON.parse(s),count})),draws,copies};
});
const report={file,bytes:c.bytes.length,dependencyValidation:c.dependencyValidation,shaders,frames};
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({out,shaders:shaders.length,missingWGSL:shaders.filter(s=>!s.file).map(s=>s.key),previouslyRejectedModules:shaders.filter(s=>s.moduleValidPreviously===false).map(s=>s.key),frames:frames.map(f=>({frame:f.number,draws:f.draws.length,copies:f.copies.length,states:f.states.length,formats:f.formats}))}));
