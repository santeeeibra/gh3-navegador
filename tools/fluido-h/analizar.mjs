// Claude 2026-10-23 (fluido H): resume una corrida de tools/fluido-h/med.mjs --hlog.
// - Archivos que el juego abrió (con la hora de canción), en especial videos (MOVIES/BIK).
// - Partes que faltaban y se bajaron con pedido sincrónico (el hilo del juego espera): cuántas, cuánto esperó.
// - Tirones: tramos de más de 100 ms sin cuadro nuevo del juego (frames.json) y si coinciden con una falta.
// Uso: node tools/fluido-h/analizar.mjs <carpeta de la corrida> [--todo]
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2], todo = process.argv.includes('--todo');
const h = JSON.parse(fs.readFileSync(path.join(dir, 'hlog.json'), 'utf8'));
const L = h.log || [];
const abiertos = L.filter(x => x.type === 'hOpen'), faltas = L.filter(x => x.type === 'hMiss'), lentas = L.filter(x => x.type === 'hRead'), pre = L.filter(x => x.type === 'hPre');
const corto = p => p.replace(/^DATA\//, '');
const out = {};
out.abiertos = abiertos.length;
out.videos = abiertos.filter(x => /MOVIES/i.test(x.path)).map(x => ({t: x.t, cancionMs: x.c, archivo: corto(x.path)}));
out.abiertosEnCancion = abiertos.filter(x => x.c > 0).map(x => ({t: x.t, cancionMs: x.c, archivo: corto(x.path)}));
const porArch = {};
for (const f of faltas) { const k = corto(f.path); const a = porArch[k] ||= {partes: 0, MB: 0, esperaMs: 0, peorMs: 0, enCancion: 0, desdeT: f.t}; a.partes++; a.MB += f.bytes / 1048576; a.esperaMs += f.ms; a.peorMs = Math.max(a.peorMs, f.ms); if (f.c > 0) a.enCancion++; }
for (const a of Object.values(porArch)) a.MB = +a.MB.toFixed(1);
out.faltas = {partes: faltas.length, esperaTotalMs: faltas.reduce((s, f) => s + f.ms, 0), enCancion: faltas.filter(f => f.c > 0).length, esperaEnCancionMs: faltas.filter(f => f.c > 0).reduce((s, f) => s + f.ms, 0), porArchivo: porArch};
out.lecturasLentas = {n: lentas.length, enCancion: lentas.filter(x => x.c > 0).length, peor: lentas.sort((a, b) => b.ms - a.ms).slice(0, 8).map(x => ({ms: x.ms, cancionMs: x.c, archivo: corto(x.path)}))};
out.precarga = pre.length ? {partes: pre.filter(x => !x.error).length, errores: pre.filter(x => x.error).length, porMotivo: pre.reduce((o, x) => (o[x.motivo || 'error'] = (o[x.motivo || 'error'] || 0) + 1, o), {})} : null;
out.red = h.red ? {pedidos: h.red.length, MB: +(h.red.reduce((s, r) => s + r.size, 0) / 1048576).toFixed(1)} : null;
const fp = path.join(dir, 'frames.json');
if (fs.existsSync(fp)) {
  const F = JSON.parse(fs.readFileSync(fp, 'utf8')).frames || [];
  // [t, songPresented, swap, clock, shown]: cuadro nuevo del juego = cambia swap (o presented si no hay swap).
  const tir = []; let last = null;
  for (const r of F) { if (r[3] <= 0) { last = null; continue; } const v = r[2] ?? r[1]; if (!last || v !== last.v) { if (last && r[0] - last.t > 100) tir.push({desde: Math.round(last.t), ms: Math.round(r[0] - last.t), cancionMs: last.c}); last = {t: r[0], v, c: r[3]}; } }
  const coincide = x => L.filter(e => (e.type === 'hMiss' || e.type === 'hRead') && e.t >= x.desde - 50 && e.t <= x.desde + x.ms + 50).map(e => e.type + ' ' + corto(e.path) + ' ' + e.ms + 'ms');
  out.tirones = {cuadrosMedidos: F.length, mas100ms: tir.length, mas250ms: tir.filter(x => x.ms > 250).length, peores: tir.sort((a, b) => b.ms - a.ms).slice(0, 10).map(x => ({...x, conFalta: coincide(x)})), conFalta: tir.filter(x => coincide(x).length).length};
}
if (todo) out.todosAbiertos = abiertos.map(x => [x.t, x.c, corto(x.path)]);
fs.writeFileSync(path.join(dir, 'resumen-h.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1).slice(0, 6000));
