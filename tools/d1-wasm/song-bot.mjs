// Canción híbrida (Claude): prueba de punta a punta. Un "robot" en la página toca las notas reales de la canción
// (leídas del .pak.xen) guiado por el reloj de la canción que el juego guarda en memoria, escribiendo el mando en
// vivo (mismo camino que teclado/mando, C1). El GH3 original juzga. Si el reloj o los botones están mal, el juego
// hace perder la canción a los ~30 s (como sin tocar); si están bien, la canción sigue.
// Requiere: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/web-simd" (o r6/song) node tools/d1-wasm/serve-d4.mjs <puerto>
// Uso: node tools/d1-wasm/song-bot.mjs <segundos> <etiqueta> <dir reloj hex> [kind f|ms] [adelanto ms=0] [puerto=5395]
import { chromium } from 'playwright';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import vm from 'node:vm';
const [seconds = 560, label = 'bot', clockAddr = '0x82CBD00C', kind = 'f', leadMs = 0, port = 5395] = process.argv.slice(2);
const GAME = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/song'); await mkdir(out, { recursive: true });
const ctx = { window: {} }; vm.runInNewContext(await readFile(resolve(import.meta.dirname, 'gh3-song.js'), 'utf8'), ctx);
const chart = ctx.window.gh3Song.parseSongPak(new Uint8Array(inflateRawSync(await readFile(`${GAME}/DATA/COMPRESSED/SONGS/slowride_song.pak.xen`))), 'slowride', process.env.BOT_DIFF || 'medium');
let press = '150:start,175:start,196:a,204:a,208:start';
for (let t = 216; t <= +(process.env.BOT_PRESS_END || 264); t += 8) press += `,${t}:a`;
const report = { label, seconds: +seconds, clockAddr, kind, leadMs: +leadMs, notes: chart.notes.length, press, pageErrors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage();
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.addInitScript(() => {
    const W = window.Worker;
    window.Worker = function (...a) {
      const w = new W(...a); window.g1worker = w;
      w.addEventListener('message', (e) => {
        if (e.data?.type === 'g1eInput') window.g1live = { sab: e.data.sab, ptr: e.data.ptr };
        if (e.data?.type === 'g1eInput' || e.data?.type === 'g1Mem') window.g1mem = { sab: e.data.sab, seg: e.data.seg };
      });
      setInterval(() => w.postMessage({ type: 'memReq' }), 2000);
      return w;
    };
  });
  // BOT_PADTYPE=guitar presenta el mando como guitarra XInput (sub_type 0x06); la página de la canción reenvía padtype.
  const q = new URLSearchParams({ song: '1', waitmulti: 'event', cpwait: 'event', audio: 'silent', xma: 'decode', press });
  if (process.env.BOT_PADTYPE) q.set('padtype', process.env.BOT_PADTYPE);
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  await page.setInputFiles('#dir', GAME);
  await page.fill('#secs', String(seconds)); await page.selectOption('#gpu', 'null'); await page.click('#go');
  // Robot en un Worker propio (los temporizadores de la página se frenan en Edge oculto): mantiene los trastes de
  // la nota desde 70 ms antes y rasguea (cruceta abajo) en el tiempo de la nota, leyendo el reloj cada ~1 ms.
  await page.evaluate(({ notes, addr, kind, lead, leads, strums }) => {
    const src = `
      // Esquema GH3 con mando común (comprobado con imagen en el nativo): verde LT, rojo LB, amarillo RB, azul RT, naranja A.
      const FRET = [0, 0x0100, 0x0200, 0, 0x1000]; let DOWN = 0x0002;  // DOWN = botón de rasgueo del intento (0 = sin rasgueo: el traste se aprieta en el tiempo de la nota)
      let M = null, L = null, armed = false, notes = [], addr = 0, kind = 'ms', lead = 0;
      const st = { strums: 0, clockMax: -1e9, resets: 0, loops: 0, attempts: [] };
      // Barrido: cada reintento usa el siguiente adelanto (ms). Al perder, aprieta A (Reintentar) cada 3 s.
      const LEADS = (self.LEADS || [0]); let att = 0, frozenSince = 0, nextA = 0, aUntil = 0;
      onmessage = (e) => { const d = e.data;
        if (d.type === 'init') { ({ notes, addr, kind, lead } = d); self.LEADS = d.leads; self.STRUMS = d.strums; lead = d.leads[0]; DOWN = d.strums[0]; st.attempts.push({ lead, strum: DOWN, max: -1e9, strums: 0 }); }
        if (d.type === 'mem') M = { sab: d.sab, seg: d.seg };
        if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
        if (d.type === 'arm') armed = true;
        if (d.type === 'stats') postMessage({ type: 'stats', st, now: clock() });
      };
      const clock = () => { if (!M) return NaN; const t = new Uint32Array(M.sab, M.seg, 256), h = (t[addr >>> 24] + addr) >>> 0;
        if (h + 4 > M.sab.byteLength) return NaN; const v = new DataView(M.sab).getFloat32(h, false); return kind === 'f' ? v * 1000 : v; };
      const nap = new Int32Array(new SharedArrayBuffer(4));
      let i = 0, frets = 0, strumUntil = 0, prev = null, last = -1;
      (function loop() {
        for (;;) {
          Atomics.wait(nap, 0, 0, 1); st.loops++;
          if (!armed || !L) { if (st.loops % 50 === 0) { setTimeout(loop, 0); return; } continue; }
          const raw = clock(); if (!Number.isFinite(raw)) continue;
          const pnow = performance.now();
          if (prev !== null && raw < prev - 1000) { st.resets++; i = 0; frets = 0; att++; lead = self.LEADS[att % self.LEADS.length]; DOWN = self.STRUMS[att % self.STRUMS.length]; st.attempts.push({ lead, strum: DOWN, max: -1e9, strums: 0 }); }
          if (prev === null || raw !== prev) frozenSince = pnow;
          prev = raw; if (raw > st.clockMax) st.clockMax = raw; const A = st.attempts[st.attempts.length - 1]; if (raw > A.max) A.max = raw;
          if (raw > 5000 && pnow - frozenSince > 2500 && pnow > nextA) { nextA = pnow + 3000; aUntil = pnow + 150; Atomics.or(L, 10, 0x1000); }
          if (pnow < aUntil) { Atomics.store(L, 2, 0); Atomics.store(L, 1, 0x1000); Atomics.add(L, 0, 1); last = 0x1000; continue; }
          const now = raw + lead;
          while (i < notes.length && notes[i].t < now - 150) i++;
          let tap = 0;
          if (i < notes.length) { const n = notes[i];
            if (DOWN && now >= n.t - 70) frets = n.mask & 31;
            if (!DOWN && now >= n.t - 90 && now < n.t) frets = 0;  // sin rasgueo: soltar justo antes para volver a apretar
            if (now >= n.t) { if (!DOWN) frets = n.mask & 31; tap = DOWN; strumUntil = performance.now() + 30; st.strums++; A.strums++; i++; } }
          let b = 0; for (let k = 0; k < 5; k++) if (frets & (1 << k)) b |= FRET[k];
          const tr = (frets & 1 ? 255 : 0) | (frets & 8 ? 255 << 8 : 0);
          if (performance.now() < strumUntil) b |= DOWN;
          const key = b | (tr << 16);
          if (key !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, tr); Atomics.store(L, 1, b); Atomics.add(L, 0, 1); last = key; }
          if (st.loops % 200 === 0) { setTimeout(loop, 0); return; }  // deja entrar mensajes
        }
      })();`;
    const bw = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    bw.postMessage({ type: 'init', notes, addr, kind, lead, leads, strums });
    const st = window.botStats = { strums: 0, clockMax: -1e9, resets: 0, samples: [] };
    bw.onmessage = (e) => { Object.assign(st, e.data.st); st.samples.push([+(performance.now() / 1000).toFixed(2), +(e.data.now / 1000).toFixed(3), e.data.st.strums]); };
    let sentLive = false, armed = false;
    setInterval(() => {
      if (window.g1mem) bw.postMessage({ type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg });
      if (!sentLive && window.g1live) { bw.postMessage({ type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr }); sentLive = true; }
      if (!armed && window.d4.log.some((l) => /_song.pak.xen/.test(l))) { bw.postMessage({ type: 'arm' }); armed = true; }
      bw.postMessage({ type: 'stats' });
    }, 1000);
  }, { notes: chart.notes, addr: parseInt(clockAddr, 16), kind, lead: +leadMs, leads: String(process.env.BOT_LEADS || leadMs).split(',').map(Number), strums: String(process.env.BOT_STRUMS || '2').split(',').map(Number) });
  const t0 = Date.now();
  while (true) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({ exit: window.d4.exit, st: { strums: window.botStats.strums, clockMax: window.botStats.clockMax, resets: window.botStats.resets } }));
    if (s.exit !== null || (Date.now() - t0) / 1000 > +seconds + 60) { report.exit = s.exit; break; }
  }
  report.bot = await page.evaluate(() => window.botStats);
  report.log = await page.evaluate(() => window.d4.log.filter((l) => /g1-file|g1c-xma|\[c1\]/.test(l)).map((l) => l.slice(0, 200)));
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ attempts: report.bot?.attempts?.map((a) => [a.lead, a.strum, +(a.max / 1000).toFixed(1), a.strums]), exit: report.exit, strums: report.bot?.strums, clockMaxS: report.bot ? +(report.bot.clockMax / 1000).toFixed(1) : null, resets: report.bot?.resets, pageErrors: report.pageErrors.length }));
