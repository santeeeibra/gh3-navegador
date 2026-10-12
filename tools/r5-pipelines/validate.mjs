import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const root=resolve(import.meta.dirname,'../..');
const nativePairs=process.argv.includes('--native-pairs');
const inventory=JSON.parse(await readFile(resolve(root,'artifacts/r5-pipelines/resources.json'),'utf8'));
const cases=await Promise.all(inventory.results.filter(r=>r.moduleValid).map(async r=>({
 ...r,code:await readFile(resolve(root,'artifacts/r4-shaders/wgsl-repacked',r.name),'utf8')
})));
const reference=cases.find(r=>r.stage==='vertex');
if(!reference)throw Error('No vertex shader');
const fragmentStub='@fragment fn main(@location(0) c:vec4<f32>) -> @location(0) vec4<f32> { return c; }';
// Negative control: real VS writes vec4<f32>, intentionally incompatible input type.
const badFragment='@fragment fn main(@location(0) @interpolate(flat) c:vec4<u32>) -> @location(0) vec4<f32> { return vec4<f32>(c); }';
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>R5 pipeline validation</title>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={purpose:'Render-pipeline creation only; VS with own FS control, FS with one reference GH3 VS. Pairings/topology/formats not captured from GH3. No draw executed.',
  referenceVertex:reference.name,results:[],pageErrors:[],nativePairs};
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});report.browser=browser.version();
  const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  report.gpu=await page.evaluate(async()=>{
    const adapter=await navigator.gpu.requestAdapter();
    window.device=await adapter.requestDevice();window.errors=[];window.losses=[];
    device.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    device.lost.then(e=>losses.push({reason:e.reason,message:e.message}));
    return {info:{vendor:adapter.info.vendor,architecture:adapter.info.architecture},
      limits:{maxInterStageShaderVariables:device.limits.maxInterStageShaderVariables,maxBindGroups:device.limits.maxBindGroups,
       maxSampledTexturesPerShaderStage:device.limits.maxSampledTexturesPerShaderStage,maxUniformBuffersPerShaderStage:device.limits.maxUniformBuffersPerShaderStage,
       maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize}};
  });
  let variants=[...cases.map(r=>({name:r.name,vertex:r.stage==='vertex'?r.code:reference.code,
    fragment:r.stage==='vertex'?fragmentStub:r.code,stage:r.stage,expected:true})),
    {name:'negative-interface-control',vertex:reference.code,fragment:badFragment,stage:'control',expected:false}];
  if(nativePairs){
    const cache=JSON.parse(await readFile(resolve(root,'artifacts/r5-pipelines/native-cache.json'),'utf8'));
    if(cache.verifiedRecords!==cache.records.length||cache.version!=='20260226')throw Error('Unverified cache');
    const hashes=new Map(cases.map(r=>[r.stage+':'+r.name.match(/shader_([0-9A-F]{16})/i)[1].toLowerCase(),r]));
    const pairs=new Map();report.skipped=[];
    for(const record of cache.records){
      const vs=hashes.get('vertex:'+record.vertex),fs=hashes.get('fragment:'+record.pixel);
      if(!vs||!fs){report.skipped.push({record:record.record,vertex:record.vertex,pixel:record.pixel,reason:record.pixel==='0000000000000000'?'no pixel shader':'module missing or rejected by Edge'});continue;}
      const key=record.vertex+':'+record.pixel;
      if(!pairs.has(key))pairs.set(key,{name:key,vertex:vs.code,fragment:fs.code,stage:'native-pair',expected:true,records:[]});
      pairs.get(key).records.push(record);
    }
    report.nativeCacheRecords=cache.verifiedRecords;
    report.nativePairMeaning='Hashes co-occur in native cache; baseline WGSL shader modifications and synthetic render states, no captured draws replayed';
    report.testedPairs=pairs.size;
    if(!pairs.size)throw Error('No supported native pairs');
    variants=[...pairs.values(),variants.at(-1)];
  }
  for(const item of variants){
    const t=performance.now();
    const result=await page.evaluate(async({vertex,fragment})=>{
      const d=device;d.pushErrorScope('validation');
      let created=false,exception=null,messages=[],scope=null;
      try{
        const vs=d.createShaderModule({code:vertex}),fs=d.createShaderModule({code:fragment});
        for(const [stage,m] of [['vertex',vs],['fragment',fs]])messages.push(...(await m.getCompilationInfo()).messages.map(x=>({stage,type:x.type,message:x.message})));
        // Collect fragment attachment locations from emitted return declarations.
        const entry=fragment.slice(fragment.lastIndexOf('@fragment'));
        const direct=entry.match(/->\s*@location\((\d+)\)/);
        const structName=entry.match(/->\s*(\w+)\s*\{/);
        let locations=[];
        if(direct)locations=[+direct[1]];
        else if(structName){
          const escaped=structName[1].replace(/[.*+?^$()|[\]\\]/g,'\\$&');
          const body=fragment.match(new RegExp('struct\\s+'+escaped+'\\s*\\{([\\s\\S]*?)\\}'))?.[1];
          if(!body)throw Error('Unknown fragment return struct');
          locations=[...body.matchAll(/@location\((\d+)\)/g)].map(m=>+m[1]);
        }else if(!entry.match(/\)\s*\{/))throw Error('Unknown fragment return signature');
        const targets=Array.from({length:locations.length?Math.max(...locations)+1:0},(_,i)=>locations.includes(i)?{format:'rgba8unorm'}:null);
        await d.createRenderPipelineAsync({layout:'auto',vertex:{module:vs,entryPoint:'main'},
          fragment:{module:fs,entryPoint:'main',targets},primitive:{topology:'triangle-list'},
          depthStencil:{format:'depth32float',depthWriteEnabled:false,depthCompare:'always'}});
        created=true;
      }catch(e){exception=e.message;}
      finally{scope=(await d.popErrorScope())?.message??null;}
      return {created:created&&!scope,exception,scope,messages};
    },item);
    report.results.push({name:item.name,stage:item.stage,records:item.records??null,expected:item.expected,elapsedMs:performance.now()-t,...result});
  }
  Object.assign(report,await page.evaluate(()=>({uncapturedErrors:errors,deviceLosses:losses})));
  report.total=variants.length-1;report.created=report.results.filter(r=>r.stage!=='control'&&r.created).length;
  report.negativeControlPassed=report.results.at(-1).created===false;
  report.ok=report.created===report.total&&report.negativeControlPassed&&!report.pageErrors.length&&!report.uncapturedErrors.length&&!report.deviceLosses.length;
}catch(e){report.ok=false;report.fatal=e.message;}
finally{
 if(browser)await browser.close();await new Promise(r=>server.close(r));
 await writeFile(resolve(root,nativePairs?'artifacts/r5-pipelines/native-pair-pipelines.json':'artifacts/r5-pipelines/pipelines.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({total:report.total,created:report.created,negativeControlPassed:report.negativeControlPassed,ok:report.ok,fatal:report.fatal}));
if(!report.ok)process.exitCode=1;
