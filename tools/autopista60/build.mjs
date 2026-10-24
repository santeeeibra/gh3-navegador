// autopista60 (Claude, 2026-10-14): arma la copia aislada artifacts/d1-wasm/autopista60/demo desde la copia publicable
// artifacts/d1-wasm/ui3/demo SIN tocarla. Los archivos que no cambian se enlazan (enlace duro); los que cambian se
// escriben como archivos nuevos (se borra antes el enlace para no escribir dentro del archivo de ui3).
// Cambios: index.html (capa autopista60.js + telemetría del AudioWorklet + puntero del anillo), consumidores
// r5snap-native60-* (PC) y r5snap-song-* (celular) con el filtro de piezas propias y el lector autopista60-tap.js.
// Uso: node tools/autopista60/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
// A60_BASE / A60_OUT: otra copia base (p. ej. la publicable artifacts/ui-layout/demo) y otra salida.
const base = process.env.A60_BASE || 'artifacts/d1-wasm/ui3/demo', out = process.env.A60_OUT || 'artifacts/d1-wasm/autopista60/demo';
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const CONSUMERS = ['r5snap-native60-render.js', 'r5snap-native60-colas.js', 'r5snap-native60-scene.js', 'r5snap-song-render.js', 'r5snap-song-colas.js', 'r5snap-song-scene.js'];
const OWN = new Set(['index.html', ...CONSUMERS]);
fs.mkdirSync(out + '/chunks', { recursive: true });
const before = {};
for (const ent of fs.readdirSync(base, { withFileTypes: true })) {
  if (!ent.isFile()) continue;
  const from = path.join(base, ent.name), to = path.join(out, ent.name);
  before[ent.name] = sha(from);
  if (OWN.has(ent.name)) continue;
  if (fs.existsSync(to)) fs.unlinkSync(to);
  fs.linkSync(from, to);
}
for (const n of fs.readdirSync(base + '/chunks')) if (!fs.existsSync(out + '/chunks/' + n)) fs.linkSync(base + '/chunks/' + n, out + '/chunks/' + n);
const put = (name, text) => { const to = path.join(out, name); if (fs.existsSync(to)) fs.unlinkSync(to); fs.writeFileSync(to, text); };
const once = (text, from, to, what) => { const n = text.split(from).length - 1; if (n !== 1) throw Error(`${what}: se esperaba 1 coincidencia y hay ${n}`); return text.replace(from, to); };

// 1) Consumidores: filtro antes de preparar cada dibujo (una sola coincidencia por archivo) + lector al final.
const hooks = {};
for (const name of CONSUMERS) {
  let text = fs.readFileSync(path.join(base, name), 'utf8');
  const m = [...text.matchAll(/=performance\.now\(\);(try\{const (\w+)=(\w+)\((\w+(?:\.value)?),(\w+),(\w+)\))/g)];
  if (m.length !== 1) throw Error(`${name}: punto de enganche ${m.length} veces`);
  text = text.replace(m[0][0], `=performance.now();if(globalThis.__hw60DrawFilter&&!globalThis.__hw60DrawFilter(${m[0][4]}))continue;${m[0][1]}`);
  text += `\n;try{importScripts("autopista60-tap.js")}catch(e){console.error("[autopista60] lector: "+e)}\n`;
  put(name, text); hooks[name] = m[0][0];
}

// 2) index.html: telemetría del worklet (qué muestra suena), puntero del anillo para el lector y la capa.
let html = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
html = once(html, 'step(outs) { const L = outs[0][0], R = outs[0][1] || L, n = L.length, w = Atomics.load(this.w, 0), cap = this.cap, d = this.d;\\n    this.wNow = w; this.playing = false; this.lagNow = 0;',
  'step(outs) { const L = outs[0][0], R = outs[0][1] || L, n = L.length, w = Atomics.load(this.w, 0), cap = this.cap, d = this.d;\\n    this.wNow = w; this.playing = false; this.lagNow = 0; this.snd = false;', 'worklet: inicio de step');
html = once(html, 'let r = this.r, f = this.f;\\n',
  'let r = this.r, f = this.f; this.r0 = r; this.f0 = f; this.rt = rate; this.snd = true; /* autopista60: muestra con la que empieza este bloque */\\n', 'worklet: muestra del bloque');
html = once(html, "if (this.playing && (s.rate < 0.995 || s.rate > 1.005)) Atomics.add(t, 8, 1); }",
  "if (this.playing && (s.rate < 0.995 || s.rate > 1.005)) Atomics.add(t, 8, 1);\\n      /* autopista60 (Claude 2026-10-14): [16] secuencia impar=escribiendo [17] muestra del anillo [18] fracción×1e6 [19] cuadro del AudioContext [20] ritmo×1e6 [21] sonó */\\n      if (t.length >= 24) { Atomics.add(t, 16, 1); Atomics.store(t, 17, this.snd ? this.r0 | 0 : 0); Atomics.store(t, 18, this.snd ? Math.round(this.f0 * 1e6) : 0); Atomics.store(t, 19, currentFrame | 0); Atomics.store(t, 20, this.snd ? Math.round(this.rt * 1e6) : 0); Atomics.store(t, 21, this.snd ? 1 : 0); Atomics.add(t, 16, 1); } }", 'worklet: publicar');
html = once(html, 'const tel = window.r6tel = new SharedArrayBuffer(64);', 'const tel = window.r6tel = new SharedArrayBuffer(128); window.r6ringPtr = ptr; /* autopista60: 128 B (campos 16–21) y puntero del anillo */', 'r6StartAudio');
html = once(html, '<script src="gh3-cheats.js"></script>', '<script src="gh3-cheats.js"></script>\n<script src="autopista60.js"></script>', 'script de la capa');
put('index.html', html);

// 3) Capa y lector.
fs.copyFileSync('tools/autopista60/autopista60.js', out + '/autopista60.js.tmp'); fs.renameSync(out + '/autopista60.js.tmp', out + '/autopista60.js');
await build({ entryPoints: ['tools/autopista60/tap.mjs'], bundle: true, format: 'iife', minify: true, outfile: out + '/autopista60-tap.js', logLevel: 'warning' });

// ui3 intacta.
for (const [n, h] of Object.entries(before)) if (sha(path.join(base, n)) !== h) throw Error('Cambió la base: ' + n);
const result = { base, out, hooks, own: [...OWN, 'autopista60.js', 'autopista60-tap.js'], baseUnchanged: true, at: new Date().toISOString(),
  sha: Object.fromEntries([...OWN, 'autopista60.js', 'autopista60-tap.js'].map((n) => [n, sha(path.join(out, n))])) };
fs.writeFileSync(path.join(path.dirname(out), 'build.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ base, out, hooks: Object.keys(hooks).length, baseUnchanged: true }));
