// Claude 2026-10-14: entra a CALIBRATE (no solo a la pantalla) y registra qué archivo pide el juego.
import fs from 'node:fs';
import {startGame} from './fast-start.mjs';
const out = process.argv[2] || 'artifacts/d1-wasm/calibrar'; fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const g = await startGame({nombre: 'calibrar', root: 'artifacts/d1-wasm/guitar7/demo', port: 5495, owner: 'Claude (cuelgue Calibrate 2)', query: '', init: () => { window.__lc = []; const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { const d = e.data; if (d && (d.type === 'localCache' || d.type === 'songLoad')) window.__lc.push(JSON.stringify(d).slice(0, 200)); }); return w; }; window.Worker.prototype = W.prototype; }});
const pulso = () => g.page.evaluate(() => ({img: window.d4?.songPresented ?? null, exit: window.d4?.exit ?? null}));
try {
  await g.irA('opciones'); await g.tap('d'); await g.tap('a', 3000);
  const n0 = g.network.length, l0 = await g.page.evaluate(() => window.d4.log.length);
  await g.tap('a', 1000); console.log('A en CALIBRATE', JSON.stringify(await pulso()));
  for (let i = 0; i < 6; i++) { await nap(4000); console.log('t', (i + 1) * 4, JSON.stringify(await pulso())); }
  await g.shot(`${out}/10-calibrando.png`);
  const log = await g.page.evaluate(l0 => window.d4.log.slice(l0).filter(s => !/g1d-frame/.test(s)), l0);
  fs.writeFileSync(`${out}/log-calibrar.txt`, log.join('\n'));
  console.log('localCache', JSON.stringify(await g.page.evaluate(() => window.__lc.slice(-30))));
  console.log('pedidos red', JSON.stringify(g.network.slice(n0).map(r => r.name || r.url || r).slice(0, 20)));
  console.log('log con archivos', JSON.stringify(log.filter(s => /synctest|\.pak|\.fsb|\.xen|not found|missing|fail|error/i.test(s)).slice(0, 30)));
  await g.tap('b', 3000); await g.shot(`${out}/11-volver.png`); console.log('volver', JSON.stringify(await pulso()));
} finally { await g.close(); }
