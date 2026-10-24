// Viabilidad (Claude 2026-10-16): por hilo, función de entrada del juego (la sub_ más externa de cada muestra) y tiempo ocupado.
// Uso: node tools/viabilidad/hilos.mjs <carpeta con cpu-*.cpuprofile y cpu-targets.json>
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2]; const targets = JSON.parse(fs.readFileSync(path.join(dir, 'cpu-targets.json'), 'utf8'));
const QUIETO = new Set(['(idle)', 'emscripten_futex_wait']);
const out = [];
for (const t of targets) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, t.file), 'utf8')); const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map();
  for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
  const entry = new Map(); let busy = 0, dur = (p.endTime - p.startTime) / 1000;
  for (let i = 0; i < p.samples.length; i++) { let id = p.samples[i]; const n = byId.get(id), dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
    if (QUIETO.has(n.callFrame.functionName)) continue; busy += dt; let ent = '(sin función del juego)';
    const subs = []; while (id != null) { const f = byId.get(id).callFrame.functionName; if (/sub_8/.test(f)) subs.push(f.replace('__imp__', '')); id = parent.get(id); }
    // cadena desde la raíz, sin los envoltorios genéricos de arranque de hilo (sub_824B2038, sub_820D2200 = principal)
    const ch = subs.reverse().filter(f => !/sub_824B2038|sub_824CF3C8/.test(f)); if (ch.length) ent = ch.slice(0, 2).join('>');
    entry.set(ent, (entry.get(ent) || 0) + dt); }
  out.push({hilo: t.title || path.basename(t.url || ''), archivo: t.file, durMs: Math.round(dur), ocupadoMs: Math.round(busy), entradas: [...entry].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => k + ' ' + Math.round(v))});
}
out.sort((a, b) => b.ocupadoMs - a.ocupadoMs);
fs.writeFileSync(path.join(dir, 'hilos.json'), JSON.stringify(out, null, 1));
for (const h of out) if (h.ocupadoMs > 30) console.log(`${h.archivo} ${h.hilo} ocupado ${h.ocupadoMs}/${h.durMs} ms: ${h.entradas.join(' | ')}`);
console.log('hilos totales', out.length, 'con <30 ms ocupados', out.filter(h => h.ocupadoMs <= 30).length);
