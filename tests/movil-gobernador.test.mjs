// Gobernador móvil con telemetría SIMULADA (Node). Prueba la lógica de decisión, la histéresis y la tabla de acciones.
// No prueba el juego real ni el iPhone: los umbrales son iniciales y se calibran con mediciones físicas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {C, CONTROL_BYTES, createControl} from '../tools/r5-native60/control.mjs';
import {POLICY, knob, shouldCapture, rendererConfig} from '../tools/r5-native60/governor-policy.mjs';

const ctx = {Atomics, console}; vm.runInNewContext(fs.readFileSync('web/gh3-native60/gh3-governor.js', 'utf8'), ctx);
const {createGovernor, writeBoard, CTRL, SCALES, LEVELS} = ctx.gh3GovernorCore;

// Escenario base en calma (valores de ejemplo, no medidos).
function calm(now, over = {}) {
  return {now,
    audio: {playing: true, reserveMs: 200, minReserveMs: 180, targetMs: 200, underrunsDelta: 0, skipsDelta: 0, rate: 1, productionRatio: 1, trendMsPerS: 0, ...over.audio},
    cpu: {prepMs: 4, prepMaxMs: 6, inputLatencyMs: 15, swapsPerSec: 60, inSong: true, ...over.cpu},
    gpu: over.gpu === null ? null : {gpuMs: 4, gpuMaxMs: 6, scale: 1, lost: false, ...over.gpu},
    mem: {visualMiB: 40, budgetMiB: 160, lost: false, ...over.mem}};
}
// Corre de `from` a `to` ms con ticks de 100 ms. f(t, gov) devuelve la muestra. Registra el historial.
function run(gov, from, to, f, log = []) {
  for (let t = from; t < to; t += 100) { const o = gov.tick(f(t, gov)); log.push({t, level: o.level, cpu: o.cpu, gpu: o.gpu, mem: o.mem}); }
  return log;
}
const firstAt = (log, pred) => log.find(pred)?.t;

test('los índices del tablero de la página coinciden con tools/r5-native60/control.mjs', () => {
  assert.deepEqual({...CTRL}, {...C});
  assert.equal(CONTROL_BYTES / 4 > Math.max(...Object.values(C)), true);
  assert.equal(new Set(Object.values(C)).size, Object.values(C).length, 'índices únicos');
});

test('en calma sostenida no cambia nada (60 s)', () => {
  const g = createGovernor(), log = run(g, 0, 60000, (t) => calm(t));
  assert.equal(g.transitions.length, 0); assert.ok(log.every((x) => x.level === 0));
});

test('reserva de audio baja: protege en el MISMO tick (recorte rápido)', () => {
  const g = createGovernor(); run(g, 0, 5000, (t) => calm(t));
  const o = g.tick(calm(5000, {audio: {reserveMs: 110, minReserveMs: 100}}));
  assert.equal(o.level, 1); assert.equal(o.cpu, 1, 'CPU primero: menos preparación/captura');
  assert.match(g.transitions.at(-1).por, /audio: colchón/);
});

test('un corte de audio pasa a MÍNIMO en el mismo tick (CPU y GPU al mínimo, memoria protegida)', () => {
  const g = createGovernor(); run(g, 0, 2000, (t) => calm(t));
  const o = g.tick(calm(2000, {audio: {underrunsDelta: 1, reserveMs: 20, minReserveMs: 0}}));
  assert.deepEqual([o.level, o.cpu, o.gpu, o.mem], [2, 2, 2, 1]);
  assert.equal(LEVELS[o.level], 'mínimo');
});

test('recuperación lenta y de a un escalón: ≥5 s para mínimo→protegido y ≥10 s más para normal', () => {
  const g = createGovernor(); g.tick(calm(0, {audio: {underrunsDelta: 1, minReserveMs: 0}}));
  const log = run(g, 100, 40000, (t) => calm(t));
  const to1 = firstAt(log, (x) => x.cpu === 1), to0 = firstAt(log, (x) => x.cpu === 0);
  assert.ok(to1 >= 5000 && to1 < 6000, 'mínimo→protegido a los ' + to1);
  assert.ok(to0 - to1 >= 10000 && to0 - to1 < 11000, 'protegido→normal ' + (to0 - to1) + ' ms después');
  assert.ok(log.every((x, i) => !i || x.cpu >= log[i - 1].cpu - 1), 'nunca baja dos escalones de golpe');
});

test('no recupera mientras el audio no esté en calma (colchón 150 ms: sin riesgo pero sin margen)', () => {
  const g = createGovernor(); g.tick(calm(0, {audio: {reserveMs: 100, minReserveMs: 90}}));
  const log = run(g, 100, 60000, (t) => calm(t, {audio: {reserveMs: 150, minReserveMs: 140}}));
  assert.ok(log.every((x) => x.cpu === 1));
});

test('señal oscilando cerca del umbral cada 3 s: un solo cambio en 2 minutos (histéresis)', () => {
  const g = createGovernor();
  run(g, 0, 120000, (t) => calm(t, Math.floor(t / 1500) % 2 ? {audio: {reserveMs: 110, minReserveMs: 105}} : {}));
  assert.equal(g.transitions.length, 1, JSON.stringify(g.transitions));
});

test('oscilación lenta (15 s riesgo / 15 s calma): la espera se duplica y deja de oscilar', () => {
  const g = createGovernor();
  run(g, 0, 300000, (t) => calm(t, Math.floor(t / 15000) % 2 === 0 ? {audio: {reserveMs: 110, minReserveMs: 105}} : {}));
  assert.ok(g.transitions.length <= 4, 'transiciones ' + g.transitions.length);
  assert.ok(g.knobs.cpu.backoff >= 2, 'espera duplicada ' + g.knobs.cpu.backoff);
});

// GPU: el costo cae con los píxeles (∝ escala²). El "worker" aplica la escala de la perilla en el tick siguiente.
const gpuLoad = (base) => (t, g) => { const s = SCALES[g.out.gpu]; return calm(t, {gpu: {gpuMs: base * s * s, gpuMaxMs: base * s * s * 1.3, scale: s}}); };
test('cuello de GPU (16 ms a 1280×720): baja a 960×540 y se queda, sin tocar CPU ni oscilar', () => {
  const g = createGovernor(), log = run(g, 0, 60000, gpuLoad(16));
  assert.equal(log.at(-1).gpu, 1); assert.equal(log.at(-1).cpu, 0); assert.equal(g.transitions.length, 1);
});
test('cuello de GPU fuerte (30 ms): 640×360 y se queda', () => {
  const g = createGovernor(), log = run(g, 0, 60000, gpuLoad(30));
  assert.equal(log.at(-1).gpu, 2); assert.equal(log.at(-1).cpu, 0); assert.equal(g.transitions.length, 1);
});
test('si la carga de GPU baja, vuelve a 1280×720 tras la espera (predice el costo del escalón superior)', () => {
  const g = createGovernor(); run(g, 0, 5000, gpuLoad(16));
  const log = run(g, 5000, 40000, gpuLoad(6));
  const back = firstAt(log, (x) => x.gpu === 0);
  assert.ok(back >= 15000 && back <= 16000, 'volvió a los ' + back);
});

test('cuello de CPU (preparación 20 ms): protege la CPU y no toca la GPU', () => {
  const g = createGovernor(), o = run(g, 0, 3000, (t) => calm(t, {cpu: {prepMs: 20, prepMaxMs: 26}})).at(-1);
  assert.deepEqual([o.cpu, o.gpu, o.mem], [1, 0, 0]);
});
test('latencia de entrada alta (80 ms) protege la CPU; vuelve cuando baja', () => {
  const g = createGovernor(), log = run(g, 0, 3000, (t) => calm(t, {cpu: {inputLatencyMs: 80}}));
  assert.equal(log.at(-1).cpu, 1);
  const after = run(g, 3000, 20000, (t) => calm(t));
  assert.equal(after.at(-1).cpu, 0);
});
test('memoria: 140/160 MiB protege texturas; dispositivo perdido = mínimo de GPU y memoria', () => {
  const g = createGovernor(), o = run(g, 0, 1000, (t) => calm(t, {mem: {visualMiB: 140}})).at(-1);
  assert.deepEqual([o.mem, o.cpu, o.gpu], [1, 0, 0]);
  const p = g.tick(calm(1100, {mem: {lost: true}, gpu: {lost: true}}));
  assert.deepEqual([p.mem, p.gpu], [2, 2]);
});

test('anticipo (inicio de canción, 6 s): protege desde el primer tick y vuelve apenas vence si hubo calma', () => {
  const g = createGovernor(); g.anticipate(1, 6000, 'inicio de canción', 0);
  const log = run(g, 0, 20000, (t) => calm(t));
  assert.equal(log[0].cpu, 1); assert.equal(log[0].gpu, 1); assert.equal(log[0].mem, 0);
  assert.ok(log.filter((x) => x.t < 6000).every((x) => x.cpu === 1));
  const back = firstAt(log, (x) => x.cpu === 0);
  assert.ok(back >= 10000 && back <= 10200, 'vuelve a los ' + back + ' ms (calma de 10 s contada durante el anticipo)');
  assert.match(g.transitions[0].por, /anticipo: inicio de canción/);
});
test('anticipo de carga reemplazado por el de inicio de canción', () => {
  const g = createGovernor(); g.anticipate(1, 60000, 'carga del nivel', 0); g.anticipate(1, 6000, 'inicio de canción', 1000, true);
  assert.equal(g.floor.until, 7000); assert.equal(g.floor.why, 'inicio de canción');
});

test('sin audio sonando, sin GPU ni consumidor: no falla y decide con lo que hay', () => {
  const g = createGovernor();
  assert.doesNotThrow(() => run(g, 0, 2000, (t) => ({now: t, audio: null, cpu: {prepMs: null, prepMaxMs: 0, inputLatencyMs: null, swapsPerSec: null, inSong: false}, gpu: null, mem: null})));
  assert.equal(g.out.level, 0);
  const o = g.tick({...calm(2100), audio: {...calm(0).audio, playing: false, reserveMs: 0, minReserveMs: 0}});
  assert.equal(o.level, 0, 'audio detenido (menús, pausa) no es riesgo');
});

test('configuración ajustable para calibrar (sin tocar el código)', () => {
  const g = createGovernor({gpu: {protMs: 20}});
  const o = run(g, 0, 2000, gpuLoad(16)).at(-1); assert.equal(o.gpu, 0);
  g.setConfig({gpu: {protMs: 10}}); assert.equal(run(g, 2000, 2500, gpuLoad(16)).at(-1).gpu, 1);
});

test('tablero: «activo» escribe la política, «observa» deja todo en 0 y un tablero viejo no se toca', () => {
  const i32 = new Int32Array(createControl()), out = {level: 2, cpu: 2, gpu: 1, mem: 1};
  assert.equal(writeBoard(i32, out, true), true);
  assert.deepEqual([i32[C.LEVEL], i32[C.CPU], i32[C.GPU], i32[C.MEM], i32[C.ACTIVE], i32[C.POLICY_SEQ]], [2, 2, 1, 1, 1, 1]);
  assert.equal(writeBoard(i32, out, true), false, 'sin cambios no reescribe'); assert.equal(i32[C.POLICY_SEQ], 1);
  writeBoard(i32, out, false);
  assert.deepEqual([i32[C.LEVEL], i32[C.CPU], i32[C.GPU], i32[C.MEM], i32[C.ACTIVE]], [0, 0, 0, 0, 0]);
  const old = new Int32Array(new SharedArrayBuffer(8)); assert.equal(writeBoard(old, out, true), false);
});

test('política: captura espaciada ≈ 30 snapshots/s a 60 Hz con jitter, decidida antes de leer', () => {
  let last = -1e9, captured = 0, t = 0, seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let i = 0; i < 600; i++) { t += 1000 / 60 + (rnd() - 0.5) * 8; if (shouldCapture(t, last, 1)) { last = t; captured++; } }
  const perSec = captured / (t / 1000);
  assert.ok(perSec > 28 && perSec < 33, 'snapshots/s ' + perSec.toFixed(1));
  assert.equal([0, 16, 17].every((d) => shouldCapture(100 + d, 100, 0)), true, 'normal: todos');
});
test('política: perillas → escala, presupuestos, sólo pista y texturas diferidas', () => {
  assert.deepEqual(rendererConfig(0, 0, 0), {scale: 1, gpuTextureBytes: 64 << 20, cpuTextureBytes: 96 << 20, deferSceneUploads: false});
  assert.deepEqual(rendererConfig(1, 1, 0), {scale: 0.75, gpuTextureBytes: 64 << 20, cpuTextureBytes: 96 << 20, deferSceneUploads: true});
  assert.deepEqual(rendererConfig(0, 2, 2), {scale: 0.5, gpuTextureBytes: 24 << 20, cpuTextureBytes: 24 << 20, deferSceneUploads: true});
  assert.equal(POLICY.cpu[2].roadOnly, true); assert.equal(POLICY.cpu[1].roadOnly, false);
  const i32 = new Int32Array(createControl()); i32[C.CPU] = 7; assert.equal(knob(i32, C.CPU), 2);
  assert.equal(knob(new Int32Array(new SharedArrayBuffer(8)), C.CPU), 0, 'consumidor viejo = sin gobernador');
});
