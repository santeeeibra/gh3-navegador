// Claude 2026-10-13 (B1): tabla de velocidad del juego a partir de corridas de run-song.mjs (verification.json).
// Uso: node tools/r5-native60/speed-table.mjs <carpeta-corrida>... → imprime una fila por corrida (Markdown).
// Juego % = swaps del juego/s ÷ 60 (renderer.swap); reloj % = avance del reloj de canción ÷ tiempo real; imágenes/s aparte.
import fs from 'node:fs';
import path from 'node:path';
const rows = ['| corrida | afinidad | canción s | juego % (swaps/s) | reloj % | imágenes/s | producción audio | cortes canción | medidor página (juego/reloj) |', '|---|---|---|---|---|---|---|---|---|'];
for (const dir of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(path.join(dir, 'verification.json'), 'utf8'));
  const s = (r.samples || []).filter((x) => Number.isFinite(x.clock) && x.clock > 2000);
  if (s.length < 2) { rows.push(`| ${path.basename(dir)} | ${r.affinity?.mask ?? '—'} | sin muestras de canción | | | | | | |`); continue; }
  const a = s[0], b = s.at(-1), dt = (b.t - a.t) / 1000, f = (v) => Math.round(v * 10) / 10;
  const sw = Number.isFinite(a.renderer?.swap) && Number.isFinite(b.renderer?.swap) ? (b.renderer.swap - a.renderer.swap) / dt : null;
  const clock = (b.clock - a.clock) / 1000 / dt, img = (b.presented - a.presented) / dt;
  const under = b.audio && a.audio ? b.audio.underruns - a.audio.underruns : null;
  const sp = b.speed || {};
  rows.push(`| ${path.basename(dir)} | ${r.affinity?.mask ?? 'todas'} | ${f(dt)} | ${sw === null ? '—' : Math.round(sw / 60 * 100) + ' (' + f(sw) + ')'} | ${Math.round(clock * 100)} | ${f(img)} | ${b.audio?.productionRatio ? b.audio.productionRatio.toFixed(3) : '—'} | ${under ?? '—'} | ${sp.juegoPct ?? '—'} / ${sp.relojPct ?? '—'} |`);
}
console.log(rows.join('\n'));
