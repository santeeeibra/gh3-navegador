// Claude 2026-10-23: resumen de cortes/saltos/velocidad del audio a partir de resultado.json de med.mjs (muestras con audioDiag).
// Uso: node tools/modelos/resumen-audio.mjs [carpeta-de-salida]   (sin argumento: la más reciente de artifacts/gh3-liviano/accesos)
import fs from 'node:fs';
import path from 'node:path';
const base = 'D:/guitar hero/artifacts/gh3-liviano/accesos';
const dir = process.argv[2] || path.join(base, fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'resultado.json'))).sort().at(-1));
const r = JSON.parse(fs.readFileSync(path.join(dir, 'resultado.json'), 'utf8'));
const ms = r.muestras.filter(m => m.audioDiag && m.clock > 0);
if (!ms.length) { console.log('Sin muestras de audio durante la canción en', dir); process.exit(1); }
const s0 = ms[0].audioDiag, avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, f = (x, n = 1) => x == null ? '-' : x.toFixed(n);
console.log('Carpeta:', dir, '| calidad:', r.calidadUsada?.used ?? r.calidadUsada, '| muestras:', ms.length, '| canción:', Math.round(ms.at(-1).clock / 1000), 's');
console.log('Estado del audio:', s0.state, '| salida:', s0.outputLatency != null ? Math.round(s0.outputLatency * 1000) + ' ms de latencia' : '-');
const eventos = [];
for (let i = 1; i < ms.length; i++) {
  const a = ms[i - 1].audioDiag, b = ms[i].audioDiag, t = Math.round(ms[i].clock / 1000);
  if (b.underruns > a.underruns) eventos.push(`${t} s: CORTE (+${b.underruns - a.underruns}), colchón ${b.lagMs} ms, juego ${ms[i].juegoPct}%`);
  if (b.skips > a.skips) eventos.push(`${t} s: SALTO (+${b.skips - a.skips}), colchón ${b.lagMs} ms, juego ${ms[i].juegoPct}%`);
}
console.log(`\nTotal desde que arrancó la canción: cortes +${ms.at(-1).audioDiag.underruns - s0.underruns}, saltos +${ms.at(-1).audioDiag.skips - s0.skips}, bloques en silencio +${ms.at(-1).audioDiag.silentBlocks - s0.silentBlocks}`);
console.log(eventos.length ? '\nEventos (cada muestra es de ~2 s):\n  ' + eventos.join('\n  ') : '\nSin cortes ni saltos durante la canción.');
console.log('\nPor tramo de 30 s: cortes | saltos | ritmo del audio mín/prom/máx | colchón mín/máx ms | juego % prom/mín');
for (let ini = 0; ini < ms.at(-1).clock / 1000; ini += 30) {
  const T = ms.filter(m => m.clock / 1000 >= ini && m.clock / 1000 < ini + 30); if (T.length < 2) continue;
  const ra = T.map(m => m.audioDiag.ratio).filter(Number.isFinite), lg = T.map(m => m.audioDiag.lagMs).filter(Number.isFinite), jp = T.map(m => m.juegoPct).filter(Number.isFinite);
  console.log(`${String(ini).padStart(4)}-${String(ini + 30).padEnd(4)} s: ${T.at(-1).audioDiag.underruns - T[0].audioDiag.underruns} | ${T.at(-1).audioDiag.skips - T[0].audioDiag.skips} | ${f(Math.min(...ra), 3)}/${f(avg(ra), 3)}/${f(Math.max(...ra), 3)} | ${Math.min(...lg)}/${Math.max(...lg)} | ${f(avg(jp), 0)}/${f(Math.min(...jp), 0)}`);
}
const ra = ms.map(m => m.relojAudio).filter(Boolean).at(-1);
if (ra) console.log(`\nGancho reloj-audio: ${ra.nCorr} correcciones, error medio ${f(ra.meanAbsErrMs)} ms, máximo ${f(ra.maxAbsErrMs, 0)} ms, topadas ${ra.nCapped}`);
