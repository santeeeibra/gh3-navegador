// Fresh outputs only. Preserve all R4 sources and prior conversion evidence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const compiler=process.argv[2]??'naga';
if(!['naga','tint'].includes(compiler))throw Error('Compiler must be naga or tint');
const exe=compiler==='naga'?path.resolve('toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe'):process.env.R4_TINT;
if(!exe||!fs.existsSync(exe))throw Error('Compiler unavailable: '+exe);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=`artifacts/r4-wgsl-menu-44/${compiler}`;
if(fs.existsSync(root))throw Error('Output already exists; use a fresh run directory');
const manifest=JSON.parse(fs.readFileSync('artifacts/r4-shaders/native-conversion.json'));
const repacking=JSON.parse(fs.readFileSync('artifacts/r4-shaders/repacking.json'));
if(manifest.total!==71||manifest.results.length!==71)throw Error('Expected exactly 71 shaders');
const report={compiler,executable:exe,executableSha256:sha(fs.readFileSync(exe)),at:new Date().toISOString(),profiles:[]};
for(const profile of ['baseline','repacked']){
 const out=`${root}/${profile}`;fs.mkdirSync(`${out}/wgsl`,{recursive:true});fs.mkdirSync(`${out}/logs`,{recursive:true});
 const results=[];
 for(const item of manifest.results){
  const name=path.basename(item.output),source=path.resolve(`artifacts/r4-shaders/spirv${profile==='repacked'?'-repacked':''}/${name}`);
  const hash=sha(fs.readFileSync(source));
  const expected=profile==='baseline'?item.sha256:repacking.find(r=>r.input===name)?.outputSha256;
  if(!expected||hash!==expected)throw Error('Input hash mismatch: '+source);
  const output=path.resolve(`${out}/wgsl/${name}.wgsl`);
  const run=(step,args)=>{
   const p=spawnSync(exe,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,windowsHide:true});
   const stdout=`${out}/logs/${name}.${step}.stdout.txt`,stderr=`${out}/logs/${name}.${step}.stderr.txt`;
   fs.writeFileSync(stdout,p.stdout??'');fs.writeFileSync(stderr,p.stderr??'');
   return {ok:p.status===0&&!p.error,status:p.status,error:p.error?.message??null,stdout,stderr,args};
  };
  const validation=compiler==='naga'?run('input-validation',[source]):null;
  const conversion=(!validation||validation.ok)?run('conversion',compiler==='naga'?[source,output]:[source,'--format','wgsl','-o',output]):null;
  const revalidation=conversion?.ok&&fs.existsSync(output)?run('wgsl-validation',compiler==='naga'?[output]:[output,'--format','wgsl','-o',path.resolve(`${out}/logs/${name}.roundtrip.wgsl`)]):null;
  results.push({name,stage:item.stage,source,inputSha256:hash,output,validation,conversion,revalidation,wgslValid:revalidation?.ok===true,outputSha256:fs.existsSync(output)?sha(fs.readFileSync(output)):null});
 }
 const summary={profile,total:results.length,inputValid:results.filter(r=>r.validation?.ok).length,emitted:results.filter(r=>r.conversion?.ok&&r.outputSha256).length,wgslValid:results.filter(r=>r.wgslValid).length,results};
 report.profiles.push(summary);fs.writeFileSync(`${root}/conversion.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({compiler,profile,total:summary.total,inputValid:compiler==='naga'?summary.inputValid:null,emitted:summary.emitted,wgslValid:summary.wgslValid}));
}
