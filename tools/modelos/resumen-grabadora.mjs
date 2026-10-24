// Claude 2026-10-23: resumen de grabadora.jsonl (med.mjs --grabar). Uso: node tools/modelos/resumen-grabadora.mjs [carpeta]
import fs from 'node:fs';
import path from 'node:path';
const base = 'D:/guitar hero/artifacts/gh3-liviano/accesos';
const dir = process.argv[2] || path.join(base, fs.readdirSync(base).filter(d => fs.existsSync(path.join(base, d, 'grabadora.jsonl'))).sort().at(-1));
const L = fs.readFileSync(path.join(dir, 'grabadora.jsonl'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x));
const seg = L.flatMap(x => x.seg), ev = L.flatMap(x => x.ev), err = L.map(x => x.err).find(Boolean);
if (err) console.log('Error de la grabadora:', err);
const song = seg.filter(s => s.clock > 0), evs = ev.filter(e => e.clock > 0);
console.log('Carpeta:', dir, '| segundos grabados en canción:', song.length);
if (!song.length) process.exit(1);
const pct = s => s.frames / (s.ms * 48) * 100, avg = a => a.reduce((x, y) => x + y, 0) / a.length;
const P = song.map(pct).sort((a, b) => a - b);
console.log(`Entrega de audio del juego (100 % = tiempo real): mínimo ${P[0].toFixed(0)} % | 5 % peor ${P[Math.floor(P.length * .05)].toFixed(0)} % | promedio ${avg(P).toFixed(1)} % | máximo ${P.at(-1).toFixed(0)} %`);
console.log(`Paradas de escritura (>40 ms sin que el juego escriba): ${evs.filter(e => e.k === 'parada').length} | saltos bruscos de onda: ${evs.filter(e => e.k === 'salto').length} | silencios de ceros: ${evs.filter(e => e.k === 'silencio').length} | perdidos: ${evs.filter(e => e.k === 'perdido').length}`);
const lista = evs.slice(0, 40).map(e => `  ${Math.round(e.clock / 1000)} s de canción: ${e.k}${e.ms ? ' ' + e.ms + ' ms' : ''}${e.v ? ' ' + e.v : ''}${e.frames ? ' ' + e.frames + ' muestras' : ''}`);
if (lista.length) console.log('Sucesos (hasta 40):\n' + lista.join('\n'));
console.log('\nPor tramo de 30 s: entrega mín/prom % | parada máxima ms | saltos | silencios');
for (let ini = 0; ini < song.at(-1).clock / 1000; ini += 30) {
  const T = song.filter(s => s.clock / 1000 >= ini && s.clock / 1000 < ini + 30); if (!T.length) continue;
  console.log(`${String(ini).padStart(4)}-${String(ini + 30).padEnd(4)} s: ${Math.min(...T.map(pct)).toFixed(0)}/${avg(T.map(pct)).toFixed(0)} | ${Math.max(...T.map(s => s.stallMax))} | ${T.reduce((a, s) => a + s.saltos, 0)} | ${T.reduce((a, s) => a + s.silencios, 0)}`);
}

// Claude 2026-10-23 (fluido B): cruce de las marcas M de Santi (marcas.jsonl, ver gh3-marca.js) con la grabadora y el contador de audio.
// Un suceso de la grabadora se anota con el segundo de cancion en que llego el informe (cada 1 s), asi que ocurrio hasta 1 s antes:
// se usa la ventana [clock-1000, clock]. Una marca coincide si cae a +-1,5 s de esa ventana. Los contadores de audio salen de las muestras de resultado.json.
const fm = path.join(dir, 'marcas.jsonl');
if (fs.existsSync(fm)) {
  const M = fs.readFileSync(fm, 'utf8').split('\n').filter(Boolean).flatMap(x => JSON.parse(x).marcas || []);
  let muestras = []; try { muestras = JSON.parse(fs.readFileSync(path.join(dir, 'resultado.json'), 'utf8')).muestras || []; } catch {}
  const mm = muestras.filter(x => x.clock > 0 && Number.isFinite(x.cortes));
  const T = 1500, fmt = ms => Math.floor(ms / 60000) + ':' + String(Math.floor(ms / 1000) % 60).padStart(2, '0');
  console.log(`\nMarcas M de Santi: ${M.length}`);
  let hit = 0, solo = 0;
  for (const m of M) {
    if (!(m.clock > 0)) { console.log(`  marca ${m.n}: fuera de cancion (sin segundo de cancion)`); continue; }
    const cerca = evs.filter(e => m.clock >= e.clock - 1000 - T && m.clock <= e.clock + T);
    const cnt = mm.filter((x, i) => i && x.clock >= m.clock - T - 2000 && mm[i - 1].clock <= m.clock + T && (x.cortes > mm[i - 1].cortes || x.saltos > mm[i - 1].saltos));
    const dc = cnt.map(x => `cortes +${x.cortes - mm[mm.indexOf(x) - 1].cortes}, saltos +${x.saltos - mm[mm.indexOf(x) - 1].saltos}`);
    const ok = cerca.length || cnt.length; ok ? hit++ : solo++;
    console.log(`  marca ${m.n} en ${fmt(m.clock)} (${(m.clock / 1000).toFixed(1)} s): ` + (ok ? 'COINCIDE con ' + [...cerca.map(e => `${e.k}${e.ms ? ' ' + e.ms + ' ms' : ''}${e.v ? ' ' + e.v : ''}${e.frames ? ' ' + e.frames + ' muestras' : ''} (${Math.round(e.clock / 1000)} s)`), ...dc.map(d => 'contador del reproductor: ' + d)].join('; ') : 'sin sucesos de la grabadora ni del contador a +-1,5 s (el audio del juego salio limpio; mirar salida de audio/Windows)'));
  }
  console.log(`  Resumen: ${hit} con suceso cerca, ${solo} sin suceso (de ${M.length}).`);
}
