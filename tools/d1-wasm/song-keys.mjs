// Canción híbrida (Claude): prueba del camino HUMANO en la página jugable (artifacts/d1-wasm/r6/song). Desde Node se
// mandan eventos de teclado reales a la página (A S D F G = trastes, flecha abajo = rasgueo), guiados por el reloj
// que la propia página lee (gh3Song.clock + desfase de la página). La página los traduce al esquema de GH3 (modo
// canción de gh3-input.js) y el GH3 original juzga. Saca capturas de la autopista. Edge oculto.
// Requiere: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/song" node tools/d1-wasm/serve-d4.mjs 5394
// Uso: node tools/d1-wasm/song-keys.mjs <segundos> <etiqueta> [puerto=5394]
import { chromium } from 'playwright';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import vm from 'node:vm';
const [seconds = 600, label = 'keys', port = 5394] = process.argv.slice(2);
const GAME = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/song'); await mkdir(out, { recursive: true });
const ctx = { window: {} }; vm.runInNewContext(await readFile(resolve(import.meta.dirname, 'gh3-song.js'), 'utf8'), ctx);
const notes = ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(await readFile(`${GAME}/DATA/COMPRESSED/SONGS/slowride_song.pak.xen`))), 'slowride', 'medium').notes;
const KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG'];
const report = { label, notes: notes.length, pageErrors: [], shots: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1500 } });
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/`);  // la página se recarga sola con sus parámetros (song=1, botones de navegación)
  await page.waitForURL(/song=1/);
  await page.setInputFiles('#dir', GAME);
  await page.selectOption('#gpu', 'null'); await page.click('#go');
  const t0 = Date.now(), el = () => (Date.now() - t0) / 1000;
  const held = new Set(); let i = 0, strumUp = 0, max = -1e9, strums = 0;
  const setFrets = async (mask) => {
    for (let k = 0; k < 5; k++) { const on = !!(mask & (1 << k)); if (on !== held.has(k)) { on ? await page.keyboard.down(KEYS[k]) : await page.keyboard.up(KEYS[k]); on ? held.add(k) : held.delete(k); } }
  };
  // El reloj se consulta en segundo plano cada ~100 ms y se extrapola con la hora de Node (avanza 1:1), así las
  // teclas no esperan a cada consulta.
  let sample = null, pending = null, exit = null;
  const poll = () => { pending = page.evaluate(() => ({ c: window.gh3Song.clock ? window.gh3Song.clock() : NaN, off: window.gh3Song.offsetMs, song: !!(window.gh3Input?.songMode?.()), chart: window.gh3Song.chart?.name || null, exit: window.d4.exit }))
    .then((s) => { exit = s.exit; if (!sample || s.c !== sample.c) sample = { ...s, at: Date.now() }; else sample.stale = Date.now(); }).finally(() => { pending = null; }); };
  while (el() < +seconds && exit === null) {
    if (!pending) poll();
    await new Promise((r) => setTimeout(r, 2));
    if (!sample || !Number.isFinite(sample.c) || sample.c === 0) continue;
    const pn = Date.now();
    if (sample.stale && sample.stale - sample.at > 4000 && max > 5000) break;  // se congeló: perdió o terminó
    const c = sample.c + Math.min(pn - sample.at, 400);
    if (c > max) max = c;
    const now = c + sample.off;
    for (const at of [20000, 60000, 120000, 200000]) if (now >= at && !report.shots.some((x) => x.at === at)) {
      const file = `${label}-hw-${at / 1000}s.png`; page.locator('#hw').screenshot({ path: resolve(out, file) }).catch(() => {}); report.shots.push({ at, file, chart: sample.chart, songMode: sample.song });
    }
    while (i < notes.length && notes[i].t < now - 150) i++;
    if (i < notes.length) {
      const n = notes[i];
      if (now >= n.t - 70) await setFrets(n.mask & 31);
      if (now >= n.t) { await page.keyboard.down('ArrowDown'); strumUp = pn + 30; strums++; i++; }
    }
    if (strumUp && pn >= strumUp) { await page.keyboard.up('ArrowDown'); strumUp = 0; }
  }
  await setFrets(0);
  report.clockMaxS = +(max / 1000).toFixed(1); report.strums = strums; report.wall = el();
  report.input = await page.evaluate(() => window.gh3Input?.stats);
  await page.screenshot({ path: resolve(out, `${label}-page.png`), fullPage: false });
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ clockMaxS: report.clockMaxS, strums: report.strums, shots: report.shots.length, pageErrors: report.pageErrors.length }));
