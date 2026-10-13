// Precarga con presupuesto (tools/r5-native60/preload.mjs) con renderer y almacén FALSOS (Node).
// Comprueba cuándo compila (sólo cargas/menús, gobernador en normal), cuánto a la vez, qué recuerda y cuándo guarda.
// No mide el costo real de compilar en el iPhone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {C, createControl} from '../tools/r5-native60/control.mjs';
import {createPreloader, descKey} from '../tools/r5-native60/preload.mjs';

const d = (n, extra = {}) => ({vs: 'VS' + n, ps: 'PS' + n, blend: 0x10001, raster: 0, depth: 0, stencil: 0, writeMask: 15, ...extra});
const tick = () => new Promise((r) => setImmediate(r));

// Renderer falso: cada prebuild queda pendiente hasta finish(); registra el máximo en paralelo.
function fakeRenderer({fail = new Set()} = {}) {
  const built = new Set(), pending = [];let inFlight = 0, maxInFlight = 0, calls = 0, onPipeline = null;
  const r = {
    has: (m) => built.has(descKey(m)),
    prebuild(m) { calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise((res) => pending.push(() => { inFlight--; const ok = !fail.has(m.vs); if (ok) { built.add(descKey(m)); onPipeline?.(m, true); } res(ok); })); },
    build(m) { built.add(descKey(m)); onPipeline?.(m, false); },  // compilación pedida por un dibujo del juego
    finish: async () => { while (pending.length) pending.shift()(); await tick(); await tick(); },
    set onPipeline(f) { onPipeline = f; },
    get calls() { return calls; }, get maxInFlight() { return maxInFlight; },
  };
  return r;
}
function fakeStore(list = []) { const s = {saved: [], load: async () => list, save: async (l) => { s.saved.push(JSON.parse(JSON.stringify(l))); }}; return s; }
function setup({list = [], stage = 1, level = 0, fail, maxEntries, clock} = {}) {
  const board = new Int32Array(createControl()); Atomics.store(board, C.STAGE, stage); Atomics.store(board, C.LEVEL, level);
  const renderer = fakeRenderer({fail}), store = fakeStore(list), t = {now: 0};
  const p = createPreloader({renderer, store, board, maxEntries, saveDelayMs: 2000, now: clock || (() => t.now)});
  renderer.onPipeline = (m, pre) => p.record(m, pre);
  return {board, renderer, store, p, t};
}
const entry = (n, extra = {}) => ({d: d(n), n: 1, s: 0, t: 0, ...extra});

test('cargas/menús: compila lo recordado, de a 2 como máximo, y lo usado en canciones primero', async () => {
  const {board, renderer, p} = setup({list: [entry(1, {n: 5}), entry(2, {s: 1}), entry(3, {n: 9}), entry(4), entry(5)]});
  await p.ready; assert.equal(Atomics.load(board, C.PRELOAD_PENDING), 5);
  p.pump(); assert.equal(renderer.calls, 2);
  p.pump(); assert.equal(renderer.calls, 2);  // presupuesto: no lanza más hasta que terminen
  await renderer.finish(); p.pump(); await renderer.finish(); p.pump(); await renderer.finish();
  assert.equal(renderer.calls, 5); assert.equal(renderer.maxInFlight, 2);
  assert.equal(Atomics.load(board, C.PRELOADED), 5); assert.equal(Atomics.load(board, C.PRELOAD_PENDING), 0);
  assert.equal(Atomics.load(board, C.SONG_BUILDS), 0);
});

test('orden: primero lo usado en canción, después lo más usado', async () => {
  const {renderer, p} = setup({list: [entry(1, {n: 5}), entry(2, {s: 1}), entry(3, {n: 9})]});
  const order = []; const pb = renderer.prebuild; renderer.prebuild = (m) => { order.push(m.vs); return pb(m); };
  await p.ready; p.pump(); await renderer.finish(); p.pump(); await renderer.finish();
  assert.deepEqual(order, ['VS2', 'VS3', 'VS1']);
});

test('con la canción en juego no compila nada por su cuenta ni guarda; cuenta lo compilado en juego', async () => {
  const {board, renderer, store, p} = setup({list: [entry(1)], stage: 2});
  await p.ready; p.pump(); assert.equal(renderer.calls, 0);
  renderer.build(d(7)); p.pump();
  assert.equal(Atomics.load(board, C.SONG_BUILDS), 1); assert.equal(store.saved.length, 0);
  Atomics.store(board, C.STAGE, 1); p.pump();  // termina la canción → guarda enseguida y precarga
  assert.equal(store.saved.length, 1);
  const saved = store.saved[0].find((e) => e.d.vs === 'VS7'); assert.equal(saved.s, 1); assert.equal(saved.n, 1);
  assert.equal(renderer.calls, 1);
});

test('sin dato de etapa (página vieja) no precarga ni guarda', async () => {
  const {renderer, store, p} = setup({list: [entry(1)], stage: 0});
  await p.ready; renderer.build(d(2)); p.pump(); p.pump();
  assert.equal(renderer.calls, 0); assert.equal(store.saved.length, 0);
});

test('gobernador en protegido o mínimo: espera', async () => {
  const {board, renderer, p} = setup({list: [entry(1), entry(2)], level: 1});
  await p.ready; p.pump(); assert.equal(renderer.calls, 0); assert.ok(p.stats.skippedBusy >= 1);
  Atomics.store(board, C.LEVEL, 0); p.pump(); assert.equal(renderer.calls, 2);
});

test('guardado: una vez por sesión cuenta cada pipeline, espera entre guardados y respeta el máximo', async () => {
  const {renderer, store, p, t} = setup({maxEntries: 3});
  await p.ready;
  for (const n of [1, 2, 3, 4]) renderer.build(d(n));
  renderer.build(d(1));  // repetido en la misma sesión: no suma
  p.pump(); assert.equal(store.saved.length, 1); assert.equal(store.saved[0].length, 3);
  renderer.build(d(5)); p.pump(); assert.equal(store.saved.length, 1);  // espera 2 s
  t.now = 2500; p.pump(); assert.equal(store.saved.length, 2); assert.equal(p.size, 3);
  assert.ok(store.saved[0].every((e) => e.n === 1));
});

test('si un pipeline recordado ya no compila (shaders de otra versión) se olvida', async () => {
  const {renderer, store, p, t} = setup({list: [entry(1), entry(2)], fail: new Set(['VS1'])});
  await p.ready; p.pump(); await renderer.finish();
  assert.equal(p.stats.failed, 1); t.now = 5000; p.pump();
  assert.deepEqual(store.saved.at(-1).map((e) => e.d.vs), ['VS2']);
});

test('lo que ya está compilado no se vuelve a pedir; datos guardados rotos se ignoran', async () => {
  const board = new Int32Array(createControl()); Atomics.store(board, C.STAGE, 1);
  const renderer = fakeRenderer(); renderer.build(d(1));
  const p = createPreloader({renderer, store: fakeStore([entry(1), entry(2), null, {d: {}}, {x: 1}]), board});
  await p.ready; p.pump(); await renderer.finish();
  assert.equal(renderer.calls, 1); assert.equal(p.size, 2);
});

test('si el almacén falla al leer, no precarga y no rompe', async () => {
  const board = new Int32Array(createControl()); Atomics.store(board, C.STAGE, 1);
  const renderer = fakeRenderer();
  const p = createPreloader({renderer, store: {load: () => Promise.reject(Error('privado')), save: async () => {}}, board});
  await p.ready.catch(() => {}); await tick(); p.pump(); assert.equal(renderer.calls, 0);
});
