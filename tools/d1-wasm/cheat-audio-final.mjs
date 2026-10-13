// Claude 2026-10-12: prueba final — truco "todas las canciones" de un toque desde el menú principal + audio adaptable
// con Edge limitado a pocos núcleos (CPU_AFFINITY, def. 0x5 = 2 núcleos). Usa fast-start (perfil persistente, turno).
import fs from 'node:fs'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
import {startGame} from './fast-start.mjs';
const nap = ms => new Promise(r => setTimeout(r, ms));
const out = path.resolve('artifacts/d1-wasm/truco', 'final-' + Date.now()); fs.mkdirSync(out, {recursive: true});
const rep = {}; let g;
try {
  g = await startGame({nombre: 'base'});
  await g.page.evaluate(() => document.querySelector('#gh3Panel [data-tab=save]')?.click());
  await g.page.click('#gh3CheatSongs');
  await g.page.waitForFunction(() => /Volviendo/.test(document.getElementById('gh3CheatTxt').textContent), {}, {timeout: 120000});
  await g.shot(path.join(out, '1-tras-truco.png'));
  await g.page.waitForFunction(() => !document.getElementById('gh3CheatSongs').disabled, {}, {timeout: 60000}); await nap(2000);
  await g.shot(path.join(out, '2-menu.png'));
  await g.irA('lista'); await nap(2000); await g.shot(path.join(out, '3-lista.png'));
  const mask = Number(process.env.CPU_AFFINITY || 5);
  rep.afinidad = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'tools/d1-wasm/set-affinity.ps1', '-Mask', String(mask), '-Pattern', path.basename(g.profile)]).toString().trim();
  await g.page.evaluate(() => { window.__aud = []; setInterval(() => { const a = window.d4?.r6Audio; if (a) window.__aud.push([a.underruns, a.skips, a.silentBlocks, Math.round(a.lag / 48), a.rate, a.productionRatio]); }, 250); });
  for (let i = 0; i < 12; i++) { await g.tap(i % 4 < 2 ? 'd' : 'u', 7500); }   // 90 s moviéndose por la lista (cambia el preview)
  const aud = await g.page.evaluate(() => window.__aud), A = aud[0], Z = aud.at(-1), rates = aud.map(x => x[4]).filter(Number.isFinite), prod = aud.map(x => x[5]).filter(Number.isFinite);
  Object.assign(rep, {segundos: aud.length / 4, underruns: Z[0] - A[0], skips: Z[1] - A[1], silencioMs: Math.round((Z[2] - A[2]) * 128 / 48),
    ritmoReproduccion: {min: Math.min(...rates), max: Math.max(...rates)}, ritmoJuegoMedio: +(prod.reduce((s, x) => s + x, 0) / prod.length).toFixed(3),
    lagMs: {min: Math.min(...aud.map(x => x[3])), max: Math.max(...aud.map(x => x[3]))}, errores: g.errors});
  fs.writeFileSync(path.join(out, 'audio.json'), JSON.stringify(aud));
} catch (e) { rep.error = e.message; process.exitCode = 1; }
finally { await g?.close(); fs.writeFileSync(path.join(out, 'r.json'), JSON.stringify(rep, null, 1)); console.log(out, JSON.stringify(rep)); }
