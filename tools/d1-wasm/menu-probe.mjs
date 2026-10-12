// Claude 2026-10-12: sonda EXPLORATORIA de menús del GH3 original (entrega unified-game, perfil nuevo, sin Preparar).
// Llega al menú de Carrera (tras elegir Axel Steel, antes de "Play Show") y aprieta la secuencia de argv:
//   node tools/d1-wasm/menu-probe.mjs down,a,a,esc   (botones: a, start, down, up, left, right, esc, wait)
// Cada paso: captura + archivos que abrió el juego en ese paso. Respeta y libera artifacts/PRUEBAS-EN-CURSO.md.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';

const seq = (process.argv[2] || '').split(',').filter(Boolean);
const root = path.resolve('artifacts/unified-game'), out = path.join(root, 'menu-probe-runs', 'probe-' + Date.now());
fs.mkdirSync(out, {recursive: true});
const turn = 'artifacts/PRUEBAS-EN-CURSO.md', token = `claude-menu-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
const nap = ms => new Promise(r => setTimeout(r, ms));
const report = {seq, started: new Date().toISOString(), steps: [], pageErrors: [], files: []};
const write = () => fs.writeFileSync(out + '/probe.json', JSON.stringify(report, null, 1));
const ownTurn = () => fs.readFileSync(turn, 'utf8').includes('Reserva: ' + token);
let reserved = false, server, browser;
try {
  if (!fs.readFileSync(turn, 'utf8').includes('Estado: LIBRE')) throw Error('Turno ocupado; no se ejecutó el juego.');
  fs.writeFileSync(turn, `# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude\nReserva: ${token}\nQué: sonda de menús ${seq.join(',')}, perfil aislado\nDesde: ${new Date().toISOString()}\nFin: estimado 8 min\n`);
  reserved = true;
  const delivery = JSON.parse(fs.readFileSync(root + '/build-result.json'));
  server = createDemandServer({root: root + '/demo', staticNames: delivery.staticNames});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launchPersistentContext(out + '/edge-profile', {channel: 'msedge', headless: true, viewport: {width: 1280, height: 900}});
  const page = browser.pages()[0];
  page.on('pageerror', e => report.pageErrors.push(e.message));
  const t0 = Date.now();
  await page.exposeFunction('probeFile', line => { const m = /\[g1-file\] path=(\S+)/.exec(line); if (m) report.files.push({ms: Date.now() - t0, f: m[1]}); });
  await page.addInitScript(() => { const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { if (e.data?.type === 'g1eInput') window.g1live = 1; if (e.data?.type === 'log' && /\[g1-file\]/.test(e.data.text)) window.probeFile(e.data.text).catch(() => {}); }); return w; }; });
  await page.goto(`http://127.0.0.1:${server.address().port}/gh3/?manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url`);
  await page.waitForFunction(() => !document.getElementById('loaderPlay').disabled || gh3Loader.error, {}, {timeout: 30000});
  await page.click('#loaderPlay');
  await page.waitForFunction(() => gh3Loader.ready || gh3Loader.error, {}, {timeout: 240000});
  const state = () => page.evaluate(() => ({live: !!window.g1live, menu: !!window.navSeen?.menu, error: gh3Loader.error || d4.songRenderer?.fatal || (d4.exit !== null ? 'Game exited ' + d4.exit : null)}));
  const keys = {start: 'Enter', a: 'Digit1', down: 'ArrowDown', up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', esc: 'Escape'};
  let n = 0;
  const shot = name => page.locator('#r5Canvas').screenshot({path: `${out}/${String(n++).padStart(2, '0')}-${name}.png`, timeout: 3000}).catch(() => {});
  const step = async (b, label) => {
    if (!ownTurn()) throw Error('La reserva cambió.');
    const from = report.files.length;
    if (b !== 'wait') { await page.keyboard.down(keys[b]); await nap(150); await page.keyboard.up(keys[b]); }
    await nap(4500);
    const s = await state(); if (s.error) throw Error(s.error);
    await shot(label.replace(/[^\w]+/g, '_'));
    report.steps.push({label, ms: Date.now() - t0, opened: report.files.slice(from).map(x => x.f)}); write();
    console.log(label, report.files.slice(from).map(x => x.f).join(' '));
  };
  while (!(await state()).live) await nap(200);
  await page.evaluate(() => g1worker.postMessage({type: 'pressClear'}));
  while (!(await state()).menu) { await page.keyboard.down('Enter'); await nap(150); await page.keyboard.up('Enter'); await nap(1500); }
  await nap(3000); await shot('menu');
  for (const [b, l] of [['a', 'Carrera'], ['a', 'Nombre de banda'], ['start', 'Aceptar banda'], ['a', 'Dificultad Medium'], ['a', 'Axel Steel']]) await step(b, l);
  for (const [i, b] of seq.entries()) await step(b, `sonda ${i + 1} ${b}`);
  report.ok = true;
} catch (e) { report.ok = false; report.error = e.stack; process.exitCode = 1; }
finally {
  try { const pg = browser?.pages()[0]; if (pg) fs.writeFileSync(out + '/runtime.log', (await pg.evaluate(() => d4.log)).join('\n')); } catch {}
  await browser?.close(); if (!process.env.KEEP_PROFILE) try { fs.rmSync(out + '/edge-profile', {recursive: true, force: true}); } catch {} if (server) await new Promise(r => server.close(r));
  if (reserved && ownTurn()) fs.writeFileSync(turn, `# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude\nQué: sonda de menús; ${report.ok ? 'terminada' : 'fallo'}\nFin: ${new Date().toISOString()}\n`);
  write(); console.log(JSON.stringify({out, ok: report.ok, error: report.error?.split('\n')[0]}));
}
