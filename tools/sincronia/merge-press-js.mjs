import fs from 'node:fs';
import {splitAsmConsts as split} from './asm-consts.mjs';
const dir='artifacts/sincronia-rea/pulsacion/web/';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
const old=split(read('artifacts/d1-wasm/recorte2/web/gh3-web.js')),next=split(read(dir+'gh3-web.js'));
const exportLine=/^var \S+ = .*createExportWrapper\(/;
const outsideShape=s=>{const lines=s.split('\n');return JSON.stringify({exports:lines.filter(l=>exportLine.test(l)).sort(),rest:lines.filter(l=>!exportLine.test(l))});};
if(outsideShape(old.outside)!==outsideShape(next.outside))throw Error('Unexpected change outside ASM constants/export order');
const published=read('artifacts/d1-wasm/lagtest/demo/gh3-web.js'),p=split(published),pubMap=new Map(p.entries.map(e=>[e.key,e.body]));
const used=new Set(),mapping=new Map(),entries=new Map();
for(const e of old.entries){const aliases=next.entries.filter(n=>n.body===e.body);
  if(!aliases.length||!pubMap.has(e.key))throw Error('Missing original ASM body '+e.key);
  mapping.set(e.key,aliases.map(n=>n.key));
  for(const n of aliases){const patched=pubMap.get(e.key);
    if(entries.has(n.key)&&entries.get(n.key).body!==patched)throw Error('Ambiguous patched alias '+n.key);
    entries.set(n.key,{key:n.key,body:patched});used.add(n.key);
  }
}
for(const e of p.entries)if(!mapping.has(e.key))throw Error('Unknown published ASM body '+e.key);
const added=next.entries.filter(e=>!used.has(e.key));
if(added.length!==6)throw Error('Expected six tracing constants, got '+added.length);
for(const e of added)entries.set(e.key,e);
const text=published.slice(0,p.start)+'var ASM_CONSTS = {\n'+[...entries.values()].map(e=>`  ${e.key}: ${e.body}`).join(',\n')+'\n};'+published.slice(p.end);
const target='artifacts/sincronia-rea/pulsacion/demo/gh3-web.js';if(fs.existsSync(target))fs.unlinkSync(target);fs.writeFileSync(target,text);
fs.writeFileSync(dir+'merge-verification.json',JSON.stringify({outsideUnchanged:old.outside===next.outside,exportOrderOnly:old.outside!==next.outside,mapping:[...mapping],newConstants:added.map(e=>e.key)},null,2));
console.log('Local loader merged: published patches preserved; six tracing constants, original aliases verified.');
