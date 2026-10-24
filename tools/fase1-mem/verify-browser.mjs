// Abre artifacts/fase1-mem/index.html en Edge headless sin red y toca cada botón.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const page_url = pathToFileURL('D:/guitar hero/artifacts/fase1-mem/index.html').href;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const evidence = { source: 'artifacts/fase1-mem/index.html', browser: browser.version(), results: [], pageErrors: [] };
try {
  const page = await browser.newPage();
  page.on('pageerror', e => evidence.pageErrors.push(e.message));
  await page.route(/^https?:/, r => r.abort());
  await page.goto(page_url);
  for (const [bits, mode] of [[32, 0], [64, 0], [32, 1], [32, 2]]) {
    await page.click(`button[data-bits="${bits}"][data-mode="${mode}"]`);
    await page.waitForFunction(([b, m]) => window.__last && window.__last.bits === b && window.__last.mode === m, [bits, mode]);
    const r = await page.evaluate(() => window.__last);
    evidence.results.push({ bits, mode, pass: r.pass, fail: r.fail, summary: r.lines.filter(l => !l.startsWith('PASS')) });
  }
  await page.click('button[data-bits="32"][data-mode="0"]');
  await page.waitForFunction(() => window.__last.mode === 0 && window.__last.bits === 32);
  await page.screenshot({ path: 'artifacts/fase1-mem/shot.png', fullPage: true });
  const ok = evidence.results.every(r => (r.mode === 0 ? r.fail === 0 && r.pass === 30 : r.fail > 0)) && !evidence.pageErrors.length;
  evidence.ok = ok;
  evidence.verifiedAt = new Date().toISOString();
  await writeFile('artifacts/fase1-mem/browser-verification.json', JSON.stringify(evidence, null, 2));
  for (const r of evidence.results) console.log(`wasm${r.bits} modo ${r.mode}: pass=${r.pass} fail=${r.fail}`);
  console.log('browser', evidence.browser, 'pageErrors', evidence.pageErrors.length, ok ? 'OK' : 'ERROR');
  process.exitCode = ok ? 0 : 1;
} finally { await browser.close(); }
