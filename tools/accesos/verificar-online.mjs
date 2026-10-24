// Claude 2026-10-15: abre lasvegasherogame.com/gh3/ en Edge oculto, aprieta Jugar y espera el menú principal (≤ plazo).
// Uso: node tools/accesos/verificar-online.mjs [segundos=240]
import {chromium} from 'playwright';
import fs from 'node:fs';
const PLAZO = Number(process.argv[2] || 240) * 1000, t0 = Date.now(), dir = 'artifacts/d1-wasm/perfil-pruebas/online';
fs.mkdirSync(dir, {recursive: true});
const b = await chromium.launchPersistentContext(dir, {channel: 'msedge', headless: true, viewport: {width: 1600, height: 900}});
const r = {ok: false, errores: []};
try {
  const p = b.pages()[0] || await b.newPage(); p.on('pageerror', e => r.errores.push(e.message));
  // Marca de prueba para el monitor: estas visitas son de Claude.
  await p.addInitScript(() => { try { localStorage.setItem('gh3-test-profile', 'claude'); } catch {} });
  await p.addInitScript(() => { const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { if (e.data?.type === 'g1eInput') window.g1live = 1; }); return w; }; });
  await p.goto('https://lasvegasherogame.com/gh3/?manual=1');
  await p.waitForFunction(() => !document.getElementById('loaderPlay').disabled || gh3Loader.error, {}, {timeout: PLAZO});
  await p.click('#loaderPlay'); r.jugarMs = Date.now() - t0;
  await p.waitForFunction(() => gh3Loader.ready || gh3Loader.error, {}, {timeout: PLAZO - (Date.now() - t0)});
  r.cargador = await p.evaluate(() => gh3Loader.error || 'listo');
  for (let k = 0; !(await p.evaluate(() => !!window.navSeen?.menu)); k++) {
    if (Date.now() - t0 > PLAZO) throw Error('sin menú dentro del plazo');
    if (await p.evaluate(() => window.g1live)) await p.evaluate(n => gh3Input.tap(n), k % 2 ? 'a' : 'start');
    await new Promise(z => setTimeout(z, 350));
  }
  r.menuMs = Date.now() - t0; await new Promise(z => setTimeout(z, 2000));
  await p.locator('#r5Canvas').screenshot({path: 'artifacts/gh3-liviano/online-menu.png'}).catch(() => {});
  r.ok = !r.errores.length;
} catch (e) { r.error = e.message; } finally { await b.close(); console.log(JSON.stringify(r)); }
