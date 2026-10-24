// Resume perfiles de cpu-prof.mjs: tiempo propio por hilo y por función.
// Uso: node tools/d1-wasm/cpu-top.mjs <carpeta> [N=40]  -> escribe <carpeta>/cpu-top.json y cpu-top.txt, imprime resumen corto.
import fs from 'node:fs';
const dir = process.argv[2], N = Number(process.argv[3] || 40);
const targets = JSON.parse(fs.readFileSync(dir + '/cpu-targets.json', 'utf8'));
const IDLE = new Set(['loop', '(idle)', '(program)', '(garbage collector)', '(root)', 'emscripten_futex_wait', '__wait', 'emscripten_futex_wait_main_browser_thread']);
const threads = [], all = new Map();
for (const t of targets) {
  const p = JSON.parse(fs.readFileSync(dir + '/' + t.file, 'utf8'));
  const byId = new Map(p.nodes.map(n => [n.id, n])), self = new Map();
  let busy = 0, idle = 0;
  p.samples.forEach((id, i) => {
    const dt = (p.timeDeltas[i] || 0) / 1000, n = byId.get(id), name = n.callFrame.functionName || '(anon ' + n.callFrame.url.split('/').pop() + ')';
    if (IDLE.has(name)) { idle += dt; return; }
    busy += dt; self.set(name, (self.get(name) || 0) + dt);
  });
  const total = (p.endTime - p.startTime) / 1000;
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([f, ms]) => ({ f, ms: Math.round(ms) }));
  threads.push({ file: t.file, url: (t.url || '').split('/').pop(), title: t.title, totalMs: Math.round(total), busyMs: Math.round(busy), busyPct: Math.round(100 * busy / total), top });
  for (const [f, ms] of self) all.set(f, (all.get(f) || 0) + ms);
}
threads.sort((a, b) => b.busyMs - a.busyMs);
const busyAll = [...all.values()].reduce((a, b) => a + b, 0);
const topAll = [...all].sort((a, b) => b[1] - a[1]).slice(0, N).map(([f, ms]) => ({ f, ms: Math.round(ms), pct: +(100 * ms / busyAll).toFixed(1) }));
fs.writeFileSync(dir + '/cpu-top.json', JSON.stringify({ threads, topAll }, null, 1));
const txt = ['HILOS (ocupado / total ms)', ...threads.map(t => `${t.busyPct}%\t${t.busyMs}/${t.totalMs}\t${t.file} ${t.url} ${t.title}`), '', `TOP ${N} FUNCIONES (todos los hilos, % del tiempo ocupado)`, ...topAll.map(x => `${x.pct}%\t${x.ms}\t${x.f}`)];
fs.writeFileSync(dir + '/cpu-top.txt', txt.join('\n'));
console.log(txt.slice(0, threads.length + 25).join('\n'));
