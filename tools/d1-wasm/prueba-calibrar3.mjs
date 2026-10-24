// Claude 2026-10-14: copia publicada (guitar7). CALIBRATE con tecla real '1' sostenida N ms (argv[2]); capturas antes/después y Back.
import fs from 'node:fs';
import {startGame} from './fast-start.mjs';
const hold = Number(process.argv[2] || 60), out = `artifacts/d1-wasm/calibrar/hold${hold}`; fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const g = await startGame({nombre: 'calibrar', root: 'artifacts/d1-wasm/guitar7/demo', port: 5495, owner: `Claude (Calibrate tecla ${hold} ms)`, query: '', init: () => { window.__lc = []; const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { const d = e.data; if (d && (d.type === 'localCache' || d.type === 'songLoad' || (d.type === 'log' && /g1-file|xma|XMA|stream|fsb|error|warn/i.test(d.text)))) window.__lc.push(Math.round(performance.now()) + ' ' + JSON.stringify(d).slice(0, 300)); }); return w; }; window.Worker.prototype = W.prototype; }});
const key = async (k, wait = 2500, ms = 250) => { await g.page.keyboard.down(k); await nap(ms); await g.page.keyboard.up(k); await nap(wait); };
const loud = () => g.page.evaluate(() => { const l = (window.d4?.log || []).filter(s => /^\[r6-audio\]/.test(s)).at(-1); return l && +/loud=(\d+)/.exec(l)[1]; });
try {
  await g.page.click('#r5Canvas').catch(() => {}); await nap(6000);
  for (let i = 0; i < 5; i++) await key('ArrowDown');
  await key('1', 3000); await key('ArrowDown'); await key('1', 4000); await g.shot(`${out}/1-pantalla.png`);
  const l0 = await loud(); const t0 = await g.page.evaluate(() => performance.now()); await key('1', 3000, hold); await g.shot(`${out}/2-tras-calibrate.png`);
  await nap(8000); const l1 = await loud(); await g.shot(`${out}/3-mas-tarde.png`);
  await key('2', 3000); await g.shot(`${out}/4-back.png`); await key('ArrowDown', 2000); await g.shot(`${out}/5-abajo.png`);
  fs.writeFileSync(`${out}/worker.txt`, (await g.page.evaluate(() => window.__lc)).join(String.fromCharCode(10))); console.log('t0', t0, 'red', g.network.length);
  console.log(JSON.stringify({hold, loudAntes: l0, loudDespues: l1, errores: g.errors}));
} finally { await g.close(); }
