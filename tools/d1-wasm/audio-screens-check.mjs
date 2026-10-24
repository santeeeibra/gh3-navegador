// Claude 2026-10-12: cortes de audio por pantalla Y por transición. Muestreo en la página cada 100 ms de
// d4.r6Audio (underruns = colchón vacío → silencio hasta rellenar 3/4; skips = salto adelante) + pedidos de red.
// Uso: [HEADED=1] node tools/d1-wasm/audio-screens-check.mjs [segPorPantalla=15] [--perfil nombre]
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from './fast-start.mjs';
const nap = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2), pi = args.indexOf('--perfil');
const nombre = pi >= 0 ? args[pi + 1] : 'base', secs = +(args.find(a => /^\d+$/.test(a)) || 15);
const out = path.resolve('artifacts/d1-wasm/audio-cortes', `run-${Date.now()}`); fs.mkdirSync(out, {recursive: true});
const PLAN = [
  ['menu', []], ['opciones', ['d', 'd', 'd', 'd', 'd', 'a']], ['menu2', ['b']],
  ['rapida', ['d', 'd', 'a']], ['lista', ['a']], ['lista-mover', ['d', 'd', 'd', 'u', 'd', 'd']], ['menu3', ['b', 'b']],
  ['rapida2', ['a']], ['lista2', ['a']], ['menu4', ['b', 'b']], ['carrera', ['u', 'u', 'a']],
];
let g;
try {
  g = await startGame({nombre, headless: !process.env.HEADED});
  const t0 = Date.now(), netAt = () => g.network.length;
  await g.page.evaluate(() => { window.__aud = []; window.__lbl = 'inicio'; setInterval(() => { const a = window.d4?.r6Audio; if (a) window.__aud.push([Math.round(performance.now()), window.__lbl, a.underruns, a.skips, a.silentBlocks, Math.round(a.lag / 48)]); }, 100); });
  const label = l => g.page.evaluate(x => { window.__lbl = x; }, l);
  const marks = [];
  for (const [screen, pasos] of PLAN) {
    await label('→' + screen); marks.push({screen, t: Date.now() - t0, net0: netAt()});
    for (const p of pasos) await g.tap(p, 1200);
    await label(screen); await nap(secs * 1000); await g.shot(path.join(out, `${screen}.png`));
  }
  await nap(400);
  const aud = await g.page.evaluate(() => window.__aud);
  const by = {};
  for (let i = 1; i < aud.length; i++) { const [t, l, u, k, sb] = aud[i], p = aud[i - 1], r = by[l] ??= {etiqueta: l, underruns: 0, skips: 0, silencioMs: 0, lagMin: 1e9};
    r.underruns += u - p[2]; r.skips += k - p[3]; r.silencioMs += Math.round((sb - p[4]) * 128 / 48); r.lagMin = Math.min(r.lagMin, aud[i][5]);
    if (u > p[2] || k > p[3]) console.log('evento', JSON.stringify({t, etiqueta: l, underruns: u - p[2], skips: k - p[3], lagAntes: p[5]})); }
  for (const r of Object.values(by)) console.log(JSON.stringify(r));
  fs.writeFileSync(path.join(out, 'muestras.json'), JSON.stringify(aud));
  fs.writeFileSync(path.join(out, 'resumen.json'), JSON.stringify({por: Object.values(by), marks, red: g.network.length, errores: g.errors}, null, 1));
  console.log('salida', out);
} catch (e) { console.log(JSON.stringify({ok: false, error: e.message})); process.exitCode = 1; }
finally { await g?.close(); }
