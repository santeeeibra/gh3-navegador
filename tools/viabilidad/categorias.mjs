// Viabilidad (Claude 2026-10-16): tiempo de CPU ocupado por categoría a partir de los cpu-*.cpuprofile de `acceso.mjs --cpu`.
// Uso: node tools/viabilidad/categorias.mjs <carpeta> [<carpeta2> ...]  → <carpeta>/categorias.json + tabla.
// Reglas (en orden): 1) función propia de espera/sincronización → «esperas»; 2) rol del hilo según la función del juego de entrada
// (mapa de tools/viabilidad/hilos.mjs, corrida 2 núcleos 2026-10-16); 3) hilos sin código del juego según su nombre.
// Los roles marcados «probable» son HIPÓTESIS (ubicación de la función en el ejecutable + qué hace el hilo), no comprobados.
import fs from 'node:fs'; import path from 'node:path';
const QUIETO = new Set(['(idle)', 'emscripten_futex_wait']);
const ESPERA = /futex_wake|^__wait$|get_now|^now$|mutex|WaitMultiple|atomic_wait|CriticalSection|KeWait|NtWait|Sleep|nanosleep|PosixCondition|^__timedwait|sched_yield/;
const ROL = [
  [/sub_820D2200/, 'lógica (hilo principal del juego)'],
  [/sub_82381A48|sub_823814F8|sub_823812B8|sub_82381C70/, 'armado de dibujo (hilo de dibujo del juego)'],
  [/sub_823EC780/, 'obreros sub_823EC780 (rol por medir)'],
  [/sub_82727AA8|sub_8271B9B8|sub_827A0B78|sub_827C46C8/, 'audio (probable)'],
  [/sub_825EE938|sub_825EF750|sub_827CDB/, 'carga/flujo de archivos (probable)'],
];
const rolHilo = (nombre, entradas) => {
  if (/^blob:/.test(nombre)) return 'herramienta de prueba (robot)';
  if (/native60-gpu|HERO|gh3|Las Vegas/i.test(nombre)) return 'presentar imagen (página/GPU)';
  if (/AudioWorklet|worklet/i.test(nombre)) return 'audio (página)';
  return null;
};
for (const dir of process.argv.slice(2)) {
  const targets = JSON.parse(fs.readFileSync(path.join(dir, 'cpu-targets.json'), 'utf8')); const cat = new Map(), porHilo = [];
  const add = (k, v) => cat.set(k, (cat.get(k) || 0) + v);
  let dur = 0;
  for (const t of targets) {
    const p = JSON.parse(fs.readFileSync(path.join(dir, t.file), 'utf8')); const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map();
    for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
    const nombre = t.title || path.basename(t.url || ''); dur = Math.max(dur, (p.endTime - p.startTime) / 1000); const h = new Map();
    for (let i = 0; i < p.samples.length; i++) {
      let id = p.samples[i]; const self = byId.get(id).callFrame.functionName, dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
      if (QUIETO.has(self)) continue;
      let k = rolHilo(nombre);
      if (!k) { const chain = []; while (id != null) { chain.push(byId.get(id).callFrame.functionName); id = parent.get(id); }
        const s = chain.join(' ');
        if (ESPERA.test(self)) k = 'esperas/sincronización';
        else { const r = ROL.find(([re]) => re.test(s)); k = r ? r[1] : (/sub_8/.test(s) ? 'otro código del juego' : 'emulación GPU + productor de imagen (host)'); } }
      add(k, dt); h.set(k, (h.get(k) || 0) + dt);
    }
    porHilo.push({hilo: nombre, ms: Object.fromEntries([...h].map(([a, b]) => [a, Math.round(b)]))});
  }
  const total = [...cat.values()].reduce((a, b) => a + b, 0);
  const tabla = [...cat].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({categoria: k, ms: Math.round(v), pctDelOcupado: +(100 * v / total).toFixed(1), nucleosProm: +(v / dur).toFixed(2)}));
  fs.writeFileSync(path.join(dir, 'categorias.json'), JSON.stringify({durMs: Math.round(dur), ocupadoMs: Math.round(total), tabla, porHilo}, null, 1));
  console.log(`== ${path.basename(dir)}  tramo ${Math.round(dur)} ms, ocupado ${Math.round(total)} ms (${(total / dur).toFixed(2)} núcleos)`);
  for (const r of tabla) console.log(`  ${String(r.ms).padStart(6)} ms ${String(r.pctDelOcupado).padStart(5)} %  ${r.nucleosProm} núcl.  ${r.categoria}`);
}
