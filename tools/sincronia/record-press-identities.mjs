import fs from 'node:fs';
import {createHash} from 'node:crypto';
const base='artifacts/d1-wasm/lagtest/demo',demo='artifacts/sincronia-rea/pulsacion/demo';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files=fs.readdirSync(base).filter(n=>fs.statSync(base+'/'+n).isFile());
const expected=new Set(['gh3-web.wasm','gh3-web.js','gh3-input.js','autopista60-tap.js','index.html']);
const rows=files.map(name=>({name,base:hash(base+'/'+name),copy:hash(demo+'/'+name)}));
const changed=rows.filter(x=>x.base!==x.copy).map(x=>x.name);
if(changed.some(n=>!expected.has(n)))throw Error('Unexpected change to copied asset: '+changed);
if(rows.find(x=>x.name==='manifest.json')?.base!==rows.find(x=>x.name==='manifest.json')?.copy)throw Error('Game manifest changed');
const sources=['press_probe.h','press-queue.mjs','press-page.mjs','prepare-press.mjs','merge-press-js.mjs','run-press.mjs','robot-press.mjs'];
const result={at:new Date().toISOString(),base,demo,compared:rows.length,changed,files:rows,
  sources:Object.fromEntries(sources.map(n=>[n,hash('tools/sincronia/'+n)])),
  generated:hash('artifacts/sincronia-rea/pulsacion/src/gh3_recomp.2.cpp'),extraPage:hash(demo+'/press-page.js')};
fs.writeFileSync('artifacts/sincronia-rea/pulsacion/identities.json',JSON.stringify(result,null,2));
console.log(JSON.stringify({compared:rows.length,changed,wasm:rows.find(x=>x.name==='gh3-web.wasm')?.copy,gameManifestUnchanged:true}));
