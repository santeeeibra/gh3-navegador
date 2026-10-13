// Worklet de audio REAL de la página (extraído de web/gh3-native60/index.html) con un productor simulado.
// Comprueba la telemetría por SAB para el gobernador, que el sonido no cambia sin ?audiorate y que los cortes se cuentan.
// Es un módulo con productor simulado: no prueba el juego ni el dispositivo de salida.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync('web/gh3-native60/index.html', 'utf8');
const source = JSON.parse(/new Blob\(\[(".*?")\], \{ type/s.exec(html)[1]);

function load() {
  const posted = [];
  class AudioWorkletProcessor { constructor() { this.port = {postMessage: (m) => posted.push(m), onmessage: null}; } }
  let Klass = null;
  vm.runInNewContext(source, {AudioWorkletProcessor, registerProcessor: (_, k) => { Klass = k; }, Atomics, Uint32Array, Int32Array, Float32Array, Math, Number});
  return {Klass, posted};
}
const CAP = 32768, RATE = 48000, Q = 128;
function rig({tel = true, band} = {}) {
  const {Klass, posted} = load();
  const sab = new SharedArrayBuffer(8 + CAP * 8), w = new Uint32Array(sab, 0, 1), d = new Float32Array(sab, 8, CAP * 2);
  new Uint32Array(sab, 4, 1)[0] = CAP;
  const t = tel ? new SharedArrayBuffer(64) : null;
  if (t) Atomics.store(new Int32Array(t), 6, 0x7fffffff);
  const node = new Klass({processorOptions: {sab, ptr: 0, tel: t, band}});
  const L = new Float32Array(Q), R = new Float32Array(Q);
  let produced = 0, phase = 0;
  const produce = (frames) => { for (let i = 0; i < frames; i++) { const k = (produced + i) % CAP; const v = Math.sin(phase += 0.05) * 0.5; d[k * 2] = v; d[k * 2 + 1] = v; } produced += frames; Atomics.store(w, 0, produced >>> 0); };
  const quantum = () => node.process([], [[L, R]]);
  return {node, posted, tel: t && new Int32Array(t), produce, quantum, L};
}
// Productor a ráfagas (como el juego): `ratio` = producción / tiempo real.
function run(r, seconds, ratio = 1, burst = 1024) {
  const quanta = Math.round(seconds * RATE / Q); let debt = 0;
  for (let i = 0; i < quanta; i++) { debt += Q * ratio; while (debt >= burst) { r.produce(burst); debt -= burst; } r.quantum(); }
}

test('ritmo real: telemetría coherente, sin cortes ni saltos, ritmo ~1 y sin mensajes desde process()', () => {
  const r = rig(); r.produce(12000); run(r, 10, 1);
  const t = r.tel, st = r.node.st;
  assert.equal(t[1], 0, 'cortes'); assert.equal(t[3], 0, 'saltos'); assert.equal(t[10], 1, 'sonando');
  assert.equal(t[1], st.underruns); assert.equal(t[2], st.silentBlocks); assert.equal(t[11], st.played);
  assert.ok(Math.abs(t[5] - 1e6) < 5000, 'ritmo ppm ' + t[5]);
  assert.ok(t[0] > 9600 - 3000 && t[0] < 9600 + 3000, 'colchón ' + t[0]);
  assert.ok(t[6] <= t[0] && t[6] > 4000, 'colchón mínimo ' + t[6]);
  assert.equal(t[4], Math.round(10 * RATE / Q), 'un bloque por process()');
  assert.equal(t[9], 9600); assert.equal(t[8], 0, 'sin estiramiento');
  assert.equal(r.posted.length, 0, 'process() no manda mensajes');
  assert.ok(r.L.some((v) => v !== 0), 'hay sonido');
});

test('parón de 300 ms del productor: el corte se cuenta y el colchón mínimo lo muestra', () => {
  const r = rig(); r.produce(12000); run(r, 3, 1); Atomics.store(r.tel, 6, 0x7fffffff);
  run(r, 0.3, 0); run(r, 2, 1);
  assert.ok(r.tel[1] >= 1, 'cortes ' + r.tel[1]); assert.equal(r.tel[1], r.node.st.underruns);
  assert.ok(r.tel[6] < 1000, 'colchón mínimo ' + r.tel[6]);
});

test('producción al 95 %: sin ?audiorate el worklet estira el sonido (ritmo < 0,995) y la telemetría lo registra', () => {
  const r = rig(); r.produce(12000); run(r, 20, 0.95);
  assert.ok(r.tel[8] > 0, 'bloques estirados ' + r.tel[8]);
  assert.ok(r.tel[5] < 995000, 'ritmo ppm ' + r.tel[5]);
});

test('con ?audiorate=0.005 el ritmo nunca baja de 0,995 (no ralentiza), aunque falte producción', () => {
  const r = rig({band: 0.005}); r.produce(12000);
  let minRate = 2; const quanta = Math.round(20 * RATE / Q); let debt = 0;
  for (let i = 0; i < quanta; i++) { debt += Q * 0.95; while (debt >= 1024) { r.produce(1024); debt -= 1024; } r.quantum(); if (r.node.playing) minRate = Math.min(minRate, r.node.st.rate); }
  assert.ok(minRate >= 0.995 - 1e-9, 'ritmo mínimo ' + minRate);
  assert.equal(r.tel[8], 0);
});

test('sin SAB de telemetría (página vieja) el worklet funciona igual', () => {
  const a = rig({tel: false}), b = rig();
  a.produce(12000); b.produce(12000); run(a, 2, 1); run(b, 2, 1);
  assert.deepEqual({...a.node.st}, {...b.node.st});
  assert.deepEqual([...a.L], [...b.L]);
});

test('el mensaje de estado (cada 500 ms desde la página) sigue igual', () => {
  const r = rig(); r.produce(12000); run(r, 1, 1);
  r.node.port.onmessage({data: 0});
  const m = r.posted.at(-1);
  for (const k of ['played', 'underruns', 'silentBlocks', 'skips', 'written', 'wNow', 'lag']) assert.ok(k in m, k);
});

test('mismo sonido que el worklet anterior (muestra por muestra) con ritmo real, parón y producción lenta', () => {
  const before = fs.readFileSync('tests/fixtures/worklet-r6-2026-10-12.js', 'utf8');
  const mk = (src) => { let K; class AudioWorkletProcessor { constructor() { this.port = {postMessage() {}, onmessage: null}; } }
    vm.runInNewContext(src, {AudioWorkletProcessor, registerProcessor: (_, k) => { K = k; }, Atomics, Uint32Array, Int32Array, Float32Array, Math, Number}); return K; };
  const Old = mk(before), New = load().Klass;
  for (const plan of [[[3, 1]], [[2, 1], [0.3, 0], [2, 1]], [[10, 0.95]], [[4, 1.04]]]) {
    const outs = [Old, New].map((K, j) => {
      const sab = new SharedArrayBuffer(8 + CAP * 8), w = new Uint32Array(sab, 0, 1), d = new Float32Array(sab, 8, CAP * 2); new Uint32Array(sab, 4, 1)[0] = CAP;
      const tel = j ? new SharedArrayBuffer(64) : undefined, node = new K({processorOptions: {sab, ptr: 0, tel}});
      const L = new Float32Array(Q), R = new Float32Array(Q), all = []; let produced = 0, debt = 0, ph = 0;
      const produce = (n) => { for (let i = 0; i < n; i++) { const k = (produced + i) % CAP; d[k * 2] = d[k * 2 + 1] = Math.sin(ph += 0.031); } produced += n; Atomics.store(w, 0, produced >>> 0); };
      produce(12000);
      for (const [sec, ratio] of plan) for (let i = 0, n = Math.round(sec * RATE / Q); i < n; i++) { debt += Q * ratio; while (debt >= 1024) { produce(1024); debt -= 1024; } node.process([], [[L, R]]); all.push(...L); }
      return {all, st: {...node.st}};
    });
    assert.deepEqual(outs[1].st, outs[0].st, JSON.stringify(plan));
    assert.ok(outs[0].all.every((v, i) => Object.is(v, outs[1].all[i])), 'muestras idénticas ' + JSON.stringify(plan));
  }
});
