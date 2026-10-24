// Claude 2026-10-13: prueba final del botón de trucos (varios + guardado automático) y recarga (copia ui2). Capturas en argv[2].
import {startGame} from './fast-start.mjs';
const out = process.argv[2], nap = ms => new Promise(r => setTimeout(r, ms));
const opt = {nombre: 'trucos', root: 'artifacts/d1-wasm/ui2/demo', port: 5493, owner: 'Claude (prueba trucos ui2)'};
let n = 0, g = await startGame(opt);
const shot = async (t) => { await g.shot(`${out}/f${String(++n).padStart(2, '0')}-${t}.png`); console.log('shot', n, t); };
try {
  await g.page.evaluate(() => { for (const [id] of [['songs'], ['nofail'], ['air']]) document.getElementById('gh3ch-' + id).checked = id !== 'songs'; document.getElementById('gh3CheatSongs').click(); });
  for (let i = 0; i < 60; i++) { await nap(1500); const s = await g.page.evaluate(() => ({ d: document.getElementById('gh3CheatSongs').disabled, t: document.getElementById('gh3CheatTxt').textContent }));
    console.log(i, s.t); if (!s.d) break; }
  await shot('fin-boton'); console.log('guardado', JSON.stringify(await g.page.evaluate(() => window.gh3Save && {t: gh3Save.t, saved: gh3Save.saved})));
} finally { await g.close(); }
g = await startGame(opt);
try { await g.irA('trucos'); await shot('recargado'); console.log('marcados', await g.page.evaluate(() => localStorage.getItem('gh3cheats'))); } finally { await g.close(); }
