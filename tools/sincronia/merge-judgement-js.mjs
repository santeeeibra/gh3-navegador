// Preserve published loader patches while adding the one new EM_ASM probe.
import fs from 'node:fs';
const dir='artifacts/sincronia-rea/judgement/web/';
const read=p=>fs.readFileSync(p,'utf8').replaceAll('\r\n','\n');
function split(text) {
  const start=text.indexOf('var ASM_CONSTS = {'),end=text.indexOf('\n};',start)+3;
  if(start<0||end<3)throw Error('No se encontró ASM_CONSTS');
  const block=text.slice(start,end),re=/^\s*(\d+): /gm,matches=[...block.matchAll(re)];
  const entries=matches.map((m,i)=>({key:m[1],body:block.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:block.lastIndexOf('\n}')).trim().replace(/,$/,'')}));
  return {start,end,entries,outside:text.slice(0,start)+'ASM_CONSTS'+text.slice(end)};
}
const old=split(read('artifacts/d1-wasm/recorte2/web/gh3-web.js')),next=split(read(dir+'gh3-web.js'));
const exportLine=/^var \S+ = .*createExportWrapper\(/;
const outsideShape=s=>{const lines=s.split('\n');return JSON.stringify({exports:lines.filter(l=>exportLine.test(l)).sort(),rest:lines.filter(l=>!exportLine.test(l))});};
if(outsideShape(old.outside)!==outsideShape(next.outside))throw Error('Cambios de JS fuera de las constantes/exportaciones: revisar antes de integrar.');
const used=new Set(),mapping=new Map();
for(const e of old.entries) {
  const n=next.entries.filter(n=>n.body===e.body);
  if(n.length!==1)throw Error('No hay correspondencia única para '+e.key);
  mapping.set(e.key,n[0].key);used.add(n[0].key);
}
const published=read('artifacts/d1-wasm/lagtest/demo/gh3-web.js'),p=split(published);
const entries=p.entries.map(e=>{if(!mapping.has(e.key))throw Error('Constante publicada desconocida '+e.key);return {...e,key:mapping.get(e.key)};});
const added=next.entries.filter(e=>!used.has(e.key));
if(added.length!==1)throw Error('Se esperaba una sola constante nueva de registro.');
entries.push(...added);
const text=published.slice(0,p.start)+'var ASM_CONSTS = {\n'+entries.map(e=>`  ${e.key}: ${e.body}`).join(',\n')+'\n};'+published.slice(p.end);
const target='artifacts/sincronia-rea/judgement/demo/gh3-web.js';
if(fs.existsSync(target))fs.unlinkSync(target);
fs.writeFileSync(target,text);
fs.writeFileSync(dir+'merge-verification.json',JSON.stringify({outsideUnchanged:old.outside===next.outside,exportOrderOnly:old.outside!==next.outside,mapping:[...mapping],newConstants:added.map(e=>e.key)},null,2));
console.log('JS integrado: parches publicados conservados y una constante nueva.');
