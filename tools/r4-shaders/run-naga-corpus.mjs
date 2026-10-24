import {readFile, writeFile, mkdir, rm, stat} from 'node:fs/promises';
import {resolve, join, basename} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const exe=resolve(root,'toolchain/r4-naga/naga-cli-30.0.0/target/release/naga.exe');
await stat(exe);
const own=process.argv.includes('--own');
const normalized=process.argv.includes('--normalized');
const single=process.argv.includes('--single-memory');
const repacked=process.argv.includes('--repacked');
const manifest=own?{results:[{output:join(root,'artifacts/r4-shaders/own-fixture/compute.spv'),stage:'compute'}]}:
  JSON.parse(await readFile(join(root,'artifacts/r4-shaders',single||repacked?'native-single.json':'native-conversion.json'),'utf8'));
const out=join(root,'artifacts/r4-shaders',own?'own-wgsl':repacked?'wgsl-repacked':single?'wgsl-single':normalized?'wgsl-normalized':'wgsl');
await mkdir(out,{recursive:true});
const results=[];
function run(args){
  const p=spawnSync(exe,args,{encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,windowsHide:true});
  return {ok:p.status===0&&!p.error,exitCode:p.status,signal:p.signal,error:p.error?.message??null,
    stdout:p.stdout??'',stderr:p.stderr??''};
}
for(const item of manifest.results){
  const source=repacked?join(root,'artifacts/r4-shaders/spirv-repacked',basename(item.output)):normalized?join(root,'artifacts/r4-shaders',single?'spirv-single-normalized':'spirv-normalized',basename(item.output)):resolve(item.output), bytes=await readFile(source);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  if(!normalized&&!repacked&&item.sha256&&sha256!==item.sha256)throw Error('SPIR-V changed: '+source);
  const dest=join(out,basename(source)+'.wgsl');
  await rm(dest,{force:true}); // Prevent failed conversions leaving a stale successful module.
  const t=performance.now();
  const validation=run([source]);
  const conversion=validation.ok?run([source,dest]):null;
  const revalidation=conversion?.ok?run([dest]):null;
  const result={input:source,inputSha256:sha256,stage:item.stage,output:dest,
    validation,conversion,revalidation,elapsedMs:performance.now()-t,wgslValid:revalidation?.ok===true};
  if(conversion?.ok){const wgsl=await readFile(dest);result.outputSha256=createHash('sha256').update(wgsl).digest('hex');}
  results.push(result);
}
const report={at:new Date().toISOString(),nagaVersion:'30.0.0',executableSha256:createHash('sha256').update(await readFile(exe)).digest('hex'),
  purpose:'SPIR-V ingestion/Naga IR validation, WGSL emission and WGSL revalidation; not complete SPIR-V spec validation or rendered GH3',
  total:results.length,parsedAndValidated:results.filter(r=>r.validation.ok).length,
  emitted:results.filter(r=>r.conversion?.ok).length,wgslValid:results.filter(r=>r.wgslValid).length,results};
await writeFile(join(root,'artifacts/r4-shaders',own?'naga-own.json':repacked?'naga-repacked.json':single?'naga-single.json':normalized?'naga-normalized.json':'naga-conversion.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,parsedAndValidated:report.parsedAndValidated,emitted:report.emitted,wgslValid:report.wgslValid}));
if(!report.total||report.wgslValid!==report.total)process.exitCode=1;
