import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {leerChart} from '../accesos/robot.mjs';
const root='artifacts/gh3-liviano/accesos/',notes=leerChart('slowride').notes;
const quant=values=>{const a=values.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,min:a[0],p50:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],max:a.at(-1)};};
const cases=[['visual','2026-10-16T20-23-12-mira'],['original-timeline','2026-10-16T20-26-02-bien']];
const result={at:new Date().toISOString(),note:'Short diagnostic runs; no gameplay correction, physical latency validation or whole-game FPS certification.',cases:[]};
for(const [kind,dir] of cases){
  const r=JSON.parse(fs.readFileSync(root+dir+'/resultado.json'));
  const p=JSON.parse(fs.readFileSync(root+dir+'/sync-probe.json'));
  const presses=r.muestras.at(-1)?.robot?.presses||[];
  const native=p.judgements.filter(e=>e.index<18).map(e=>{
    const row=p.rows.reduce((best,row)=>Math.abs(row.cp.at-e.at)<Math.abs(best.cp.at-e.at)?row:best,p.rows[0]);
    const early=row.cp.earlySec*1000,centre=Math.fround(Math.fround(e.baseMs)+e.inputOffsetMs)-early;
    const press=presses.find(x=>x.index===e.index);
    return {...e,noteMs:notes[e.index].t,earlyMs:early,lateMs:row.cp.lateSec*1000,
      inputJudgementMs:centre,noteMinusJudgementMs:notes[e.index].t-centre,
      sinceProgrammedPressMs:press?e.at-press.at:null};
  });
  const sample=p.rows.filter(x=>x.cp.baseSec>3&&x.cp.baseSec<17);
  const hit=native.filter(e=>e.kind===1),miss=native.filter(e=>e.kind===2);
  result.cases.push({kind,dir,ok:r.ok,pageErrors:r.erroresPagina,seconds:r.fin.ms/1000,
    nativeHits:hit.length,nativeMisses:miss.length,missedIndices:miss.map(e=>e.index),
    actualHitErrorMs:quant(hit.map(e=>e.noteMinusJudgementMs)),
    pressToJudgementMs:quant(hit.map(e=>e.sinceProgrammedPressMs)),
    baseToLegacyEdgeMs:quant(sample.map(x=>x.cp.legacyEdgeMs-x.cp.baseSec*1000)),
    baseMinusEstimatedAudioMs:quant(sample.map(x=>x.cp.baseSec*1000-x.page.audioMs)),
    captureCostMs:quant(sample.map(x=>x.cp.finishedAt-x.cp.at)),
    overlayFPS:r.senales.capaImgS,underruns:r.senales.cortesEnTramo,skips:r.senales.saltosEnTramo,
    events:native});
}
result.identities=Object.fromEntries(['gh3-web.wasm','gh3-web.js','manifest.json'].map(f=>[f,{base:createHash('sha256').update(fs.readFileSync('artifacts/d1-wasm/lagtest/demo/'+f)).digest('hex'),instrumented:createHash('sha256').update(fs.readFileSync('artifacts/sincronia-rea/judgement/demo/'+f)).digest('hex')}]));
fs.writeFileSync('artifacts/sincronia-rea/judgement-analysis.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result.cases.map(({events,...c})=>c),null,2));
