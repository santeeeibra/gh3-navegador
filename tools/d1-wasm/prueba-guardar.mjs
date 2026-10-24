// Claude 2026-10-13: truco Hyperspeed → Options → Save/Load → Save Game → recargar y ver si sigue (copia ui2). Capturas en argv[2].
import {startGame} from './fast-start.mjs';
const out = process.argv[2], nap = ms => new Promise(r => setTimeout(r, ms));
const opt = {nombre: 'trucos', root: 'artifacts/d1-wasm/ui2/demo', port: 5493, owner: 'Claude (prueba guardar ui2)'};
let n = 0;
let g = await startGame(opt);
const shot = async (t) => { await g.shot(`${out}/h${String(++n).padStart(2, '0')}-${t}.png`); console.log('shot', n, t); };
const saves = () => g.page.evaluate(() => window.gh3Save ? {t: gh3Save.t, what: gh3Save.what, saved: gh3Save.saved} : null);
try {
  await g.irA('trucos'); await g.tap('u', 600); await g.tap('a', 1500);
  const C = {O: 16}, seq = 'O B O Y O B O Y'.split(' '), F = {G: 1, R: 2, Y: 4, B: 8, O: 16};
  await g.page.evaluate(async (seq) => { const F = {G: 1, R: 2, Y: 4, B: 8, O: 16}, nap = ms => new Promise(r => setTimeout(r, ms)), sm = gh3Input.songMode; gh3Input.songMode = () => true;
    for (const c of seq) { const f = [...c].reduce((m, x) => m | F[x], 0); gh3Input.setTouch(f, 0); await nap(60); gh3Input.setTouch(f, 2); await nap(60); gh3Input.setTouch(f, 0); await nap(40); gh3Input.setTouch(0, 0); await nap(80); }
    await nap(900); gh3Input.songMode = sm; }, seq);
  await shot('hyper-puesto');
  await g.tap('s', 2000); await shot('tras-start');
  await g.tap('b', 2000); await shot('options');
  for (const k of ['d', 'd', 'd', 'd']) await g.tap(k, 500);
  await g.tap('a', 2500); await shot('saveload');
  console.log('antes', JSON.stringify(await saves()));
  await g.tap('a', 2500); await shot('save-a'); await g.tap('a', 3000); await shot('overwrite');
  for (let i = 0; i < 4; i++) { await nap(2000); await shot('espera-' + i); console.log(i, JSON.stringify(await saves())); }
} finally { await g.close(); }
g = await startGame(opt);
try { await g.irA('trucos'); await shot('recargado-cheats'); console.log('recarga', JSON.stringify(await g.page.evaluate(() => window.gh3Save ? {what: gh3Save.what, restored: gh3Save.restored} : null))); } finally { await g.close(); }
