// Prueba con GH3 del paquete de diagnóstico (Claude). Mismo recorrido que el iPhone pero en Edge de la PC: páginas
// públicas de Codex (tools/iphone-probe, solo lectura, servidas en 127.0.0.1) → importar
// artifacts/d1-wasm/mobilediag/GH3-Slow-Ride-diag.gh3mobile → /iphone/private/index.html → Jugar. Pantalla 896x414
// táctil. Un robot toca Slow Ride SOLO con eventos táctiles sobre gh3-touch.js. A mitad de canción simula ir a otra
// app (sonido suspendido + página oculta) y volver. Registra etapas, memoria, cortes y el informe del diagnóstico.
// Requiere turno: GPUCAP_TURN=<token> node tools/d1-wasm/mobilediag-game.mjs <etiqueta> [puerto=5484]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import { requireTurn } from '../gpu-capture/lib.mjs';
requireTurn();
const [label = 'game-1', port = 5484] = process.argv.slice(2);
const out = path.resolve('artifacts/d1-wasm/mobilediag/runs', label); if (fs.existsSync(out)) throw Error('Run exists'); fs.mkdirSync(out, { recursive: true });
const PKG = path.resolve('artifacts/d1-wasm/mobilediag/GH3-Slow-Ride-diag.gh3mobile');
const game = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock', cx = { window: {} };
vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js', 'utf8'), cx);
const chart = cx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game + '/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))), 'slowride', 'medium');
const report = { label, pageErrors: [], privateNetwork: [], samples: [], started: new Date().toISOString() };
const PUBLIC = ['index.html', 'preparar.html', 'private-store.js', 'private-import.js', 'private-sw.js'];
const server = http.createServer((req, res) => {
  for (const [k, v] of Object.entries({ 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' })) res.setHeader(k, v);
  const u = new URL(req.url, 'http://x'), name = u.pathname === '/iphone/' ? 'index.html' : u.pathname.slice('/iphone/'.length);
  if (u.pathname.startsWith('/iphone/private/') || u.pathname.startsWith('/local-')) report.privateNetwork.push(u.pathname);
  if (!u.pathname.startsWith('/iphone/') || !PUBLIC.includes(name)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', name.endsWith('.html') ? 'text/html' : 'text/javascript'); res.end(fs.readFileSync('tools/iphone-probe/' + name));
}).listen(+port, '127.0.0.1');
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  const ctx = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/iphone/preparar.html`); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const tImp = Date.now(); await page.locator('#file').setInputFiles(PKG); await page.click('#import');
  await page.waitForFunction(() => /Paquete listo|dañada|inválid|espacio/.test(document.getElementById('status').textContent), null, { timeout: 600000 });
  report.import = { status: await page.locator('#status').innerText(), seconds: (Date.now() - tImp) / 1000 }; console.log('import', JSON.stringify(report.import));
  if (!/Paquete listo/.test(report.import.status)) throw Error('Importación: ' + report.import.status);
  await page.goto(`http://127.0.0.1:${port}/iphone/private/index.html`);
  await page.waitForSelector('#gh3Diag');
  await page.waitForFunction(() => window.gh3Loader?.ready || window.gh3Loader?.error || !document.getElementById('loaderPrepare')?.disabled, null, { timeout: 240000 });
  let ready = await page.evaluate(() => ({ ready: gh3Loader.ready, error: gh3Loader.error }));
  if (!ready.ready && !ready.error) { await page.evaluate(() => document.getElementById('loaderPrepare').click()); await page.waitForFunction(() => gh3Loader.ready || gh3Loader.error, null, { timeout: 240000 }); }
  ready = await page.evaluate(() => ({ ready: gh3Loader.ready, error: gh3Loader.error })); if (!ready.ready) throw Error('Cargador: ' + JSON.stringify(ready));
  report.touchBeforePlay = await page.evaluate(() => window.gh3Touch?.enabled());
  await page.locator('#loaderPlay').tap();  // toque real: crea el AudioContext dentro del gesto
  // Robot táctil (igual a tools/d1-wasm/touch-song.mjs): eventos de puntero sobre los botones, guiado por el reloj.
  await page.evaluate((notes) => {
    const LEAD = -350, z = (s) => document.querySelector('#gh3Touch ' + s);
    const ev = (type, el, id) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); };
    const st = window.touchBot = { strums: 0, chords: 0, clockMax: -1e9 };
    let i = 0, held = 0, nextId = 100;
    const setFrets = (mask) => { for (let k = 0; k < 5; k++) { const b = 1 << k, el = z('.f' + k); if ((mask & b) && !(held & b)) ev('pointerdown', el, 10 + k); if (!(mask & b) && (held & b)) ev('pointerup', el, 10 + k); } held = mask; };
    setInterval(() => {
      const raw = window.gh3Song?.clock?.();
      if (!Number.isFinite(raw) || raw === 0 || !window.gh3Touch?.enabled()) return;
      if (raw > st.clockMax) st.clockMax = raw;
      const now = raw + LEAD;
      while (i < notes.length && notes[i].t < now - 150) i++;
      if (i >= notes.length) { setFrets(0); return; }
      const n = notes[i];
      if (now >= n.t - 70) setFrets(n.mask & 31);
      if (now >= n.t) { const id = nextId++, s = z('.strum'); ev('pointerdown', s, id); setTimeout(() => ev('pointerup', s, id), 20); st.strums++; if ((n.mask & 31) & ((n.mask & 31) - 1)) st.chords++; i++; }
    }, 1);
  }, chart.notes);
  const start = Date.now(); let away = false;
  while ((Date.now() - start) / 1000 < 480) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({ stage: gh3Diag.stage, clockMs: window.gh3Song?.clock?.(), wasmMB: gh3Diag.mem.wasmBytes && Math.round(gh3Diag.mem.wasmBytes / 1048576), audio: { ...gh3Diag.audio }, presented: d4.songPresented || 0, bot: { ...window.touchBot }, errors: gh3Diag.errors.length, exit: d4.exit }));
    report.samples.push({ wallS: (Date.now() - start) / 1000, ...s }); fs.writeFileSync(out + '/progress.json', JSON.stringify(s));
    // A los ~100 s de canción: "ir a otra app" 5 s con el sonido suspendido, y volver.
    if (!away && s.clockMs > 100000) {
      away = true;
      report.awayBefore = await page.evaluate(async () => { await r6ctx.suspend(); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return { state: r6ctx.state, underruns: d4.r6Audio?.underruns }; });
      await page.waitForTimeout(5000);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(2500);
      report.awayAfter = await page.evaluate(() => ({ state: r6ctx.state, audio: { ...gh3Diag.audio }, wake: getComputedStyle(document.getElementById('gh3Wake')).display }));
      console.log('away', JSON.stringify(report.awayAfter));
    }
    if (s.exit !== null && s.exit !== undefined) break;
    if (s.bot.clockMax > 248000) { await page.waitForTimeout(4000); break; }
  }
  await page.screenshot({ path: out + '/final.png' });
  report.diag = await page.evaluate(() => JSON.parse(JSON.stringify(gh3Diag)));
  report.diagText = await page.evaluate(() => gh3Diag.text());
  report.final = await page.evaluate(() => ({ bot: window.touchBot, presented: d4.songPresented, renderer: d4.songRenderer && { fatal: d4.songRenderer.fatal, conversion: d4.songRenderer.gpu?.conversion }, audio: d4.r6Audio, exit: d4.exit }));
  fs.writeFileSync(out + '/informe-diagnostico.txt', report.diagText);
  const b = report.final.bot;
  report.ok = !report.pageErrors.length && !report.privateNetwork.length && b.strums === chart.notes.length && b.clockMax > 247000 && report.diag.errors.length === 0 && report.awayAfter?.state === 'running';
} catch (e) { report.error = e.stack; report.ok = false; }
finally { await browser?.close(); server.close(); fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ label, ok: report.ok, strums: report.final?.bot?.strums, clockMaxS: report.final?.bot?.clockMax / 1000, stages: report.diag?.stages, wasmPeakMB: report.diag?.mem?.wasmPeak && Math.round(report.diag.mem.wasmPeak / 1048576), songUnderruns: report.diag?.audio?.songUnderruns, away: report.awayAfter, errors: report.diag?.errors, pageErrors: report.pageErrors.length, privateNet: report.privateNetwork.length, error: report.error }));
if (!report.ok) process.exitCode = 1;
