// Negative controls: mutate COPIES of a finished run and require that analyze.mjs
// detects and classifies each injected fault. No GPU, no browser, no game.
// usage: node tools/gpu-capture/check-negatives.mjs <label-of-good-run>
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {readJson,writeJson} from './lib.mjs';
const label=process.argv[2]||'regress-main';
const src=`artifacts/gpu-capture/runs/${label}`;
const base=`artifacts/gpu-capture/negatives`;fs.mkdirSync(base,{recursive:true});
// Remove only this script's own copies (n0, n1, ...); never the summary or other files.
const ownCopies=()=>fs.readdirSync(base).filter(n=>/^n\d+$/.test(n));
for(const n of ownCopies())fs.rmSync(`${base}/${n}`,{recursive:true,force:true});
const copy=name=>{const d=`${base}/${name}`;fs.cpSync(src,d,{recursive:true,filter:p=>!/capture\.wgpur$|\.gfxr$|\.rdc$|replay\.jsonl$/.test(p)});return d;};
const analyze=dir=>{const r=spawnSync(process.execPath,['tools/gpu-capture/analyze.mjs','neg','--run-dir',dir,'--cases-dir',`${dir}/cases`],{encoding:'utf8'});return {status:r.status,report:fs.existsSync(`${dir}/report.json`)?readJson(`${dir}/report.json`):null,err:r.stderr};};
const rdocFile=(dir,i)=>`${dir}/rdoc/draw-${String(i).padStart(3,'0')}.rgba`;
const tests=[
 ['control: unmodified copy',d=>{},r=>r.regressions.length===0&&r.opsByClass['replay-consistent']===32&&!r.cases.some(c=>c.status==='unknown')],
 ['1 pixel +2 in D3D12 draw 5 -> color-precision + regression',d=>{const f=rdocFile(d,5),b=fs.readFileSync(f);const p=(360*1280+640)*4;b[p]=b[p]<250?b[p]+2:b[p]-2;fs.writeFileSync(f,b);},
  r=>r.cases.some(c=>c.class==='color-precision'&&c.status==='unknown'&&c.draw===r.ops[5].draw)&&r.regressions.some(x=>x.draw===r.ops[5].draw)],
 ['block +60 in D3D12 draw 9 -> backend-divergence + regression',d=>{const f=rdocFile(d,9),b=fs.readFileSync(f);for(let y=100;y<110;y++)for(let x=100;x<110;x++){const p=(y*1280+x)*4;b[p]=(b[p]+60)&255;}fs.writeFileSync(f,b);},
  r=>r.cases.some(c=>c.class==='backend-divergence'&&c.draw===r.ops[9].draw)&&r.regressions.length===1],
 ['replay op bound to another texture -> capture-error (mapping)',d=>{const s=readJson(`${d}/rdoc/rdoc-state.json`);const a=s.actions.filter(x=>x.target?.name==='Dawn_InternalTexture_target')[3];a.pixelReadOnly=a.pixelReadOnly.map(t=>({...t,name:'Dawn_InternalTexture_999/texture'}));writeJson(`${d}/rdoc/rdoc-state.json`,s);},
  r=>r.cases.some(c=>c.class==='capture-error'&&/bound/.test(c.reason))],
 ['replay lost a draw -> capture-error (count)',d=>{const s=readJson(`${d}/rdoc/rdoc-state.json`);const i=s.actions.findIndex(x=>x.target?.name==='Dawn_InternalTexture_target');s.actions.splice(i,1);writeJson(`${d}/rdoc/rdoc-state.json`,s);},
  r=>r.cases.some(c=>c.class==='capture-error'&&/draws on target/.test(c.reason))],
 ['Vulkan screenshot altered -> divergence on final frame',d=>{const f=`${d}/gfxr/screenshot_frame_2.bmp`,b=fs.readFileSync(f);const off=b.readUInt32LE(10);for(let i=0;i<3000;i++)b[off+i*3+1]^=0x80;fs.writeFileSync(f,b);},
  r=>r.vulkanFinal.class==='backend-divergence'&&r.cases.some(c=>c.reason?.startsWith('Edge(D3D12) vs Vulkan'))],
 ['native replay failed -> capture-error',d=>{const s=readJson(`${d}/replay-native.json`);s.steps['dawn-vulkan'].status=3;writeJson(`${d}/replay-native.json`,s);},
  r=>r.cases.some(c=>c.class==='capture-error'&&/exit 3/.test(c.reason))],
 ['new rejected shader state -> translation, stored as unknown with resources',d=>{
   const m=readJson(`${d}/edge-manifest.json`);const fx=readJson(m.fixture.path);fx.rejected.push({draw:395,reason:'2D DRAW not supported: shader/producer (injected negative)'});
   const fp=`${d}/fixture-copy.json`;writeJson(fp,fx);m.fixture.path=fp;m.fixture.sha256=null;writeJson(`${d}/edge-manifest.json`,m);},
  r=>r.cases.some(c=>c.class==='translation'&&c.status==='unknown'&&c.saved&&fs.existsSync(path.join(c.saved,'texture-blob.bin'))&&fs.existsSync(path.join(c.saved,'case.json')))],
 ['op 3 changed upstream -> later cumulative images are a NEW sequence, not regressions',d=>{const m=readJson(`${d}/edge-manifest.json`);m.ops[3].resourceHash='0'.repeat(64);writeJson(`${d}/edge-manifest.json`,m);},
  r=>r.regressions.length===0&&r.ops.filter(o=>o.validatedKey).length===3&&r.ops.slice(3).every(o=>!o.validatedKey)],
];
const results=[];
for(const [i,[name,mutate,expect]] of tests.entries()){
 const d=copy('n'+i);mutate(d);const r=analyze(d);
 let pass=false;try{pass=!!r.report&&expect(r.report);}catch(e){}
 results.push({test:name,pass,exit:r.status,classes:r.report?.casesByClassStatus,regressions:r.report?.regressions.length});
}
writeJson(`${base}/negatives.json`,{source:src,date:new Date().toISOString(),passed:results.filter(r=>r.pass).length,total:results.length,results});
// Keep copies of failing tests for inspection; delete passing ones (~250 MB each).
results.forEach((r,i)=>{if(r.pass)fs.rmSync(`${base}/n${i}`,{recursive:true,force:true});});
for(const r of results)console.log(r.pass?'PASS':'FAIL',r.test,JSON.stringify(r.classes),'regr',r.regressions,'exit',r.exit);
if(results.some(r=>!r.pass))process.exitCode=1;
