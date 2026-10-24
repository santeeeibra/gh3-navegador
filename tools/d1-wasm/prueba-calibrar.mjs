// Claude 2026-10-14: reproduce el cuelgue en Opciones → Calibrate Lag (copia publicada guitar7). Capturas y latido en argv[2].
import fs from 'node:fs';
import {startGame} from './fast-start.mjs';
const out = process.argv[2] || 'artifacts/d1-wasm/calibrar'; fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const g = await startGame({nombre: 'calibrar', root: 'artifacts/d1-wasm/guitar7/demo', port: 5495, owner: 'Claude (cuelgue Calibrate)', query: ''});
const pulso = () => g.page.evaluate(() => ({swap: window.d4?.songRenderer?.swap ?? null, img: window.d4?.songPresented ?? null,
  exit: window.d4?.exit ?? null, quiet: window.gh3Diag?.quietS, err: (window.gh3Diag?.errors || []).map(e => e.kind + ': ' + e.message).slice(-3),
  tail: (Array.isArray(window.d4?.log) ? window.d4.log.slice(-8) : [])}));
try {
  console.log('menu', JSON.stringify(await pulso()));
  await g.irA('opciones'); await g.tap('d'); await g.tap('a', 3000);
  await g.shot(`${out}/01-calibrate.png`); console.log('calibrate', JSON.stringify(await pulso()));
  // Rasguear al ritmo ~ cada 500 ms durante 40 s, midiendo el latido cada 5 s.
  for (let i = 0; i < 80; i++) {
    await g.page.evaluate(() => gh3Input.tap('down')); await nap(500);
    if (i % 10 === 9) console.log('t', (i + 1) / 2, JSON.stringify(await pulso()));
  }
  await g.shot(`${out}/02-despues.png`);
  await g.tap('b', 3000); await g.shot(`${out}/03-volver.png`); console.log('volver', JSON.stringify(await pulso()));
  console.log('errores pagina', JSON.stringify(g.errors));
} finally { await g.close(); }
