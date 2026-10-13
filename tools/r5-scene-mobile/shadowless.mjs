// Explicit partial rendering variant: retain original material/geometry, omit
// unavailable GPU-produced PCF shadow maps 14/15. Not an exact console shader.
import fs from 'node:fs';import {createHash} from 'node:crypto';
const root='artifacts/r5-scene-mobile',manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),base=JSON.parse(fs.readFileSync(root+'/shaders.json'));
if(!fs.existsSync(root+'/shaders-before-shadowless.json'))fs.copyFileSync(root+'/shaders.json',root+'/shaders-before-shadowless.json');
const ids=['03E8358C924F9C12','0B90B4BAC9512015','27D5AB81F65596D1','3F88B99E4D4A4A49','A779D69AFEB97FEA','B4AF723D5985CB55','E02B4484BDF52D78','6026724018EE420D','FDE438D075BE4179','A7428E482C8F239E'],audit=[];
const close=(s,open)=>{let depth=1,p=open+1;for(;p<s.length;p++){if(s[p]==='{')depth++;if(s[p]==='}'&&!--depth)return p+1;}throw Error('WGSL brace');};
for(const id of ids){
 const m=manifest[id],original=fs.readFileSync(m.wgsl,'utf8');let code=original;const removed=[];
 if(['6026724018EE420D','FDE438D075BE4179','A7428E482C8F239E'].includes(id)){
  // These actor materials sample PCF unconditionally. A far-plane depth means
  // no occluder; keep their original compare/lighting/math and vertex shader.
  let samples=0;
  code=code.replace(/textureSample(?:Grad|Level)\(xe_texture(?:14|15)_[^,]+,[\s\S]*?(?=;)/g,call=>{
   // All generated fetch expressions end at the statement terminator; there
   // is exactly one sample per let. Leave no shadow resource binding alive.
   if(!call.endsWith(')'))throw Error('Shadow sample expression');samples++;return 'vec4<f32>(1f)';
  });
  if(samples!==16)throw Error('Expected eight signed/unsigned PCF fetches '+id+':'+samples);
  base[id]={id,stage:m.stage,constants:m.constants,code,shadowless:true};audit.push({id,source:m.wgsl,samples,approximation:'neutral far-plane depth for unavailable PCF maps14/15',sourceSHA256:createHash('sha256').update(original).digest('hex'),variantSHA256:createHash('sha256').update(code).digest('hex')});continue;
 }
 for(const slot of [14,15]){
  const candidates=[];
  for(const match of code.matchAll(/\bif\s+_e\d+\s*\{/g)){
   const open=code.indexOf('{',match.index),first=close(code,open);let end=first;
   const other=/^\s*else\s*\{/.exec(code.slice(first));if(other)end=close(code,first+other[0].lastIndexOf('{'));
   const body=code.slice(match.index,end),textures=[...new Set([...body.matchAll(/xe_texture(\d+)_/g)].map(m=>Number(m[1])))];
   if(textures.length===1&&textures[0]===slot&&(body.match(/textureSample(?:Grad|Level)/g)||[]).length>=4)candidates.push({start:match.index,end,body});
  }
  candidates.sort((a,b)=>b.body.length-a.body.length);const c=candidates[0];if(!c)throw Error('No isolated PCF block '+id+'/'+slot);
  removed.push({slot,bytes:c.body.length,sha256:createHash('sha256').update(c.body).digest('hex')});
  code=code.slice(0,c.start)+`// Partial variant: PCF map ${slot} unavailable.\n`+code.slice(c.end);
 }
 // The original code initializes r0.z to the shadow coefficient ceiling;
 // with both PCF blocks absent it remains untouched. Use the unshadowed ceiling.
 const anchor='// Partial variant: PCF map 15 unavailable.\n';
 code=code.replace(anchor,anchor+'xe_var_registers[0i].y = xe_var_registers[0i].z;\n');
 for(const slot of [14,15])for(const name of ['xe_texture'+slot+'_2d_u','xe_texture'+slot+'_2d_s','xe_sampler'+slot+'_fff'])if(code.split(name).length>2)throw Error('Residual shadow read '+id+'/'+name);
 base[id]={id,stage:m.stage,constants:m.constants,code,shadowless:true};audit.push({id,source:m.wgsl,sourceSHA256:createHash('sha256').update(original).digest('hex'),variantSHA256:createHash('sha256').update(code).digest('hex'),removed,approximation:'original r0.z ceiling replaces unavailable PCF shadow coefficient'});
}
fs.writeFileSync(root+'/shaders.json',JSON.stringify(base));fs.writeFileSync(root+'/shadowless-audit.json',JSON.stringify(audit,null,1));console.log(JSON.stringify({variants:audit.length,shaders:Object.keys(base).length}));
