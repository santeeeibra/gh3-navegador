// Mark a stored case as KNOWN (classified, not a regression lock). Requires evidence:
// an AI or a person may propose the note, but it is only recorded with a concrete
// verification reference (file:line, run, or command output).
// usage: node tools/gpu-capture/promote.mjs <caseKeyPrefix...> --note "<cause>" --evidence "<refs>"
import fs from 'node:fs';
import {readJson,writeJson} from './lib.mjs';
const a=process.argv.slice(2),ni=a.indexOf('--note'),ei=a.indexOf('--evidence');
if(ni<0||ei<0)throw Error('--note and --evidence are required');
const note=a[ni+1],evidence=a[ei+1],prefixes=a.filter((x,i)=>!x.startsWith('--')&&i!==ni+1&&i!==ei+1);
const KNOWN='tools/gpu-capture/known-cases.json',known=fs.existsSync(KNOWN)?readJson(KNOWN):{version:1,cases:{}};
for(const p of prefixes){
 const dir=`artifacts/gpu-capture/cases/${p.slice(0,16)}`;
 if(!fs.existsSync(`${dir}/case.json`))throw Error('no stored case '+p);
 const c=readJson(`${dir}/case.json`);
 known.cases[c.key]={status:'known',class:c.class,draw:c.draw??null,reason:c.reason,note,evidence,date:new Date().toISOString().slice(0,10)};
 console.log('known',c.key.slice(0,16),c.class,c.draw);
}
writeJson(KNOWN,known);
