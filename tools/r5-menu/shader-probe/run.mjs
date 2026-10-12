import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFrameCapture,replayEvents} from '../frame-reader.mjs';
import {createHash as frameHash} from '../hash.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),folder=path.join(root,'artifacts/r5-menu/shader-probe');
const exe=path.join(folder,'build/primitive-shader.exe');
const naga=path.join(root,'toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe');
const sha=b=>createHash('sha256').update(b).digest('hex');
const run=(command,args)=>{const p=spawnSync(command,args,{cwd:root,windowsHide:true,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});return {exitCode:p.status,error:p.error?.message??null,stdout:p.stdout??'',stderr:p.stderr??'',ok:p.status===0&&!p.error};};
if(!fs.existsSync(exe)||!fs.existsSync(naga))throw Error('Build translator first and use existing Naga installation.');
const capture=readFrameCapture(fs.readFileSync(path.join(root,'artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f')),{hash:await frameHash()});
const corpus=JSON.parse(fs.readFileSync(path.join(root,'artifacts/r4-shaders/inventory.json'),'utf8')).unique;
const cases=new Map();
for(const d of replayEvents(capture,3))if(d.type==='draw'&&[1,8].includes(d.primitive)){
  const hash=d.vs.toString(16).toUpperCase().padStart(16,'0'),profile=d.primitive===1?'point':'rectangle';
  const key=`${profile}-${hash}`;if(!cases.has(key))cases.set(key,{key,hash,profile,draws:[]});cases.get(key).draws.push(d.index);
}
for(const directory of ['raw','wgsl','repacked','controls'])fs.mkdirSync(path.join(folder,directory),{recursive:true});
const results=[];
for(const c of cases.values()){
  const item=corpus.find(x=>x.stage==='vertex'&&path.basename(x.path).includes(c.hash));
  if(!item)throw Error('Microcode missing for '+c.key);
  const input=path.resolve(root,item.path);if(sha(fs.readFileSync(input))!==item.sha256)throw Error('Input hash changed');
  const output=path.join(folder,'raw',c.key+'.spv');
  // Remove this case's stale outputs before attempting a new translation.
  for(const file of [output,path.join(folder,'repacked',c.key+'.spv'),path.join(folder,'wgsl',c.key+'.wgsl')])if(fs.existsSync(file))fs.unlinkSync(file);
  const baseline=path.join(folder,'controls',c.key+'.spv');
  const baselineRun=run(exe,[input,baseline,'vertex']);
  const previous=path.join(root,'artifacts/r4-shaders/spirv-single',path.basename(input)+'.spv');
  const baselineIdentical=baselineRun.ok&&fs.existsSync(previous)&&fs.readFileSync(baseline).equals(fs.readFileSync(previous));
  results.push({...c,input:item.path,inputSha256:item.sha256,output,translation:run(exe,[input,output,c.profile]),baseline:{run:baselineRun,previous,identical:baselineIdentical}});
}
const conversion=run('python',[path.join(root,'tools/r5-menu/shader-probe/convert.py')]);
for(const r of results){
  const input=path.join(folder,'repacked',r.key+'.spv'),output=path.join(folder,'wgsl',r.key+'.wgsl');
  if(!r.translation.ok||!fs.existsSync(input))continue;
  r.naga=run(naga,[input,output]);
  if(r.naga.ok){r.revalidation=run(naga,[output]);r.wgslSha256=sha(fs.readFileSync(output));}
}
const sdkSource=path.join(root,'artifacts/xex-adapt/paso-b/src/rexglue-sdk-090/src/graphics/pipeline/shader/spirv_translator.cpp');
const originalSource=fs.readFileSync(sdkSource,'utf8');
const correctedSource=fs.readFileSync(path.join(folder,'build/rectangle-translator.cpp'),'utf8');
// CMake file(READ/WRITE) normalizes CRLF; compare content after explicit EOL normalization.
const exactCorrection=originalSource.replace(/\r\n/g,'\n').replace('if_not_last_guest_vertex.makeBeginElse();','if_not_last_guest_vertex.makeBeginElse(false);')===correctedSource.replace(/\r\n/g,'\n');
const report={translatorSha256:sha(fs.readFileSync(exe)),nagaSha256:sha(fs.readFileSync(naga)),sdkSourceSha256:sha(fs.readFileSync(sdkSource)),exactCorrection,conversion,results,
  limitations:'Translation/IR validation only; baseline interface mask 0xFFFF, no draw pipeline or pixel equivalence yet.'};
fs.writeFileSync(path.join(folder,'conversion.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:results.length,translated:results.filter(r=>r.translation.ok).length,wgsl:results.filter(r=>r.revalidation?.ok).length,baselineIdentical:results.filter(r=>r.baseline.identical).length,exactCorrection,conversion:conversion.ok,failures:results.filter(r=>!r.revalidation?.ok).map(r=>({key:r.key,translation:r.translation.stderr.slice(-600),naga:r.naga?.stderr.slice(-800)}))},null,2));
if(!conversion.ok||!exactCorrection||!results.length||results.some(r=>!r.revalidation?.ok||!r.baseline.identical))process.exitCode=1;
