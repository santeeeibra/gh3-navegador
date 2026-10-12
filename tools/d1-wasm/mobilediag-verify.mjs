// Prueba del diagnóstico móvil SIN juego (Claude): Edge emulando iPhone horizontal (896x414, táctil) sobre
// artifacts/d1-wasm/mobilediag/test/diag-test.html, con un worker falso que imita a gh3-web.js.
// Escenas: arranque completo, aborto del motor, error al compilar, cuelgue; sonido suspendido y recuperado;
// cierre brusco de la pestaña (Page.crash) detectado en la carga siguiente.
// Uso: node tools/d1-wasm/mobilediag-verify.mjs [etiqueta=diag-1] [puerto=5452]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
const [label = 'diag-1', port = 5452] = process.argv.slice(2);
const out = path.resolve('artifacts/d1-wasm/mobilediag/runs', label); fs.mkdirSync(out, { recursive: true });
const FILES = { 'diag-test.html': 'artifacts/d1-wasm/mobilediag/test/diag-test.html', 'fake-worker.js': 'artifacts/d1-wasm/mobilediag/test/fake-worker.js',
  'gh3-diag.js': 'artifacts/d1-wasm/mobilediag/gh3-diag.js', 'gh3-input.js': 'artifacts/d1-wasm/touch/gh3-input.js', 'gh3-touch.js': 'artifacts/d1-wasm/touch/gh3-touch.js' };
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname.slice(1);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (!FILES[name]) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' }); res.end(fs.readFileSync(FILES[name]));
}).listen(+port, '127.0.0.1');
const report = { label, checks: [], pageErrors: [] };
const check = (name, ok, got) => { report.checks.push({ name, ok: !!ok, got }); console.log((ok ? 'OK   ' : 'FALLA') + ' ' + name + (ok ? '' : ' ' + JSON.stringify(got))); };
const URL0 = `http://127.0.0.1:${port}/diag-test.html`;
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const D = (page) => page.evaluate(() => JSON.parse(JSON.stringify(gh3Diag)));
  const open = async (q = '') => { const p = await ctx.newPage(); p.on('pageerror', (e) => report.pageErrors.push(e.message)); await p.goto(URL0 + q); await p.waitForSelector('#gh3Diag'); return p; };
  const hide = (page, v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);

  // 1. Arranque completo.
  let page = await open(), d = await D(page);
  check('al abrir: etapa página, táctil oculto', d.stage === 'pagina' && !(await page.evaluate(() => gh3Touch.enabled())), d.stage);
  await page.tap('#play');
  await page.waitForFunction(() => gh3Diag.stage === 'cancion' && gh3Song.clock() > 5000, null, { timeout: 20000 }); await page.waitForTimeout(2500);
  d = await D(page);
  const order = ['pagina', 'programa', 'compilando', 'motor', 'menu', 'entrando', 'cancion'];
  check('etapas en orden hasta canción', order.every((k, i) => k in d.stages && (i === 0 || d.stages[k] >= d.stages[order[i - 1]])), d.stages);
  check('memoria wasm registrada', d.mem.wasmPeak === 1400 * 1048576, d.mem);
  check('sonido creado en el toque de Jugar', d.audio.created !== undefined && ['running', 'suspended'].includes(d.audio.state), d.audio);
  check('cortes de audio en canción contados', d.audio.songUnderruns === 2, d.audio);
  check('táctil activo al arrancar el juego', await page.evaluate(() => gh3Touch.enabled()), null);
  report.audioStateAfterPlay = d.audio.state;
  // 2. Volver de otra app con el sonido suspendido: se recupera solo.
  await page.evaluate(() => r6ctx.resume()); await page.waitForFunction(() => r6ctx.state === 'running', null, { timeout: 5000 });
  await page.evaluate(() => r6ctx.suspend()); await hide(page, 'hidden'); await page.waitForTimeout(200); await hide(page, 'visible'); await page.waitForTimeout(1200);
  d = await D(page);
  check('volver de otra app: sonido recuperado solo', d.audio.autoResumed === 1 && (await page.evaluate(() => r6ctx.state)) === 'running', d.audio);
  // 3. Si iOS no deja reanudar sin toque: aparece el botón y un toque lo recupera.
  await page.evaluate(() => { r6ctx.suspend(); r6ctx.resume = async () => {}; }); await hide(page, 'hidden'); await page.waitForTimeout(200); await hide(page, 'visible'); await page.waitForTimeout(1200);
  const shown = await page.evaluate(() => getComputedStyle(document.getElementById('gh3Wake')).display === 'flex');
  await page.screenshot({ path: out + '/despertar-sonido.png' });
  await page.evaluate(() => { delete r6ctx.resume; }); await page.tap('#gh3Wake button'); await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ state: r6ctx.state, wake: getComputedStyle(document.getElementById('gh3Wake')).display }));
  check('sin permiso: botón «reactivar sonido» y toque lo recupera', shown && after.state === 'running' && after.wake === 'none', { shown, after });
  await page.tap('#gh3Diag'); await page.waitForTimeout(300); await page.screenshot({ path: out + '/informe-abierto.png' });
  report.textOk = await page.evaluate(() => gh3Diag.text());
  // 4. Cierre brusco (como Safari sin memoria): la carga siguiente lo informa con la etapa.
  const cdp = await ctx.newCDPSession(page); cdp.send('Page.crash').catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  page = await open(); d = await D(page);
  check('cierre brusco detectado al reabrir', d.previous && !d.previous.ended && d.previous.stage === 'cancion' && /se cortó sin aviso/.test(d.previous.verdict), d.previous);
  await page.screenshot({ path: out + '/sesion-anterior.png' });
  // 5. Recarga normal: no se confunde con un cierre brusco.
  await page.reload(); await page.waitForSelector('#gh3Diag'); d = await D(page);
  check('recarga normal = sesión terminada', d.previous?.ended === 'página cerrada o recargada', d.previous);
  await page.close();
  // 6. El motor aborta en el menú: etapa, error exacto, aviso rojo.
  page = await open('?escena=abort'); await page.tap('#play'); await page.waitForFunction(() => gh3Diag.stage === 'detenido', null, { timeout: 10000 }); d = await D(page);
  report.textAbort = await page.evaluate(() => gh3Diag.text());
  check('aborto: se detuvo en Menú con el error exacto', d.stoppedIn === 'menu' && d.errors.some((e) => /memory access out of bounds/.test(e.message)) && await page.evaluate(() => document.getElementById('gh3Diag').classList.contains('bad')), { stoppedIn: d.stoppedIn, errors: d.errors });
  await page.screenshot({ path: out + '/aborto.png' }); await page.close();
  // 7. Falla al compilar (sin memoria).
  page = await open('?escena=compila-mal'); await page.tap('#play'); await page.waitForFunction(() => gh3Diag.stage === 'detenido', null, { timeout: 10000 }); d = await D(page);
  check('compilación: se detuvo en Compilando con «Out of memory»', d.stoppedIn === 'compilando' && d.errors.some((e) => e.kind === 'carga/compilación' && /Out of memory/.test(e.message)), { stoppedIn: d.stoppedIn, errors: d.errors });
  await page.close();
  // 8. Cuelgue: queda en Iniciando el motor y cuenta segundos sin actividad.
  page = await open('?escena=cuelga'); await page.tap('#play'); await page.waitForTimeout(7000); d = await D(page);
  check('cuelgue: etapa motor y segundos sin actividad', d.stage === 'motor' && d.quietS >= 4, { stage: d.stage, quietS: d.quietS });
  await page.close();
} catch (e) { report.error = e.stack; console.log(e.stack); }
finally { await browser?.close(); server.close(); }
report.ok = !report.error && !report.pageErrors.length && report.checks.every((c) => c.ok);
fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ label, ok: report.ok, checks: report.checks.length, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), pageErrors: report.pageErrors, audioAfterPlay: report.audioStateAfterPlay }));
if (!report.ok) process.exitCode = 1;
