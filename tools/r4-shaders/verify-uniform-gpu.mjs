import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
import {packUniform} from './pack-uniform.mjs';
const root=resolve(import.meta.dirname,'../..');
const maps=JSON.parse(await readFile(resolve(root,'artifacts/r4-shaders/uniform-layouts.json'),'utf8'));
const entries=Object.entries(maps);
assert.equal(entries.length,71);
const [name,layout]=entries[0];
assert(entries.every(([,m])=>JSON.stringify(m)===JSON.stringify(layout)),'Uniform maps differ; each needs its own fixture');
const wgsl=await readFile(resolve(root,'artifacts/r4-shaders/wgsl-repacked',name+'.wgsl'),'utf8');
const uniformStruct=wgsl.match(/struct XeSystemConstants \{[\s\S]*?\n\}/)?.[0];
assert(uniformStruct,'Converted shader has no constants struct');
const source=new Uint8Array(layout.sourceBytes);
const view=new DataView(source.buffer), statements=[], expected=[];
function leaves(type,expr,offset){
  if(type.kind==='scalar'){
    // Finite, distinct positive f32 bit patterns; preserved also as signed/unsigned integers.
    const word=(0x3f000000+offset*113)>>>0;
    view.setUint32(offset,word,true);
    statements.push('out.values['+expected.length+'] = '+(type.wgsl==='u32'?expr:'bitcast<u32>('+expr+')')+';');
    expected.push(word);
  }else if(type.kind==='vector'){
    for(let i=0;i<type.count;i++)leaves(type.base,expr+'['+i+']',offset+i*4);
  }else if(type.kind==='array'){
    for(let i=0;i<type.count;i++)leaves(type.base,expr+'['+i+']',offset+i*type.stride);
  }else throw Error('Unsupported fixture type');
}
for(const f of layout.members)leaves(f,'u.'+f.name,f.sourceOffset);
const packed=packUniform(source,layout);
assert.throws(()=>packUniform(source.subarray(1),layout),/Invalid/);
assert.throws(()=>packUniform(source,{...layout,members:[{sourceOffset:0,gpuOffset:layout.gpuBytes,size:4}]}),/bounds/);
assert.throws(()=>packUniform(source,{...layout,members:[layout.members[0],layout.members[0]]}),/Overlapping/);
const code=uniformStruct+'\nstruct Output { values: array<u32>, }\n'+
 '@group(0) @binding(0) var<uniform> u: XeSystemConstants;\n'+
 '@group(0) @binding(1) var<storage, read_write> out: Output;\n'+
 '@compute @workgroup_size(1) fn main() {\n'+statements.join('\n')+'\n}\n';
await writeFile(resolve(root,'artifacts/r4-shaders/uniform-probe.wgsl'),code);
const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Uniform packing probe</title>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const report={purpose:'Bitwise GPU reads of every constants scalar/component using the actual converted uniform struct; no GH3 rendering',sourceBytes:layout.sourceBytes,gpuBytes:layout.gpuBytes,shadersSharingMap:entries.length,components:expected.length};
let browser;
try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  report.browser=browser.version();
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port);
  Object.assign(report,await page.evaluate(async({code,packed,count})=>{
    const a=await navigator.gpu.requestAdapter(), d=await a.requestDevice(), errors=[],lost=[];
    d.addEventListener('uncapturederror',e=>errors.push(e.error.message));
    d.lost.then(e=>lost.push({reason:e.reason,message:e.message}));
    d.pushErrorScope('validation');
    const m=d.createShaderModule({code}), messages=(await m.getCompilationInfo()).messages.map(x=>({type:x.type,message:x.message}));
    const p=await d.createComputePipelineAsync({layout:'auto',compute:{module:m,entryPoint:'main'}});
    const u=d.createBuffer({size:packed.length,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const out=d.createBuffer({size:count*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC});
    const read=d.createBuffer({size:count*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    d.queue.writeBuffer(u,0,new Uint8Array(packed));
    const group=d.createBindGroup({layout:p.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:u}},{binding:1,resource:{buffer:out}}]});
    const enc=d.createCommandEncoder(),pass=enc.beginComputePass();pass.setPipeline(p);pass.setBindGroup(0,group);pass.dispatchWorkgroups(1);pass.end();
    enc.copyBufferToBuffer(out,0,read,0,count*4);d.queue.submit([enc.finish()]);
    await read.mapAsync(GPUMapMode.READ);
    const values=[...new Uint32Array(read.getMappedRange())];read.unmap();
    const scope=(await d.popErrorScope())?.message??null;
    u.destroy();out.destroy();read.destroy();
    return {values,messages,errors,lost,scope};
  },{code,packed:[...packed],count:expected.length}));
  report.expected=expected;
  report.matched=report.values.filter((word,i)=>word===expected[i]).length;
  assert.deepEqual(report.values,expected,'GPU read a different field value');
  assert.equal(report.scope,null);assert.equal(report.errors.length,0);assert.equal(report.lost.length,0);
  report.ok=true;
}catch(e){report.ok=false;report.error=e.message;}
finally{
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
  await writeFile(resolve(root,'artifacts/r4-shaders/uniform-probe.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({ok:report.ok,components:report.components,matched:report.matched,error:report.error}));
if(!report.ok)process.exitCode=1;
