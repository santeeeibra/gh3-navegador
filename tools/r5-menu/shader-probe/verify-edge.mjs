import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {readFrameCapture,replayEvents} from '../frame-reader.mjs';
import {createHash} from '../hash.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(root,'artifacts/r5-menu/shader-probe');
const turn=fs.readFileSync(path.join(root,'artifacts/PRUEBAS-EN-CURSO.md'),'utf8');
if(!/Estado: OCUPADO/.test(turn)||!/Quién: Codex/.test(turn))throw Error('Reserve Codex GPU turn first.');
const conversion=JSON.parse(fs.readFileSync(path.join(out,'conversion.json'),'utf8'));
const capture=readFrameCapture(fs.readFileSync(path.join(root,'artifacts/d1-wasm/r5frame/runs/r5f-edge-menu-on-r5frame-s8966.r5f')),{hash:await createHash()});
const allDraws=[...replayEvents(capture,3)].filter(e=>e.type==='draw');
const hex=x=>x.toString(16).toUpperCase().padStart(16,'0');
const files=fs.readdirSync(path.join(root,'artifacts/r4-shaders/wgsl-repacked'));
const cases=[];
for(const r of conversion.results){
  if(!r.revalidation?.ok)continue;
  const vs=fs.readFileSync(path.join(out,'wgsl',r.key+'.wgsl'),'utf8');
  const pairs=new Set(allDraws.filter(d=>r.draws.includes(d.index)).map(d=>hex(d.ps)));
  cases.push({key:r.key+'/own-fragment',vs,ps:'@fragment fn main() -> @location(0) vec4<f32> {return vec4<f32>(1.0);}',actualPair:false});
  for(const ps of pairs){
    const file=files.find(f=>f.includes(ps)&&f.includes('.frag.'));
    if(!file)throw Error('Missing PS '+ps);
    cases.push({key:r.key+'/'+ps,vs,ps:fs.readFileSync(path.join(root,'artifacts/r4-shaders/wgsl-repacked',file),'utf8'),actualPair:true});
  }
}
if(!cases.length)throw Error('No converted primitive cases.');
const report={cases:[],pageErrors:[],limitations:'Module and pipeline creation only; no draw, resources uploaded or original pixels verified.'};
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>R5 primitive pipelines</title>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  report.gpu=await page.evaluate(async()=>{
    const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('No WebGPU adapter');
    window.device=await adapter.requestDevice();window.errors=[];
    device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    return {vendor:adapter.info.vendor,architecture:adapter.info.architecture,limits:{maxInterStageShaderVariables:adapter.limits.maxInterStageShaderVariables}};
  });
  for(const c of cases)report.cases.push(await page.evaluate(async c=>{
    const d=window.device,result={key:c.key,actualPair:c.actualPair,vsErrors:[],psErrors:[],pipeline:false};
    d.pushErrorScope('validation');
    try{
      const vs=d.createShaderModule({code:c.vs}),ps=d.createShaderModule({code:c.ps});
      result.vsErrors=(await vs.getCompilationInfo()).messages.filter(m=>m.type==='error').map(m=>m.message);
      result.psErrors=(await ps.getCompilationInfo()).messages.filter(m=>m.type==='error').map(m=>m.message);
      if(!result.vsErrors.length&&!result.psErrors.length){
        // Additional slots are retained for multi-output PS, with writes disabled
        // in this pipeline-only probe. Missing PS outputs must not enable writes.
        await d.createRenderPipelineAsync({layout:'auto',vertex:{module:vs,entryPoint:'main'},fragment:{module:ps,entryPoint:'main',targets:Array.from({length:4},(_,i)=>({format:'rgba8unorm',writeMask:i===0?15:0}))},
          primitive:{topology:'triangle-strip',stripIndexFormat:'uint32'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'always'}});
        result.pipeline=true;
      }
    }catch(e){result.exception=e.message;}
    result.scope=(await d.popErrorScope())?.message??null;
    return result;
  },c));
  report.uncapturedErrors=await page.evaluate(()=>window.errors);
  report.variantModulesAccepted=new Set(report.cases.filter(c=>!c.vsErrors.length).map(c=>c.key.split('/')[0])).size;
  report.ownPipelines=report.cases.filter(c=>!c.actualPair&&c.pipeline).length;
  report.actualPipelines=report.cases.filter(c=>c.actualPair&&c.pipeline).length;
}catch(e){report.fatal=e.message;process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'edge-pipelines.json'),JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({variants:report.variantModulesAccepted,ownPipelines:report.ownPipelines,actualPipelines:report.actualPipelines,failures:report.cases.filter(c=>!c.pipeline).map(c=>({key:c.key,vs:c.vsErrors,ps:c.psErrors,exception:c.exception})),fatal:report.fatal},null,2));
if(report.pageErrors.length||report.uncapturedErrors?.length||report.cases.some(c=>!c.pipeline))process.exitCode=1;
