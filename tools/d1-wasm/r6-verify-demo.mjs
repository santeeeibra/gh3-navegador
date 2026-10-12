// R6 (Claude): verificación headless de la demo imagen + sonido (artifacts/d1-wasm/r6/demo).
// Uso: node tools/d1-wasm/r6-verify-demo.mjs <segundos> <etiqueta> [puerto=5393]
// Requiere el servidor: D4_ROOT=artifacts/d1-wasm/r6/demo node tools/d1-wasm/serve-d4.mjs 5393
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [seconds = 230, label = 'demo', port = 5393] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/r6/demo-runs'); await mkdir(out, { recursive: true });
const report = { label, seconds: +seconds, pageErrors: [], samples: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: process.env.R6_NOAUTOPLAY ? [] : ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  const q = new URLSearchParams({ cpasync: '1', cpwait: 'event', r3acheck: '1', r5snap: '1', r5consumer: 'r5snap-codex.js', press: '150:start,175:start', audio: 'silent', xma: 'decode', waitmulti: 'event', audiotap: '1' });
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  await page.setInputFiles('#dir', 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
  await page.fill('#secs', String(seconds)); await page.selectOption('#gpu', 'null'); await page.click('#go');
  const t0 = Date.now(); let lastFrames = 0;
  while (true) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({ exit: window.d4.exit, frames: window.d4.r5Frames || 0, audio: window.d4.r6Audio || null, fatal: window.d4.r5Live?.fatal || null }));
    const t = (Date.now() - t0) / 1000; report.samples.push({ t, frames: s.frames, audio: s.audio });
    if (s.frames > lastFrames) { lastFrames = s.frames; await page.locator('#r5Canvas').screenshot({ path: resolve(out, `${label}-frame-${s.frames}.png`) }); }
    if (s.exit !== null || s.fatal || t > +seconds + 200) { report.exit = s.exit; report.fatal = s.fatal; break; }
  }
  report.final = await page.evaluate(() => ({ r5Frames: window.d4.r5Frames || 0, r5Live: window.d4.r5Live, r6Audio: window.d4.r6Audio, logTail: (document.getElementById('log')?.textContent || '').slice(-60000) }));
  await page.screenshot({ path: resolve(out, `${label}-page.png`), fullPage: true });
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
const a = report.final?.r6Audio;
console.log(JSON.stringify({ exit: report.exit, r5Frames: report.final?.r5Frames, audioSeconds: a ? +(a.played / 48000).toFixed(1) : 0, underruns: a?.underruns, ctx: a?.ctxState, pageErrors: report.pageErrors.length }));
