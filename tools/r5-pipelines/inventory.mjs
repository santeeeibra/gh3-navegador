import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..');
const report=JSON.parse(await readFile(resolve(root,'artifacts/r4-shaders/edge-repacked.json'),'utf8'));
const results=[];
for(const result of report.results){
  const code=await readFile(resolve(root,'artifacts/r4-shaders/wgsl-repacked',result.name),'utf8');
  const bindings=[...code.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<([^>]+)>)?\s+(\w+)\s*:\s*([^;]+);/g)]
    .map(m=>({group:+m[1],binding:+m[2],addressSpace:m[3]??'handle',name:m[4],type:m[5].trim()}));
  const declarationCount=[...code.matchAll(/@group\(/g)].length;
  if(bindings.length!==declarationCount)throw Error('Binding parser did not cover shader '+result.name);
  results.push({name:result.name,stage:result.name.includes('.vert.')?'vertex':'fragment',moduleValid:result.moduleValid,
    sha256:createHash('sha256').update(code).digest('hex'),bindings});
}
await writeFile(resolve(root,'artifacts/r5-pipelines/resources.json'),JSON.stringify({
  purpose:'Static declarations in translated WGSL; does not determine used bindings for a pipeline or real textures/draw state',
  total:results.length,results},null,2)+'\n');
console.log(JSON.stringify({total:results.length,bindings:results.reduce((n,r)=>n+r.bindings.length,0)}));
