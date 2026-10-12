// VB: resume la última línea [vb] (y [r3b]/[r2c]) de un log de corrida. Uso: node summarize-vblank.mjs <log> [salida.json]
import fs from 'node:fs';
const [log, out] = process.argv.slice(2);
const txt = fs.readFileSync(log, 'utf8');
const last = tag => { const m = [...txt.matchAll(new RegExp('\\[' + tag + '\\] (\\{.*\\})', 'g'))]; return m.length ? JSON.parse(m.at(-1)[1]) : null; };
const vb = last('vb'), r3b = last('r3b'), r2c = last('r2c'), g1 = last('g1');
if (!vb) { console.error('sin línea [vb]'); process.exit(1); }
const stats = a => { const s = [...a].sort((x, y) => x - y); return { n: s.length, min: s[0], p50: s[s.length >> 1], max: s.at(-1) }; };
// Segundos completos: se descartan el primero (arranque) y el último (parcial).
const full = a => a.slice(1, -1);
const r = {
  log, vblanks: vb.vblanks, swaps: vb.swaps, spanS: vb.spanS,
  intervalMs: Object.fromEntries(Object.entries(vb.intervalUs).map(([k, v]) => [k, k === 'n' ? v : +(v / 1000).toFixed(3)])),
  callbackUs: vb.callbackUs, burstLt2ms: vb.burstLt2ms, lateGt25ms: vb.lateGt25ms,
  swapIntervalMs: vb.swapIntervalUs && Object.fromEntries(Object.entries(vb.swapIntervalUs).map(([k, v]) => [k, k === 'n' ? v : +(v / 1000).toFixed(3)])),
  vblanksPerSecondFull: stats(full(vb.vblanksPerSecond)), swapsPerSecondFull: stats(full(vb.swapsPerSecond)),
  vblanksPerSecond: vb.vblanksPerSecond, swapsPerSecond: vb.swapsPerSecond,
  cpAsync: r3b?.async, cpWait: r2c?.cpWait, g1Swaps: g1?.swaps, g1Vblanks: g1?.vblanks,
};
if (out) fs.writeFileSync(out, JSON.stringify(r, null, 1));
console.log(JSON.stringify({ ...r, vblanksPerSecond: undefined, swapsPerSecond: undefined }));
