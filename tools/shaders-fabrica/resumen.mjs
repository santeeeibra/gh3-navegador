// Claude 2026-10-23 (shaders de fábrica): resumen corto de una corrida med.mjs (sin leer el resultado.json entero a mano).
// Uso: node tools/shaders-fabrica/resumen.mjs <carpeta de corrida>...
import fs from 'node:fs';
for (const dir of process.argv.slice(2)) {
  const r = JSON.parse(fs.readFileSync(dir + '/resultado.json', 'utf8')), M = r.muestras || [];
  const canc = M.filter(m => m.clock > 0), pc = canc.map(m => m.juegoPct).filter(x => x != null);
  const primera = canc[0]?.gov?.precarga, ultima = M.at(-1)?.gov?.precarga;
  // compiladas en canción: momentos en que sube el contador
  const subidas = []; let prev = null; for (const m of M) { const c = m.gov?.precarga?.compiladasEnJuego; if (c != null && prev != null && c > prev) subidas.push(Math.round((m.clock || 0) / 100) / 10 + 's:+' + (c - prev)); if (c != null) prev = c; }
  const menu = r.pasos?.find(p => /menú principal/.test(p.paso))?.ms, tema = r.pasos?.find(p => /tema elegido/.test(p.paso))?.ms;
  const cancion = r.pasos?.find(p => /canci[oó]n|reloj/i.test(p.paso) && p.ms > (tema || 0));
  const lineas = fs.existsSync(dir + '/pipelines.jsonl') ? fs.readFileSync(dir + '/pipelines.jsonl', 'utf8').trim().split('\n').filter(Boolean).length : 0;
  console.log(JSON.stringify({dir: dir.split(/[\\/]/).pop(), fin: r.fin?.motivo, errores: (r.errores || []).length, erroresTxt: (r.errores || []).slice(0, 3),
    menuMs: menu, temaMs: tema, cancionPaso: cancion && {ms: cancion.ms, paso: cancion.paso.slice(0, 60)},
    precargaAlEmpezar: primera, precargaFinal: ultima, compiladasEnCancion: subidas,
    juegoPct: pc.length ? {medio: Math.round(pc.reduce((a, b) => a + b, 0) / pc.length), min: Math.min(...pc)} : null,
    relojFinal: canc.at(-1)?.clock, fatal: M.map(m => m.rend?.fatal).find(Boolean) || null, pipelinesNuevos: lineas}));
}
