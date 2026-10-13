// Comparador de corridas del gobernador (observa vs activo) con corridas INVENTADAS (Node).
// No mide el juego real: sólo comprueba que la comparación lea bien lo que guarda run-song.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {compareRuns, summarizeRun, toMarkdown} from '../tools/r5-native60/compare-gov.mjs';

// Corrida falsa con la forma de verification.json: una muestra cada 2 s y el resumen de gh3Governor.summary().
function run({modo = 'observa', fps = 60, juego = 30, cortes = 0, saltos = 0, estirados = 0, p95 = 16, seg = {normal: 50, protegido: 0, minimo: 0}, trans = 0, song = 'slowride', ok = true} = {}) {
  const samples = [];
  for (let i = 0; i <= 30; i++) samples.push({t: 1000 + i * 2000, clock: i * 2000, presented: i * 2 * fps, renderer: {submitted: i * 2 * juego}, audio: {underruns: i === 30 ? cortes : 0, skips: i === 30 ? saltos : 0, silentBlocks: 0}});
  return {song, full: false, ok, query: `manual=1&gov=${modo}`, samples, audioEvents: [],
    governor: {modo, estado: 'normal', decision: {estado: 'normal'}, segundosEnEstado: seg, transiciones: Array(trans).fill({}),
      medidas: {swapsJuegoPorSeg: juego, snapshotsPorSeg: 30, escala: 1, soloPista: false, colchonMinMs: 40, latenciaJuego: {p50Ms: 8, p95Ms: p95, maxMs: p95 + 8}},
      audio: {cortes, saltos, bloquesEstirados: estirados, falla: cortes > 0 || saltos > 0}}};
}

test('resume una corrida: fps del tramo estable, audio y estados', () => {
  const r = summarizeRun(run({fps: 60, juego: 30}));
  assert.equal(r.modo, 'observa');
  assert.equal(r.imagen.fpsPresentados, 60);
  assert.equal(r.imagen.fpsJuego, 30);
  assert.equal(r.audio.falla, false);
  assert.equal(r.controles.p95Ms, 16);
  assert.equal(r.segundosMedidos, 50);  // sólo desde el reloj de canción ≥ 10 s
});

test('dos corridas limpias: sin falla y dice si habría recortado', () => {
  const c = compareRuns(run({seg: {normal: 40, protegido: 8, minimo: 2}, trans: 3}), run({modo: 'activo', fps: 58}));
  assert.deepEqual(c.avisos, []);
  assert.ok(c.conclusiones.some((x) => x.includes('habría recortado 10 s')));
  assert.ok(c.conclusiones.some((x) => x.includes('sin cortes ni saltos')));
  assert.equal(c.cambios.fpsPresentados, -2);
});

test('cortes o saltos son falla y se marcan si el activo empeora', () => {
  const c = compareRuns(run(), run({modo: 'activo', cortes: 2, saltos: 1, estirados: 5, p95: 40}));
  assert.ok(c.conclusiones.some((x) => x.startsWith('FALLA activo')));
  assert.ok(c.conclusiones.some((x) => x.includes('MÁS cortes')));
  assert.ok(c.conclusiones.some((x) => x.includes('se estiró')));
  assert.ok(c.conclusiones.some((x) => x.includes('controles respondieron peor')));
  assert.ok(!c.conclusiones.some((x) => x.includes('sin cortes ni saltos')));
});

test('avisa corridas que no se pueden comparar', () => {
  const sin = run({modo: 'activo'}); delete sin.governor; sin.ok = false; sin.error = 'Error: Turno ocupado\n  at x';
  const c = compareRuns(run({modo: 'activo', song: 'barracuda'}), sin);
  assert.ok(c.avisos.some((x) => x.includes('Temas distintos')));
  assert.ok(c.avisos.some((x) => x.includes('modo «activo»')));
  assert.ok(c.avisos.some((x) => x.includes('activo falló: Error: Turno ocupado')));
  assert.ok(c.avisos.some((x) => x.includes('no tiene el resumen')));
  assert.equal(c.activo.audio.cortes, 0);  // sin gobernador usa el contador del juego
  assert.match(toMarkdown(c), /Gobernador: sólo mirando vs activo/);
});

test('línea de comandos: lee carpetas de corrida y guarda la tabla', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-cmp-'));
  for (const [k, r] of [['obs', run()], ['act', run({modo: 'activo'})]]) { fs.mkdirSync(path.join(dir, k)); fs.writeFileSync(path.join(dir, k, 'verification.json'), JSON.stringify(r)); }
  const out = execFileSync(process.execPath, ['tools/r5-native60/compare-gov.mjs', path.join(dir, 'obs'), path.join(dir, 'act'), path.join(dir, 'cmp')], {encoding: 'utf8'});
  assert.match(out, /\| Cortes de audio/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'cmp', 'comparacion.json'))).activo.modo, 'activo');
  assert.ok(fs.existsSync(path.join(dir, 'cmp', 'comparacion.md')));
  fs.rmSync(dir, {recursive: true, force: true});
});

// measure-gov.mjs con un run-song FALSO (GOV_RUNNER): comprueba el orden, el ?gov= de cada corrida y la comparación final.
const FAKE = `import fs from 'node:fs';import path from 'node:path';
const q=new URLSearchParams(process.env.GH3_QUERY),gov=q.get('gov'),out=path.join(process.env.FAKE_DIR,process.env.HW60_LABEL);
fs.appendFileSync(path.join(process.env.FAKE_DIR,'orden.txt'),gov+' '+process.argv.slice(2).join(' ')+'\\n');
if(process.env.FAKE_FAIL===gov){console.log('Turno ocupado');process.exit(1);}
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify({...JSON.parse(process.env.FAKE_RUN),query:process.env.GH3_QUERY,governor:{...JSON.parse(process.env.FAKE_RUN).governor,modo:gov==='1'?'activo':gov}}));
console.log('etapa songPlaying');console.log(JSON.stringify({out,song:process.argv[2],ok:true}));`;

function measure(extra = {}, args = ['talkdirtytome', '--full']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-measure-')); fs.writeFileSync(path.join(dir, 'fake.mjs'), FAKE);
  const env = {...process.env, GOV_RUNNER: path.join(dir, 'fake.mjs'), FAKE_DIR: dir, FAKE_RUN: JSON.stringify(run()), GOV_OUT: path.join(dir, 'cmp'), GOV_PAUSE_MS: '0', DEMO_ROOT: path.join(dir, 'sin-demo')};
  delete env.GH3_QUERY; Object.assign(env, extra);
  let code = 0, stdout;
  try { stdout = execFileSync(process.execPath, ['tools/r5-native60/measure-gov.mjs', ...args], {env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}); } catch (e) { code = e.status; stdout = e.stdout; }
  return {dir, code, stdout, orden: fs.readFileSync(path.join(dir, 'orden.txt'), 'utf8').trim().split('\n')};
}

test('medir: corre primero observa y después activo, con el mismo tema, y compara', () => {
  const r = measure();
  assert.equal(r.code, 0, r.stdout);
  assert.deepEqual(r.orden, ['observa talkdirtytome --wait --full', '1 talkdirtytome --wait --full']);
  const c = JSON.parse(fs.readFileSync(path.join(r.dir, 'cmp', 'comparacion.json')));
  assert.equal(c.observa.modo, 'observa'); assert.equal(c.activo.modo, 'activo');
  assert.deepEqual(c.avisos, []);
  assert.match(r.stdout, /Corrida observa[\s\S]*Corrida activo[\s\S]*\| Cortes de audio/);
  fs.rmSync(r.dir, {recursive: true, force: true});
});

test('medir: --escena usa el consumidor de escena y respeta un GH3_QUERY propio', () => {
  const a = measure({}, ['slowride', '--escena']);
  const qa = new URLSearchParams(JSON.parse(fs.readFileSync(path.join(a.dir, 'gov-activo-escena', 'verification.json'))).query);
  assert.equal(qa.get('r5liveconsumer'), 'r5snap-native60-scene.js'); assert.equal(qa.get('gov'), '1');
  const b = measure({GH3_QUERY: 'manual=1&gov=0&x=7'}, ['slowride']);
  const qb = new URLSearchParams(JSON.parse(fs.readFileSync(path.join(b.dir, 'gov-observa-pista', 'verification.json'))).query);
  assert.equal(qb.get('x'), '7'); assert.equal(qb.get('gov'), 'observa');  // reemplaza el gov que traía
  for (const d of [a.dir, b.dir]) fs.rmSync(d, {recursive: true, force: true});
});

test('medir: si la primera corrida no guarda nada, no corre la segunda', () => {
  const r = measure({FAKE_FAIL: 'observa'});
  assert.equal(r.code, 1);
  assert.deepEqual(r.orden, ['observa talkdirtytome --wait --full']);
  fs.rmSync(r.dir, {recursive: true, force: true});
});
