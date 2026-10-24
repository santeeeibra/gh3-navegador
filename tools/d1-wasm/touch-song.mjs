// Prueba GH3 + controles táctiles (Claude). Edge oculto con pantalla táctil emulada sobre la copia aislada
// artifacts/d1-wasm/touch/game (= notesfix/robot + gh3-touch.js + gh3-input.js con setTouch). Un robot en la página
// toca Slow Ride Medium SOLO mediante eventos de puntero táctiles sobre los botones de gh3-touch.js (trastes,
// acordes, notas sostenidas, rasgueo); no escribe la memoria del mando. GH3 juzga: sin aciertos pierde a los ~30 s.
// Requiere turno: GPUCAP_TURN=<token> node tools/d1-wasm/touch-song.mjs <etiqueta> [segundos=330] [puerto=5451]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import vm from 'node:vm';
import { inflateRawSync } from 'node:zlib';
import { chromium } from 'playwright';
import { requireTurn } from '../gpu-capture/lib.mjs';
requireTurn();
const [label = 'song-1', duration = 330, port = 5451] = process.argv.slice(2);
const out = path.resolve('artifacts/d1-wasm/touch/runs', label); if (fs.existsSync(out)) throw Error('Run exists'); fs.mkdirSync(out, { recursive: true });
const game = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock', ctx = { window: {} };
vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js', 'utf8'), ctx);
const chart = ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(fs.readFileSync(game + '/DATA/COMPRESSED/SONGS/slowride_song.pak.xen'))), 'slowride', 'medium');
const ROOT = path.resolve('artifacts/d1-wasm/touch/game'), TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let name = new URL(req.url, 'http://x').pathname.slice(1) || 'index.html';
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  const file = path.join(ROOT, name);
  if (!/^[\w.-]+$/.test(name) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
}).listen(+port, '127.0.0.1');
const report = { label, notes: chart.notes.length, pageErrors: [], samples: [], started: new Date().toISOString() };
let browser;
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true }); report.browser = browser.version();
  const bctx = await browser.newContext({ viewport: { width: 1400, height: 1150 }, hasTouch: true });
  const page = await bctx.newPage(); page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.goto(`http://127.0.0.1:${port}/?song=1&manual=1&cpwait=event&waitmulti=event&audio=silent&xma=decode&audiotap=1&r5live=1&cpasync=1&r5lite=1&r5liveconsumer=r5snap-song-render.js&touch=1`);
  await page.waitForURL(/touch=1/);
  await page.setInputFiles('#dir', game); await page.fill('#secs', String(+duration + 30)); await page.selectOption('#gpu', 'null'); await page.evaluate(() => document.getElementById('go').click());
  // Robot táctil: 70 ms antes de cada nota apoya los dedos de su acorde (los mantiene hasta la próxima: sostenidas),
  // y en el tiempo de la nota toca la zona de rasgueo con otro dedo. Reloj de la canción + adelanto -350 ms (song-bot).
  await page.evaluate((notes) => {
    const LEAD = -350, z = (s) => document.querySelector('#gh3Touch ' + s), fz = [0, 1, 2, 3, 4].map((i) => z('.f' + i));
    const ev = (type, el, id) => { const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: false, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 })); };
    const st = window.touchBot = { strums: 0, chords: 0, clockMax: -1e9, frozenAt: null, maxFingers: 0 };
    let i = 0, held = 0, nextId = 100, prev = null;
    const setFrets = (mask) => { for (let k = 0; k < 5; k++) { const b = 1 << k; if ((mask & b) && !(held & b)) ev('pointerdown', fz[k], 10 + k); if (!(mask & b) && (held & b)) ev('pointerup', fz[k], 10 + k); } held = mask; };
    setInterval(() => {
      const raw = window.gh3Song?.clock?.();
      if (!Number.isFinite(raw) || raw === 0 || !window.gh3Input?.songMode?.()) return;
      if (raw > st.clockMax) st.clockMax = raw;
      if (prev !== null && raw === prev) st.frozenAt ??= raw; else st.frozenAt = null; prev = raw;
      const now = raw + LEAD;
      while (i < notes.length && notes[i].t < now - 150) i++;
      if (i >= notes.length) { setFrets(0); return; }
      const n = notes[i];
      if (now >= n.t - 70) setFrets(n.mask & 31);
      if (now >= n.t) {
        const id = nextId++, s = z('.strum'); ev('pointerdown', s, id); setTimeout(() => ev('pointerup', s, id), 20);
        st.strums++; if ((n.mask & 31) & ((n.mask & 31) - 1)) st.chords++;
        st.maxFingers = Math.max(st.maxFingers, gh3Touch.stats.maxPointers); i++;
      }
    }, 1);
  }, chart.notes);
  await page.waitForSelector('#goSong:not([disabled])', { timeout: 120000 }); await page.evaluate(() => document.getElementById('goSong').click());
  const start = Date.now();
  while ((Date.now() - start) / 1000 < +duration) {
    await page.waitForTimeout(2000);
    const s = await page.evaluate(() => ({ clockMs: window.gh3Song.clock?.(), song: window.songPak, exit: d4.exit, bot: { ...window.touchBot }, touch: { ...gh3Touch.stats, releases: { ...gh3Touch.stats.releases } }, src: gh3Input.stats.source }));
    report.samples.push({ wallS: (Date.now() - start) / 1000, ...s }); fs.writeFileSync(out + '/progress.json', JSON.stringify(s));
    if (s.exit !== null) break;
    if (s.bot.clockMax > 248000) { await page.waitForTimeout(4000); break; }  // última nota 247,47 s
  }
  report.final = await page.evaluate(() => ({ exit: d4.exit, bot: window.touchBot, touch: gh3Touch.stats, songs: d4.log.filter((l) => /_song\.pak\.xen/.test(l)).slice(-3), c1: d4.log.filter((l) => /\[c1\]/.test(l)).length, log: d4.log }));
  fs.writeFileSync(out + '/runtime.log', report.final.log.join('\n')); delete report.final.log;
  const b = report.final.bot;
  // Completó = el reloj llegó al final sin congelarse (al perder se congela) y tocó las 477 notas.
  report.ok = !report.pageErrors.length && b.strums === chart.notes.length && b.clockMax > 247000;
} catch (e) { report.error = e.stack; report.ok = false; }
finally { await browser?.close(); server.close(); fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ label, ok: report.ok, strums: report.final?.bot?.strums, chords: report.final?.bot?.chords, clockMaxS: report.final?.bot?.clockMax / 1000, frozenAt: report.final?.bot?.frozenAt, songs: report.final?.songs, errors: report.pageErrors.length, error: report.error }));
if (!report.ok) process.exitCode = 1;
