// R6: para cuadros con salto en la muestra 128, busca de qué punto del audio sale la segunda mitad.
// Uso: node lag.mjs <wav> [maxClics=300] [rango=40000] [desde_s=0] [hasta_s=1e9] [control]
// Imprime histograma de desplazamientos L (muestras): segunda mitad ≈ audio de t+L.
// Vuelta del búfer Bink→XAudio por pista (mono 16 bit, 48 kHz): 58368 B = 29184 muestras.
import fs from 'fs';
const [wav, maxC = 300, R = 40000, s0 = 0, s1 = 1e9, ctl = ''] = process.argv.slice(2);  // ctl=control: cuadros SIN salto
const b = fs.readFileSync(wav); const d = new Int16Array(b.buffer, b.byteOffset + 44, (b.length - 44) >> 1);
const n = d.length / 2; const x = new Float32Array(n);
for (let i = 0; i < n; i++) x[i] = (d[i * 2] + d[i * 2 + 1]) / 2;
const sd = (i) => x[i] - 2 * x[i - 1] + x[i - 2];
const clicks = [];
for (let f = Math.max(1, Math.floor(s0 * 48000 / 256)); f < Math.min(n / 256 - 1, s1 * 48000 / 256); f++) {
  let ref = 0, cnt = 0;
  for (let i = f * 256 + 2; i < f * 256 + 256; i++) { if (i % 256 === 128 || i % 256 === 129) continue; ref += Math.abs(sd(i)); cnt++; }
  ref /= cnt; if (ref < 5) continue;
  const v = Math.max(Math.abs(sd(f * 256 + 128)), Math.abs(sd(f * 256 + 129)));
  if (ctl ? (v < 1.5 * ref && f % 7 === 0) : v > 5 * ref) clicks.push(f);
  if (clicks.length >= +maxC) break;
}
const W = 128, hist = new Map(); let good = 0;
for (const f of clicks) {
  const t = f * 256 + 128; let e2 = 0; for (let k = 0; k < W; k++) e2 += x[t + k] * x[t + k];
  if (e2 < 1e4) continue;
  let best = -2, bestL = 0;
  for (let L = -R; L <= R; L++) {
    if (L > -W && L < W) continue; if (t + L < 0 || t + L + W >= n) continue;
    let c = 0, e = 0; for (let k = 0; k < W; k++) { const v = x[t + L + k]; c += v * x[t + k]; e += v * v; }
    const r = c / Math.sqrt(e * e2 + 1e-9); if (r > best) { best = r; bestL = L; }
  }
  if (best < 0.9) continue; good++;
  const key = Math.round(bestL / 128) * 128; hist.set(key, (hist.get(key) || 0) + 1);
}
console.log('clics', clicks.length, 'con coincidencia r>=0.9', good);
console.log([...hist].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([L, c]) => `${L}:${c}`).join(' '));
