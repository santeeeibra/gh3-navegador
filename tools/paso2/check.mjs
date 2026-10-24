// paso2 (Claude, 2026-10-15): chequeo SIN juego de la cola con demora (native60-page.js de la copia) y de los archivos
// armados. Simula la página (rAF a 60 Hz, reloj del audio de la capa) y un dibujante que manda imágenes reales a ~25/s con
// su tiempo de canción ~235 ms adelantado al audio. Uso: node tools/paso2/check.mjs  → artifacts/d1-wasm/paso2/offline/
import fs from 'node:fs';
import vm from 'node:vm';
const demo = 'artifacts/d1-wasm/paso2/demo', outDir = 'artifacts/d1-wasm/paso2/offline';
fs.mkdirSync(outDir, { recursive: true });
const results = {};
// Sintaxis de los archivos propios.
for (const n of ['native60-page.js', 'r5snap-native60-gpu.js', 'autopista60-tap.js', 'autopista60.js']) new vm.Script(fs.readFileSync(`${demo}/${n}`, 'utf8'), { filename: n });
results.syntax = 'ok';
const gpu = fs.readFileSync(`${demo}/r5snap-native60-gpu.js`, 'utf8');
results.gpuPatches = ['sceneMotion:!1', 'L.p2Idle', 'L.p2Repost', 'a60T:te.info.a60T'].every((s) => gpu.includes(s)) && !gpu.includes('sceneMotion:Ye})');

function sim({ leadMs = 235, layer = true, pauseAt = null, durationMs = 6000, jitterMs = 12 }) {
  let now = 0, rafs = [];
  const presented = [];
  const hw60 = { enabled: true, audioOk: layer, shown: 0, visualTimeMs: NaN, visualAt: NaN };
  const canvas = { isConnected: true, getContext: () => ({ transferFromImageBitmap: (b) => presented.push({ at: now, T: b.T, audioT: audio(now) }) }) };
  const win = { hw60, d4: {}, gh3Governor: null };
  // Audio que suena: avanza con el tiempo salvo pausa.
  const audio = (t) => (pauseAt !== null && t > pauseAt ? pauseAt : t) - 1000;
  let portHandler = null;
  class FakeWorker { constructor() { this.l = []; } addEventListener(_, f) { this.l.push(f); } }
  const ctx = { window: win, performance: { now: () => now }, requestAnimationFrame: (f) => rafs.push(f), Atomics, Int32Array, SharedArrayBuffer,
    document: { getElementById: (id) => (id === 'r5Canvas' ? canvas : null) }, d4: win.d4 };
  win.Worker = FakeWorker; ctx.Worker = FakeWorker;
  vm.runInNewContext(fs.readFileSync(`${demo}/native60-page.js`, 'utf8'), ctx);
  const w = new win.Worker('x'); const latch = new SharedArrayBuffer(128);
  const port = { start() {}, set onmessage(f) { portHandler = f; } };
  for (const f of w.l) f({ data: { type: 'r5NativePort', port, latch } });
  let nextFrame = 100, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (; now < durationMs; now += 1) {
    if (now % 16 === 0 || now % 50 === 33) { // rAF ~60 Hz: la capa actualiza su reloj y dibuja
      if (layer) { hw60.visualTimeMs = audio(now); hw60.visualAt = now; hw60.shown++; }
      const f = rafs; rafs = []; for (const g of f) g(now);
    }
    if (now >= nextFrame) { // imagen real del juego, tiempo de canción adelantado leadMs al audio
      const T = audio(now) + leadMs;
      portHandler({ data: { type: 'frame', bitmap: { T, close() {} }, info: { seq: now, a60T: T, a60Est: 0 }, latch } });
      nextFrame = now + 40 + Math.round((rnd() - 0.5) * 2 * jitterMs);
    }
  }
  const p2 = win.d4.paso2, lags = presented.filter((p) => p.at > 500).map((p) => p.audioT - p.T), waits = p2.waitN ? p2.waitSum / p2.waitN : 0;
  const sorted = lags.map(Math.abs).sort((a, b) => a - b);
  return { presented: presented.length, received: p2.received, delayed: p2.delayed, immediate: p2.immediate, capped: p2.capped, dropped: p2.dropped, maxQueue: p2.maxQueue,
    meanWaitMs: +waits.toFixed(1), lagP50: sorted[sorted.length >> 1], lagP95: sorted[Math.floor(sorted.length * 0.95)], lagMax: sorted.at(-1), lagMin: Math.min(...lags) };
}
results.conCapa = sim({});
results.sinCapa = sim({ layer: false });
results.pausa = sim({ pauseAt: 3000 });
const c = results.conCapa, s = results.sinCapa, p = results.pausa;
results.checks = {
  conCapa_todasDemoradas: c.delayed >= c.received - 8 && c.immediate === 0 /* las últimas ~235 ms siguen en cola al cortar */,
  conCapa_coincideConAudio: c.lagP95 <= 10 && c.lagMin >= -8 /* margen elegido: medio cuadro */,
  conCapa_esperaMedia_aprox_lead: c.meanWaitMs > 200 && c.meanWaitMs < 260,
  sinCapa_inmediatas: s.immediate === s.received && s.delayed === 0,
  pausa_tope400: p.capped > 0 && p.received - p.presented <= 12,
  sinPerdidas: c.dropped <= 2,
};
results.ok = Object.values(results.checks).every(Boolean) && results.gpuPatches;
fs.writeFileSync(outDir + '/verification.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify({ ok: results.ok, checks: results.checks, conCapa: c, sinCapa: { presented: s.presented, immediate: s.immediate }, pausa: { capped: p.capped, presented: p.presented, received: p.received } }));
