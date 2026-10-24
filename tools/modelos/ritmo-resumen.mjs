// Claude 2026-10-23 (fluido A): junta ritmo-cuadros + senales de resultado.json de varias corridas. Uso: node ritmo-resumen.mjs <indice.txt> [etiqueta]
import fs from 'node:fs';
import path from 'node:path';
import {ritmo} from './ritmo-cuadros.mjs';
const filt = process.argv[3];
for (const l of fs.readFileSync(process.argv[2], 'utf8').split('\n')) {
  const m = l.match(/^(\S+) (\d+) "out":"(.*)"$/); if (!m || filt && m[1] !== filt) continue;
  const d = m[3].replace(/\\/g, '/'); let r = {}, s = {};
  try { r = ritmo(d); } catch (e) { r = {error: e.message}; }
  try { s = JSON.parse(fs.readFileSync(path.join(d, 'resultado.json'), 'utf8')).senales || {}; } catch {}
  console.log(m[1], m[2], JSON.stringify({hz: r.hzPantalla, rafs: r.rafs, cambS: r.cambiosPorSeg, p50: r.intervaloMs?.p50, p95: r.intervaloMs?.p95, p99: r.intervaloMs?.p99, max: r.intervaloMs?.max, pctMay: r.pctMayorAlCuadroMas2ms, juegoPct: s.juegoPctProm, peor: s.juegoPctPeor, imgEsc: s.imgEscenaSProm, capaImgS: s.capaImgS, err: r.error}));
}
