// Claude 2026-10-16: copia de tools/sincronia/analyze-press.mjs (Codex) que escribe en c1id (no pisa su análisis).
import fs from 'node:fs';
import {leerChart} from '../accesos/robot.mjs';
const notes=leerChart('slowride').notes;
const quant=a=>{a=a.filter(Number.isFinite).sort((a,b)=>a-b);return {n:a.length,min:a[0]??null,p50:a[Math.floor(a.length*.5)]??null,p95:a[Math.min(a.length-1,Math.floor(a.length*.95))]??null,max:a.at(-1)??null};};
const args=process.argv.slice(2);const result={at:new Date().toISOString(),cases:[]};
for(const dir of args){const prefix=dir.includes('/')?dir:'artifacts/gh3-liviano/accesos/'+dir;
  const r=JSON.parse(fs.readFileSync(prefix+'/resultado.json')),p=JSON.parse(fs.readFileSync(prefix+'/sync-probe.json'));
  const evals=p.press?.acks||[],results=p.pressResults||[],inputs=p.pressInput||[];
  const hits=p.judgements.filter(e=>e.index<18);
  const presses=r.muestras.at(-1)?.robot?.presses||[];
  const rows=hits.map(e=>{const outcome=results.find(x=>x.kind===e.kind&&x.index===e.index&&Math.abs(x.at-e.at)<5);
    const ev=outcome?.selected?evals.find(x=>x.id===outcome.id):null;
    const pr=presses.find(x=>x.index===e.index),input=ev?inputs.find(x=>x.id===ev.id):null;
    const queuedPress=ev?presses.find(x=>x.queueId===ev.id):null;
    const row=p.rows.reduce((best,x)=>Math.abs(x.cp.at-e.at)<Math.abs(best.cp.at-e.at)?x:best,p.rows[0]);
    const earlyMs=row?.cp.earlySec*1000,usedMs=ev?ev.usedMs:e.baseMs;
    const centre=Math.fround(Math.fround(usedMs)+e.inputOffsetMs)-earlyMs;
    return {index:e.index,kind:e.kind,noteMs:notes[e.index]?.t,queueId:ev?.id??null,originalStrum:input?.strummed??null,
      capturedButtons:ev?.buttons??null,originalFrets:input?.frets??null,originalHeld:input?.held??null,
      eventToJudgementMs:ev?e.at-ev.eventAt:null,writeToJudgementMs:ev?e.at-ev.writtenAt:null,
      originalDelayGameMs:ev?ev.nativeMs-ev.baseAtWrite:null,appliedGameCorrectionMs:ev?ev.nativeMs-ev.usedMs:null,
      pressClockErrorMs:pr?pr.clock-notes[e.index]?.t:null,judgementErrorMs:centre-notes[e.index]?.t,
      nativeBaseMs:e.baseMs,usedMs,eventAt:ev?.eventAt??null,judgedAt:e.at,
      capturedForIndex:queuedPress?.index??null,deferredExpirations:ev?.deferredExpirations??null,domMs:ev?.domMs??null,baseAtWrite:ev?.baseAtWrite??null,poll:ev?.poll??null,gapPolls:ev?.gapPolls??null,consumedAt:ev?.consumedAt??null};
  });
  const selected=rows.filter(x=>x.queueId!==null),h=rows.filter(x=>x.kind===1),m=rows.filter(x=>x.kind===2);
  result.cases.push({dir,ok:r.ok,error:r.error??null,pageErrors:r.erroresPagina,quality:r.calidadUsada,
    hits:h.length,misses:m.length,missed:m.map(x=>x.index),selected:selected.length,totalEvaluations:evals.length,
    pressEvents:p.press?.events?.length,mode:p.press?.mode,queuePtr:p.press?.ptr,queueStats:p.press?.queueStats??null,
    rejectReasons:p.pressRejects??[],deferredExpirations:evals.reduce((a,x)=>a+(x.deferredExpirations||0),0),
    hitMappedToDifferentPress:h.filter(x=>x.capturedForIndex!==null&&x.capturedForIndex!==x.index),
    actualDeliveryDelayMs:quant(presses.map(x=>x.deliveredAt-x.queuedAt)),
    delayMs:quant(selected.map(x=>x.eventToJudgementMs)),originalGameDelayMs:quant(selected.map(x=>x.originalDelayGameMs)),
    hitErrorMs:quant(h.map(x=>x.judgementErrorMs)),pressClockErrorMs:quant(rows.map(x=>x.pressClockErrorMs)),
    layerFPS:r.senales?.capaImgS,audioUnderruns:r.senales?.cortesEnTramo,audioSkips:r.senales?.saltosEnTramo,
    mismatchedStrum:inputs.filter(x=>x.strummed!==1),unmatchedPresses:presses.filter(pr=>!evals.some(ev=>ev.id===pr.queueId)),rows});
}
fs.writeFileSync(process.env.OUT||'artifacts/sincronia-rea/c1id/analysis.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result.cases.map(({rows,mismatchedStrum,unmatchedPresses,...c})=>({...c,mismatchedStrums:mismatchedStrum.length,unmatchedPresses:unmatchedPresses.length})),null,2));
