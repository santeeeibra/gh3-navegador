// Claude 2026-10-15 (recorte CPU): resume los cpu-*.cpuprofile que deja `acceso.mjs --cpu`.
// Uso: node tools/accesos/perfil-cpu.mjs <carpeta> [top]  → escribe <carpeta>/resumen-cpu.json e imprime lo principal.
// «ocupado» = muestras que no son (idle) ni emscripten_futex_wait (hilo dormido esperando, no usa CPU). Tiempo propio por función (sin hijos), por hilo y sumado entre hilos.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2], TOP = Number(process.argv[3] || 25);
if (!dir) { console.log('Uso: node tools/accesos/perfil-cpu.mjs <carpeta> [top]'); process.exit(1); }
const targets = JSON.parse(fs.readFileSync(path.join(dir, 'cpu-targets.json'), 'utf8'));
const total = new Map(), hilos = [], QUIETO = new Set(['(idle)', 'emscripten_futex_wait']);
const nombre = n => n.callFrame.functionName || '(anónima ' + path.basename(n.callFrame.url || '?') + ')';
for (const t of targets) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, t.file), 'utf8'));
  const byId = new Map(p.nodes.map(n => [n.id, n])), self = new Map();
  for (let i = 0; i < p.samples.length; i++) {
    const n = byId.get(p.samples[i]), k = nombre(n), dt = (p.timeDeltas[i + 1] ?? p.timeDeltas[i] ?? 0) / 1000;
    self.set(k, (self.get(k) || 0) + dt);
  }
  const dur = (p.endTime - p.startTime) / 1000, idle = (self.get('(idle)') || 0) + (self.get('emscripten_futex_wait') || 0), ocupado = dur - idle;
  const top = [...self].filter(([k]) => !QUIETO.has(k)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, Math.round(v)]);
  for (const [k, v] of self) if (!QUIETO.has(k)) total.set(k, (total.get(k) || 0) + v);
  hilos.push({archivo: t.file, tipo: t.type, nombre: t.title || path.basename(t.url || ''), durMs: Math.round(dur), ocupadoMs: Math.round(ocupado), ocupadoPct: dur ? Math.round(100 * ocupado / dur) : 0, top});
}
hilos.sort((a, b) => b.ocupadoMs - a.ocupadoMs);
const suma = [...total.values()].reduce((a, b) => a + b, 0);
const funciones = [...total].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([k, v]) => ({f: k, ms: Math.round(v), pct: +(100 * v / suma).toFixed(1)}));
const r = {ocupadoTotalMs: Math.round(suma), hilos: hilos.filter(h => h.ocupadoMs > 50), funciones};
fs.writeFileSync(path.join(dir, 'resumen-cpu.json'), JSON.stringify(r, null, 1));
console.log('Ocupado total (todos los hilos): ' + r.ocupadoTotalMs + ' ms');
for (const h of r.hilos.slice(0, 8)) console.log(`${h.nombre} ${h.ocupadoPct}% (${h.ocupadoMs} ms): ` + h.top.slice(0, 5).map(([k, v]) => k + ' ' + v).join(', '));
console.log('Funciones (propio, todos los hilos):');
for (const f of funciones) console.log(`  ${f.pct}%  ${f.ms} ms  ${f.f}`);
