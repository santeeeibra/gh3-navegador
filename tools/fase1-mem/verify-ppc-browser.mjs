// Abre artifacts/fase1-mem/ppc.html en Edge headless sin red y toca los cinco botones.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const ev = { source: 'artifacts/fase1-mem/ppc.html', browser: browser.version(), results: [], pageErrors: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => ev.pageErrors.push(e.message));
  await page.route(/^https?:/, r => r.abort());
  await page.goto(pathToFileURL('D:/guitar hero/artifacts/fase1-mem/ppc.html').href);
  for (const [v, bits] of [['tr', 32], ['tr', 64], ['flat', 32], ['flat', 64], ['roto', 32]]) {
    await page.click(`button[data-v="${v}"][data-bits="${bits}"]`);
    await page.waitForFunction(([v, b]) => window.__last && window.__last.v === v && window.__last.bits === b, [v, bits], { timeout: 120000 });
    const r = await page.evaluate(() => window.__last);
    ev.results.push({ variant: v, bits, pass: r.pass, fail: r.fail, ms: r.ms, firstFails: r.lines.filter(l => l.startsWith('FAIL')).slice(0, 5) });
    console.log(`${v} wasm${bits}: pass=${r.pass} fail=${r.fail} ms=${r.ms}`);
  }
  await page.click('button[data-v="tr"][data-bits="32"]');
  await page.waitForFunction(() => window.__last.v === 'tr' && window.__last.bits === 32);
  await page.screenshot({ path: 'artifacts/fase1-mem/shot-ppc.png', fullPage: true });
  ev.ok = !ev.pageErrors.length && ev.results.every(r => r.variant === 'roto' ? r.fail > 0 : r.pass === 1458 && r.fail === 0);
  ev.verifiedAt = new Date().toISOString();
  await writeFile('artifacts/fase1-mem/ppc-browser-verification.json', JSON.stringify(ev, null, 2));
  console.log('browser', ev.browser, 'pageErrors', ev.pageErrors.length, ev.ok ? 'OK' : 'ERROR');
  process.exitCode = ev.ok ? 0 : 1;
} finally { await browser.close(); }
