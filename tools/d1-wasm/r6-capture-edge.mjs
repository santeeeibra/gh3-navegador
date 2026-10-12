// R6 (Claude): graba como WAV la cola de audio que recibe la página de la demo en Edge, para
// analizar la distorsión con las mismas herramientas que el WAV de Node. Usa la configuración completa de la demo (imagen R5 + sonido).
// Uso: [R6_PRESS="150:start,..."] node tools/d1-wasm/r6-capture-edge.mjs <segundos> <etiqueta> [puerto=5393]
// Requiere: D4_ROOT="D:/guitar hero/artifacts/d1-wasm/r6/demo" node tools/d1-wasm/serve-d4.mjs 5393
// Salida: artifacts/d1-wasm/r6/demo-runs/<etiqueta>.wav y .json (datos del juego: solo local).
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const [seconds = 120, label = 'cap', port = 5393] = process.argv.slice(2);
const out = resolve(import.meta.dirname, '../../artifacts/d1-wasm/r6/demo-runs'); await mkdir(out, { recursive: true });
const report = { label, seconds: +seconds, pageErrors: [] };
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
let pcm = null;
try {
  const page = await browser.newPage();
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  page.on('pageerror', (e) => report.pageErrors.push(e.message));
  // Envuelve window.r6StartAudio (la define la página después) para copiar la cola cada 100 ms.
  await page.addInitScript(() => {
    let inner;
    Object.defineProperty(window, 'r6StartAudio', { configurable: true, get: () => (sab, ptr) => {
      const w = new Uint32Array(sab, ptr, 1), cap = new Uint32Array(sab, ptr + 4, 1)[0], d = new Float32Array(sab, ptr + 8, cap * 2);
      const cap2 = window.r6cap = { chunks: [], total: 0, lost: 0, r: Atomics.load(w, 0) };
      setInterval(() => {
        const now = Atomics.load(w, 0); let n = (now - cap2.r) >>> 0;
        if (n > cap - 4096) { cap2.lost += n; cap2.r = now; return; }
        const c = new Int16Array(n * 2);
        for (let i = 0; i < n; i++) { const s = ((cap2.r + i) % cap) * 2; c[i * 2] = d[s] * 32767; c[i * 2 + 1] = d[s + 1] * 32767; }
        cap2.r = now; cap2.total += n; cap2.chunks.push(c);
      }, 100);
      return inner(sab, ptr);
    }, set: (f) => { inner = f; } });
  });
  // Mismos parámetros que la demo (si falta r5consumer, la página se recarga con los suyos y pisa press).
  const q = new URLSearchParams({ cpasync: '1', cpwait: 'event', r3acheck: '1', r5snap: '1', r5consumer: 'r5snap-codex.js', press: process.env.R6_PRESS || '150:start,175:start', audio: 'silent', xma: 'decode', waitmulti: 'event', audiotap: '1' });
  await page.goto(`http://127.0.0.1:${port}/?${q}`);
  await page.setInputFiles('#dir', 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
  await page.fill('#secs', String(seconds)); await page.selectOption('#gpu', 'null'); await page.click('#go');
  const t0 = Date.now();
  while (true) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => ({ exit: window.d4.exit }));
    if (s.exit !== null || (Date.now() - t0) / 1000 > +seconds + 120) { report.exit = s.exit; break; }
  }
  report.files = await page.evaluate(() => window.d4.log.filter((l) => /g1-file|\[g1e\] press|r6-audio\] frames|g1c-xma\]/.test(l)).map((l) => l.slice(0, 220)));
  report.capture = await page.evaluate(() => ({ total: window.r6cap?.total || 0, lost: window.r6cap?.lost || 0, audio: window.d4.r6Audio || null }));
  // Pasa el PCM en trozos base64.
  const n = await page.evaluate(() => { const all = new Int16Array(window.r6cap.total * 2); let o = 0; for (const c of window.r6cap.chunks) { all.set(c, o); o += c.length; } window.r6all = new Uint8Array(all.buffer); return window.r6all.length; });
  const parts = [];
  for (let o = 0; o < n; o += 4 << 20) parts.push(Buffer.from(await page.evaluate(([o]) => { let s = ''; const a = window.r6all.subarray(o, o + (4 << 20)); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); }, [o]), 'base64'));
  pcm = Buffer.concat(parts);
} finally { await browser.close(); }
if (pcm) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(48000, 24); h.writeUInt32LE(192000, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  await writeFile(resolve(out, `${label}.wav`), Buffer.concat([h, pcm]));
}
await writeFile(resolve(out, `${label}.json`), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ exit: report.exit, captured: report.capture?.total, lost: report.capture?.lost, seconds: report.capture ? +(report.capture.total / 48000).toFixed(1) : 0, pageErrors: report.pageErrors.length }));
