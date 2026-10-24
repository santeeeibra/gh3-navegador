// Cross-check freshly emitted Naga WGSL with standalone Tint. No diagnostics disabled.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
const exe=process.env.R4_TINT;if(!exe||!fs.existsSync(exe))throw Error('Set R4_TINT');
const root='artifacts/r4-wgsl-menu-44',out=`${root}/tint-wgsl`;
if(fs.existsSync(out))throw Error('Output already exists');fs.mkdirSync(`${out}/logs`,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const run=(name,args)=>{
 const p=spawnSync(exe,args,{encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,windowsHide:true});
 const stdout=`${out}/logs/${name}.stdout.txt`,stderr=`${out}/logs/${name}.stderr.txt`;
 fs.writeFileSync(stdout,p.stdout??'');fs.writeFileSync(stderr,p.stderr??'');
 return {ok:p.status===0&&!p.error,status:p.status,error:p.error?.message??null,args,stdout,stderr};
};
const ownInput=path.resolve('artifacts/r4-shaders/own-fixture/compute.spv');
const positive=run('own-compute-spirv',[ownInput,'--format','wgsl','-o',path.resolve(`${out}/own-compute.wgsl`)]);
const results=[];
for(const name of fs.readdirSync(`${root}/naga/repacked/wgsl`).sort()){
 const file=path.resolve(`${root}/naga/repacked/wgsl/${name}`);
 const result=run(name,[file,'--format','wgsl','-o',path.resolve(`${out}/${name}`)]);
 results.push({name,inputSha256:sha(fs.readFileSync(file)),...result});
}
const report={at:new Date().toISOString(),executable:exe,executableSha256:sha(fs.readFileSync(exe)),purpose:'Standalone Tint validation/re-emission of Naga WGSL, distinct from SPIR-V conversion',positive,total:results.length,valid:results.filter(r=>r.ok).length,results};
fs.writeFileSync(`${out}/validation.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({positive:positive.ok,total:report.total,valid:report.valid}));
if(!positive.ok||results.length!==71)process.exitCode=1;
