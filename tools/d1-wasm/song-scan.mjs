// Canción híbrida (Claude): busca en la memoria del GH3 wasm el reloj de la canción. Corre el build SIMD de R6
// en Edge oculto hasta Slow Ride (botones simulados). Desde que el juego abre <canción>_song.pak.xen, cada
// 20 s compara fotos de la memoria guest: quedan las palabras (float/entero/double BE) que avanzan igual que el
// reloj de pared Y valen poco (menos que el tiempo desde que se cargó la canción), o sea un reloj que arrancó
// en la partida. Solo lectura; no cambia el juego. Salida: artifacts/d1-wasm/song/<etiqueta>.json (local).
// Requiere: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/web-simd" node tools/d1-wasm/serve-d4.mjs 5395
// Uso: node tools/d1-wasm/song-scan.mjs <segundos> <etiqueta> [puerto=5395] [primer intento tras cargar=25]
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [seconds = 600, label = 'scan', port = 5395, firstAfter = 10] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/song'); await mkdir(out, { recursive: true });
let press = '150:start,175:start,196:a,204:a,208:start';
for (let t = 216; t <= +(process.env.SCAN_PRESS_END || 560); t += 8) press += `,${t}:a`;
const report = { label, seconds: +seconds, press, pageErrors: [], tries: [] };
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
        if (e.data?.type !== 'g1eInput' && e.data?.type !== 'g1Mem') return;
        window.g1mem = { sab: e.data.sab, seg: e.data.seg };
        if (window.g1memWait) { window.g1memWait(); window.g1memWait = null; }
      });
      return w;
    };
    // La memoria crece después del arranque: pedir la vista actual antes de leer.
    window.g1fresh = () => new Promise((r) => { window.g1memWait = r; window.g1worker.postMessage({ type: 'memReq' }); });
    // kind: 1 float s, 2 float ms, 4 entero ms, 8 double s (direcciones múltiplo de 8).
    const val = (dv, h, k) => (k === 8 ? dv.getFloat64(h, false) : k === 4 ? dv.getUint32(h, false) : dv.getFloat32(h, false));
    const scale = (k) => (k === 2 || k === 4 ? 1000 : 1);
    window.songScan = {
      host(g) { const t = new Uint32Array(window.g1mem.sab, window.g1mem.seg, 256); return (t[g >>> 24] + g) >>> 0; },
      first() {
        // Rápido: compara los bits BE como enteros (los float positivos ordenan igual que sus bits).
        // 1 = float s en [0,05; 120], 2 = float ms en [50; 120000], 4 = entero ms en [50; 120000].
        const { sab, seg } = window.g1mem, t = new Uint32Array(sab, seg, 256), u = new Uint32Array(sab);
        const ranges = [[0x00, 0x40], [0x40, 0x7F], [0x80, 0x90], [0xA0, 0xC0]];
        const pos = new Uint32Array(120 << 20), kind = new Uint8Array(120 << 20); let n = 0, over = 0;
        for (const [a, b] of ranges) for (let s = a; s < b; s++) {
          const w0 = ((t[s] + s * 0x1000000) >>> 0) >>> 2, base = s * 0x1000000;
          for (let i = 0; i < 0x400000; i++) {
            const x = u[w0 + i]; if (x === 0) continue;
            const v = ((x << 24) | ((x & 0xFF00) << 8) | ((x >>> 8) & 0xFF00) | (x >>> 24)) >>> 0;
            let k = 0;
            if (v >= 0x3D4CCCCD && v <= 0x42F00000) k = 1; else if (v >= 0x42480000 && v <= 0x47EA6000) k = 2;
            if (v >= 50 && v <= 120000) k = 4;
            if (!k) continue;
            if (n >= pos.length) { over++; continue; }
            pos[n] = (base + i * 4) >>> 0; kind[n++] = k;
          }
        }
        this.pos = pos.slice(0, n); this.kind = kind.slice(0, n); this.vals = this.read(); this.t = performance.now();
        return { n, over, bytes: sab.byteLength };
      },
      read() {
        const dv = new DataView(window.g1mem.sab), v = new Float64Array(this.pos.length);
        for (let j = 0; j < this.pos.length; j++) v[j] = val(dv, this.host(this.pos[j]), this.kind[j]);
        return v;
      },
      step() {
        const now = performance.now(), dt = (now - this.t) / 1000, nv = this.read(), keep = [];
        for (let j = 0; j < this.pos.length; j++) { const d = (nv[j] - this.vals[j]) / scale(this.kind[j]); if (d > 0.75 * dt && d < 1.25 * dt) keep.push(j); }
        this.pos = Uint32Array.from(keep, (j) => this.pos[j]); this.kind = Uint8Array.from(keep, (j) => this.kind[j]); this.vals = Float64Array.from(keep, (j) => nv[j]); this.t = now;
        return { n: this.pos.length, dt };
      },
      // Solo los que valen menos que maxS segundos (reloj que arrancó hace poco).
      small(maxS) {
        const keep = []; for (let j = 0; j < this.pos.length; j++) if (this.vals[j] / scale(this.kind[j]) < maxS) keep.push(j);
        this.pos = Uint32Array.from(keep, (j) => this.pos[j]); this.kind = Uint8Array.from(keep, (j) => this.kind[j]); this.vals = Float64Array.from(keep, (j) => this.vals[j]);
        return this.pos.length;
      },
      list() { return [...this.pos].map((g, j) => ({ addr: '0x' + g.toString(16).toUpperCase(), kind: this.kind[j], s: this.vals[j] / scale(this.kind[j]) })); },
      series() { const v = this.read(); return [...this.pos].map((_, j) => v[j] / scale(this.kind[j])); },
    };
  });
  const q = new URLSearchParams({ waitmulti: 'event', cpwait: 'event', audio: 'silent', xma: 'decode', press });
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  await page.setInputFiles('#dir', 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
  await page.fill('#secs', String(seconds)); await page.selectOption('#gpu', 'null'); await page.click('#go');
  const t0 = Date.now(), el = () => (Date.now() - t0) / 1000, exited = () => page.evaluate(() => window.d4.exit !== null);
  let songAt = null;
  while (songAt === null && el() < +seconds) {
    await page.waitForTimeout(2000);
    if (await page.evaluate(() => window.d4.log.some((l) => /_song\.pak\.xen/.test(l)))) songAt = el();
    if (await exited()) break;
  }
  report.songPakAtWall = songAt; console.log(`canción cargada a ${songAt?.toFixed(0)} s`);
  if (songAt !== null) {
    await page.waitForTimeout(+firstAfter * 1000);
    while (el() < +seconds - 60 && !(await exited())) {
      const a = await page.evaluate(async () => { await window.g1fresh(); return window.songScan.first(); });
      const steps = [];
      for (let k = 0; k < 3; k++) { await page.waitForTimeout(1500); steps.push(await page.evaluate(async () => { await window.g1fresh(); return window.songScan.step(); })); }
      const sinceSong = el() - songAt, small = await page.evaluate((m) => window.songScan.small(m), sinceSong + 5);
      const tr = { wall: el(), sinceSong, a, steps, small, list: await page.evaluate(() => window.songScan.list().slice(0, 50)) };
      report.tries.push(tr); console.log('intento', JSON.stringify({ wall: tr.wall.toFixed(0), n: a.n, over: a.over, steps: steps.map((s) => s.n), small }));
      if (small > 0) {
        report.series = [];
        for (let k = 0; k < 60; k++) { await page.waitForTimeout(500); report.series.push({ wall: el(), v: await page.evaluate(() => window.songScan.series()) }); }
        report.candidates = await page.evaluate(() => window.songScan.list());
        break;
      }
      await page.waitForTimeout(+(process.env.SCAN_GAP || 4000));
    }
  }
  report.log = await page.evaluate(() => window.d4.log.filter((l) => /g1-file|\[g1e\] press/.test(l)).map((l) => l.slice(0, 200)));
} finally { await browser.close(); }
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ songPakAtWall: report.songPakAtWall, candidates: report.candidates?.length || 0, pageErrors: report.pageErrors.length }));
