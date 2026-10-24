// Claude 2026-10-21 (alta100): resumen de una corrida med.mjs en canción. Uso: node tools/r5-native60/resumen-alta.mjs <carpeta out>...
import fs from 'node:fs';
for (const dir of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(dir + '/resultado.json', 'utf8'));
  const m = r.muestras.filter(x => x.etapa === 'cancion' && x.gov);
  const avg = f => Math.round(m.reduce((a, x) => a + f(x), 0) / m.length * 10) / 10;
  const ritmos = m.map(x => x.audioRitmo).filter(Number.isFinite);
  console.log(JSON.stringify({dir: dir.split(/[\/]/).pop(), muestras: m.length, reloj: Math.round(m.at(-1).clock / 1000),
    juegoPct: avg(x => x.juegoPct), relojPct: avg(x => x.relojPct ?? 0), juegoPeor: Math.min(...m.map(x => x.juegoPct)), swapsS: avg(x => x.gov.swapsJuegoPorSeg),
    snapsS: avg(x => x.gov.snapshotsPorSeg), prepMs: avg(x => x.gov.preparacionMs), img: avg(x => x.imgEscenaS),
    ritmoMin: Math.min(...ritmos), frenos: ritmos.filter(v => v < 0.995).length, colchonMin: Math.min(...m.map(x => x.gov.colchonMinMs)),
    detenido: r.relojDetenido ?? null}));
}
