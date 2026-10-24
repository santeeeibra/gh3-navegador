// C1 (Claude): verificación OCULTA (Edge headless) de los controles de la demo artifacts/d1-wasm/r6/demo.
// Uso: node tools/d1-wasm/c1-verify-input.mjs <segundos> <etiqueta> <modo> [puerto=5393]
//   modo "press": control de diagnóstico, calendario ?press=150:start,175:start (como G1e).
//   modo "live":  SIN calendario. Teclado simulado (Enter) a los 150 s y mando simulado (Gamepad API falsa,
//                 botón 9 = Options/START) a los 175 s; al final, prueba de botones mantenidos y palancas.
// Requiere: D4_ROOT=artifacts/d1-wasm/r6/demo node tools/d1-wasm/serve-d4.mjs 5393
// No toma el foco del escritorio: el teclado y el mando se simulan dentro del navegador oculto.
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [seconds = 230, label = 'c1', mode = 'live', port = 5393] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/c1'); await mkdir(out, { recursive: true });
const report = { label, mode, seconds: +seconds, pageErrors: [], actions: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let log = [];
try {
  const page = await browser.newPage();
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  // Mando falso con mapeo estándar (como un DualShock 4 en Edge). window.__pad.set(i, v) / .axis(i, v).
  await page.addInitScript(() => {
    const pad = { id: 'C1 mando simulado (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
    window.__pad = { on: false,
      set(i, v) { this.on = true; pad.buttons[i] = { pressed: v > 0.5, touched: v > 0, value: v }; pad.timestamp = performance.now(); },
      axis(i, v) { this.on = true; pad.axes[i] = v; pad.timestamp = performance.now(); } };
    navigator.getGamepads = () => [window.__pad.on ? pad : null, null, null, null];
  });
  const base = { cpasync: '1', cpwait: 'event', r3acheck: '1', r5snap: '1', r5consumer: 'r5snap-codex.js', audio: 'silent', xma: 'decode', waitmulti: 'event', audiotap: '1' };
  if (mode === 'press') base.press = '150:start,175:start';
  await page.goto(`http://127.0.0.1:${port}/?${new URLSearchParams(base)}`);
  await page.setInputFiles('#dir', 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
  await page.fill('#secs', String(seconds)); await page.selectOption('#gpu', 'null'); await page.click('#go');
  await page.evaluate(() => document.activeElement?.blur());
  const t0 = Date.now(), el = () => (Date.now() - t0) / 1000;
  const act = async (what, fn) => { report.actions.push({ t: +el().toFixed(2), what }); await fn(); };
  const plan = mode === 'live' ? [
    [150, 'teclado Enter (START)', async () => { await page.keyboard.down('Enter'); await page.waitForTimeout(300); await page.keyboard.up('Enter'); }],
    [175, 'mando botón 9 Options (START)', async () => { await page.evaluate(() => window.__pad.set(9, 1)); await page.waitForTimeout(300); await page.evaluate(() => window.__pad.set(9, 0)); }],
    [200, 'teclado 1+2 mantenidos 1 s, flecha abajo', async () => { await page.keyboard.down('Digit1'); await page.keyboard.down('Digit2'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(1000); await page.keyboard.up('Digit1'); await page.keyboard.up('Digit2'); }],
    [203, 'mando L1 + gatillo R2 0.5 + palanca derecha', async () => { await page.evaluate(() => { window.__pad.set(4, 1); window.__pad.set(7, 0.5); window.__pad.axis(2, 1); window.__pad.axis(3, -1); }); await page.waitForTimeout(500); await page.evaluate(() => { window.__pad.set(4, 0); window.__pad.set(7, 0); window.__pad.axis(2, 0); window.__pad.axis(3, 0); }); }],
    [206, 'toques muy cortos: 3 y Espacio (sin espera)', async () => { await page.keyboard.press('Digit3'); await page.keyboard.press('Space'); }],
  ] : [];
  while (true) {
    while (plan.length && el() >= plan[0][0]) { const [, w, f] = plan.shift(); await act(w, f); }
    await page.waitForTimeout(250);
    const exit = await page.evaluate(() => window.d4.exit);
    if (exit !== null || el() > +seconds + 200) { report.exit = exit; break; }
  }
  await page.waitForTimeout(1000);
  log = await page.evaluate(() => window.d4.log);
  report.input = await page.evaluate(() => ({ ...window.gh3Input?.stats, attached: window.gh3Input?.attached, panel: document.getElementById('c1Input')?.textContent }));
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.log`), log.join('\n'));
// Firma de menú (G1e): archivos que abre cada START, en orden.
const sig = ['memcard\\gh.png', 'SAVE:\\toc.dat', 'zones\\z_soundcheck.pak', 'movies\\bik\\GH3_Intro.bik'];
const files = log.map((l, i) => [i, l]).filter(([, l]) => l.includes('[g1-file]')).map(([i, l]) => ({ i, path: (l.match(/path=(\S+)/) || [])[1] }));
report.signature = sig.map((s) => { const f = files.filter((x) => x.path?.includes(s)); return { file: s, count: f.length, lines: f.map((x) => x.i) }; });
report.c1 = log.filter((l) => l.includes('[c1]') || l.includes('[g1e] press'));
const lat = report.c1.map((l) => +(l.match(/lat_ms=(-?[\d.]+)/) || [])[1]).filter((v) => v >= 0);
report.latencyMs = lat.length ? { n: lat.length, max: Math.max(...lat), avg: +(lat.reduce((a, b) => a + b, 0) / lat.length).toFixed(1) } : null;
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ exit: report.exit, pageErrors: report.pageErrors.length, actions: report.actions.length, signature: report.signature.map((s) => s.file + ':' + s.count), c1: report.c1.length, latencyMs: report.latencyMs }));
