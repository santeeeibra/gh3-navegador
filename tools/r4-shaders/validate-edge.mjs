import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile, readdir, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const input=process.argv[2];
const output=resolve(process.argv[3]??join(root,'artifacts/r4-shaders/edge-smoke.json'));
const smoke=input==='--smoke';
const compute=process.argv.includes('--compute');
if(!input)throw Error('Uso: node tools/r4-shaders/validate-edge.mjs --smoke | <carpeta-WGSL> [reporte.json]');
const cases=smoke?[
  {name:'own-compute-valid',code:'@compute @workgroup_size(1) fn main() {}',expectValid:true,compute:true},
  {name:'own-invalid-control',code:'@compute @workgroup_size(1) fn main() { definitely_invalid(); }',expectValid:false}
]:await Promise.all((await readdir(resolve(input))).filter(n=>n.endsWith('.wgsl')).sort().map(async name=>({name,code:await readFile(join(resolve(input),name),'utf8'),compute})));
if(!cases.length)throw Error('No hay archivos WGSL; un corpus vacío no cuenta como éxito.');
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'});res.end('<!doctype html><title>R4 validación local</title>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const report={at:new Date().toISOString(),purpose:smoke?'own shader harness control; not Naga or GH3':'WGSL module validation; does not certify pipeline layout or rendering',results:[],pageErrors:[],uncapturedErrors:[],deviceLosses:[]};
try {
  browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
  const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  report.gpu=await page.evaluate(async()=>{
    if(!navigator.gpu)throw Error('WebGPU no disponible');
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('Sin adaptador WebGPU');
    window.r4Device=await adapter.requestDevice();window.r4Uncaptured=[];window.r4Lost=[];
    r4Device.addEventListener('uncapturederror',e=>r4Uncaptured.push(e.error.message));
    r4Device.lost.then(info=>r4Lost.push({reason:info.reason,message:info.message}));
    return {info:{vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter},features:[...adapter.features],limits:{maxBindGroups:adapter.limits.maxBindGroups,maxStorageBuffersPerShaderStage:adapter.limits.maxStorageBuffersPerShaderStage}};
  });
  for(const item of cases){
    const result=await page.evaluate(async({name,code,compute})=>{
      const d=r4Device;d.pushErrorScope('validation');let messages=[],exception=null,pipeline=false,scope=null;
      try{
        const m=d.createShaderModule({label:name,code});
        messages=(await m.getCompilationInfo()).messages.map(x=>({type:x.type,message:x.message,lineNum:x.lineNum,linePos:x.linePos,offset:x.offset,length:x.length}));
        if(compute&&!messages.some(x=>x.type==='error')){
          const p=await d.createComputePipelineAsync({layout:'auto',compute:{module:m,entryPoint:'main'}});
          const enc=d.createCommandEncoder();const pass=enc.beginComputePass();pass.setPipeline(p);pass.dispatchWorkgroups(1);pass.end();d.queue.submit([enc.finish()]);await d.queue.onSubmittedWorkDone();pipeline=true;
        }
      }catch(e){exception=e.message;}
      finally{scope=(await d.popErrorScope())?.message??null;}
      return {name,moduleValid:!exception&&!scope&&!messages.some(x=>x.type==='error'),messages,exception,scope,computeDispatched:pipeline};
    },item);
    result.sha256=createHash('sha256').update(item.code).digest('hex');
    if(smoke)result.expectedValid=item.expectValid;
    report.results.push(result);
  }
  Object.assign(report,await page.evaluate(()=>({uncapturedErrors:r4Uncaptured,deviceLosses:r4Lost})));
  report.total=cases.length;report.valid=report.results.filter(x=>x.moduleValid).length;
  report.validPercent=100*report.valid/report.total;
  report.ok=report.pageErrors.length===0&&report.uncapturedErrors.length===0&&report.deviceLosses.length===0&&(smoke?report.results.every(r=>r.moduleValid===r.expectedValid)&&report.results[0].computeDispatched:report.valid===report.total);
}catch(e){report.fatal=e.message;report.ok=false;}
finally{
  if(browser)await browser.close();await new Promise(r=>server.close(r));
  await mkdir(resolve(output,'..'),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({output,ok:report.ok,total:report.total,valid:report.valid,fatal:report.fatal}));
if(!report.ok)process.exitCode=1;

