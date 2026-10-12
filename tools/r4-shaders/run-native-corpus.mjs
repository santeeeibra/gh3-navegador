import {readFile,writeFile,mkdir,stat} from 'node:fs/promises';
import {resolve,join,basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const manifest=JSON.parse(await readFile(join(root,'artifacts/r4-shaders/inventory.json'),'utf8'));
const single=process.argv.includes('--single-memory');
const exe=resolve(process.argv.slice(2).find(a=>!a.startsWith('--'))??join(root,'artifacts/r4-shaders/build/xenos-to-spirv.exe'));
await stat(exe); // Missing translator must fail, never silently report success.
const out=join(root,'artifacts/r4-shaders',single?'spirv-single':'spirv');await mkdir(out,{recursive:true});
const results=[];
for(const item of manifest.unique){
  const dest=join(out,basename(item.path)+'.spv');
  const source=resolve(root,item.path);
  const input=await readFile(source);
  if(createHash('sha256').update(input).digest('hex')!==item.sha256)throw Error('Corpus changed: '+item.path);
  const t=performance.now();
  const run=spawnSync(exe,[source,dest,...(single?['--single-memory']:[])],{cwd:resolve(exe,'..'),encoding:'utf8',timeout:30000,maxBuffer:4*1024*1024,windowsHide:true});
  const result={input:item.path,stage:item.stage,inputSha256:item.sha256,output:dest,exitCode:run.status,signal:run.signal,error:run.error?.message??null,stdout:run.stdout??'',stderr:run.stderr??'',elapsedMs:performance.now()-t,translated:false};
  if(run.status===0&&!run.error){
    const spv=await readFile(dest);
    result.translated=spv.length>=20&&spv.length%4===0&&spv.readUInt32LE(0)===0x07230203;
    result.bytes=spv.length;result.sha256=createHash('sha256').update(spv).digest('hex');
  }
  results.push(result);
}
const translated=results.filter(r=>r.translated).length;
const report={at:new Date().toISOString(),exe,profile:'baseline host render targets, no interlock, conservative features; all 16 interpolators, no draw pairing',total:results.length,translated,translatedPercent:100*translated/results.length,spirvValidation:'pending Naga or SPIRV-Tools; magic/header check alone is not validation',wgsl:'not run',webgpu:'not run',results};
if(single)report.profile+='; EXPERIMENTAL single 512 MiB shared-memory binding, requires desktop adapter limit';
await writeFile(join(root,'artifacts/r4-shaders',single?'native-single.json':'native-conversion.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,translated,translatedPercent:report.translatedPercent}));
if(translated!==results.length)process.exitCode=1;
