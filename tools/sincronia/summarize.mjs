import fs from 'node:fs';
import {atrasos} from '../accesos/robot-visual.mjs';
const runs = ['2026-10-16T19-53-43-mira', '2026-10-16T19-55-16-mira'];
const summaries = runs.map(run => {
  const root = `artifacts/gh3-liviano/accesos/${run}`;
  const r = JSON.parse(fs.readFileSync(`${root}/resultado.json`, 'utf8'));
  const s = r.muestras.filter(m => m.clock > 0 && m.clock <= 20000);
  const a = s[0], b = s.at(-1), dt = (b.ms-a.ms)/1000;
  const strums = JSON.parse(fs.readFileSync(`${root}/rasgueos-mira.json`, 'utf8')).filter(s => s.c > 3500 && s.c <= 20000);
  return {run, mode: a.clockMode, wallSeconds: r.fin.ms/1000, ok: r.ok, pageErrors: r.erroresPagina,
    commonWindow: {fromClock: a.clock, toClock: b.clock, wallSeconds: dt,
      overlayFPS: (b.capaMostradas-a.capaMostradas)/dt, clockRate: (b.clock-a.clock)/(dt*1000),
      outOfRangeFrames: b.capaOutOfRange-a.capaOutOfRange,
      underruns: b.cortes-a.cortes, skips: b.saltos-a.saltos,
      robotTimingHeuristic: atrasos(strums, r.tema)},
    fullRun: r.senales, visual: {programadas: r.visual.programadas, strums: r.visual.strums,
      missedNoteHeuristic: r.visual.fallosVistos, timingHeuristic: r.visual.atraso},
    note: 'Timing is nearest chart note heuristic, not original score, accuracy percentage, or audible latency.'};
});
fs.writeFileSync('artifacts/sincronia-ritmo/comparison.json', JSON.stringify(summaries,null,2));
console.log(JSON.stringify(summaries.map(({mode,commonWindow,wallSeconds})=>({mode,commonWindow,wallSeconds})),null,2));
