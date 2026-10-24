// Claude 2026-10-23 (fluido A): ritmo de la capa de la autopista a partir de frames.json de med.mjs.
// Columnas de frames.json.frames: [t_ms, songPresented, swap, clock_ms, shown] (una fila por rAF de la pagina).
// Da: cuadro de pantalla (mediana entre rAF), p50/p95/p99 del intervalo entre cambios de `shown`,
// % de intervalos > un cuadro de pantalla + 2 ms, cuadros de rAF y cambios por segundo.
// Uso: node tools/modelos/ritmo-cuadros.mjs <carpeta|frames.json> [...mas]   (solo tramo de cancion: clock > 0)
import fs from 'node:fs';
import path from 'node:path';
const q = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : null;
export function ritmo(file) {
  const f = fs.statSync(file).isDirectory() ? path.join(file, 'frames.json') : file;
  const F = JSON.parse(fs.readFileSync(f, 'utf8')).frames || [];
  const R = F.filter(r => r[3] > 0 && r[4] != null);
  if (R.length < 20) return {archivo: f, error: 'pocos cuadros en cancion: ' + R.length};
  const raf = R.slice(1).map((r, i) => r[0] - R[i][0]).sort((a, b) => a - b);
  const pant = q(raf, .5);
  // instantes en que `shown` cambia (la capa dibujo algo nuevo)
  const T = []; for (let i = 1; i < R.length; i++) if (R[i][4] !== R[i - 1][4]) T.push(R[i][0]);
  const d = T.slice(1).map((t, i) => t - T[i]).sort((a, b) => a - b);
  const dur = (R.at(-1)[0] - R[0][0]) / 1000, lim = pant + 2;
  const mayores = d.filter(x => x > lim).length;
  const r1 = x => x == null ? null : +x.toFixed(1);
  return {archivo: path.basename(path.dirname(f)), cuadroPantallaMs: r1(pant), hzPantalla: r1(1000 / pant), rafs: R.length, segundos: r1(dur),
    cambiosPorSeg: r1(T.length / dur), intervaloMs: {p50: r1(q(d, .5)), p95: r1(q(d, .95)), p99: r1(q(d, .99)), max: r1(d.at(-1))},
    pctMayorAlCuadroMas2ms: r1(mayores / d.length * 100), rafsSinCambio: r1((1 - T.length / R.length) * 100)};
}
if (process.argv[1] && process.argv[1].endsWith('ritmo-cuadros.mjs')) for (const a of process.argv.slice(2)) console.log(JSON.stringify(ritmo(a)));
