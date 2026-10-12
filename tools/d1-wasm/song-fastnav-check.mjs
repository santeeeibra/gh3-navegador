// Canción híbrida (Claude): prueba los botones "Saltear intro" / "Ir directo a tocar" de la página jugable en Edge
// oculto. Mide cuándo arranca el reloj de la canción y qué canción cargó.
// Requiere: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/song" node tools/d1-wasm/serve-d4.mjs 5394
// Uso: node tools/d1-wasm/song-fastnav-check.mjs <goSong|skipIntro> <etiqueta> [segundos=330] [puerto=5394]
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [button = 'goSong', label = 'fastnav', seconds = 330, port = 5394] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/song'); await mkdir(out, { recursive: true });
const report = { button, label, pageErrors: [], samples: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1300 } });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForURL(/song=1/);
  await page.setInputFiles('#dir', 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
  await page.selectOption('#gpu', 'null'); await page.click('#go'); const t0 = Date.now();
  await page.waitForTimeout(1000); await page.click('#' + button);
  while ((Date.now() - t0) / 1000 < +seconds) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({ c: window.gh3Song.clock ? window.gh3Song.clock() : null, nav: document.getElementById('navStat').textContent, song: window.songPak || null, seen: window.navSeen, exit: window.d4.exit }));
    report.samples.push({ t: +((Date.now() - t0) / 1000).toFixed(1), ...s });
    if (s.c && s.c !== 0 && report.songAt === undefined) { report.songAt = (Date.now() - t0) / 1000; console.log('canción a', report.songAt.toFixed(0), 's', s.song); }
    if (report.songAt !== undefined && (Date.now() - t0) / 1000 > report.songAt + 25) { report.clockAfter25s = s.c; break; }
    if (s.exit !== null) break;
  }
  await page.screenshot({ path: resolve(out, `${label}.png`) });
  report.presses = await page.evaluate(() => window.d4.log.filter((l) => /\[g1e\]|\[c1\] t=|gh\.png|GH3_Intro|_song\.pak|bik/.test(l)).map((l) => l.slice(0, 160)));
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ clockAfter25s: report.clockAfter25s, songAt: report.songAt, song: report.samples.at(-1)?.song, nav: report.samples.at(-1)?.nav, pageErrors: report.pageErrors.length }));
