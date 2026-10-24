// Claude 2026-10-14: build espía (artifacts/re/demo-g7): qué funciones del juego cambian al apretar CALIBRATE.
import fs from 'node:fs';
import {startGame} from './fast-start.mjs';
const out = 'artifacts/d1-wasm/calibrar'; const nap = ms => new Promise(r => setTimeout(r, ms));
const re = `(() => { const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { const d = e.data; if (d?.type === 'g1Mem' || d?.type === 'g1eInput') window.g1mem = {sab: d.sab, seg: d.seg}; }); return w; }; window.Worker.prototype = W.prototype; })();
` + fs.readFileSync('tools/re/re-page.js', 'utf8');
const g = await startGame({nombre: 'calibrar-re', root: 'artifacts/re/demo-g7', port: 5496, owner: 'Claude (calibrate espía)', query: '', init: re});
const tot = {antes: {}, despues: {}, tarde: {}}, names = {};
const linea = []; const drain = async k => { const r = await g.page.evaluate(() => window.reDrain()); Object.assign(names, r.names || {}); for (const x of r.samples) linea.push({k, t: x.t, d: x.d});
  for (const s of r.samples) for (let i = 0; i < s.d.length; i += 2) tot[k][s.d[i]] = (tot[k][s.d[i]] || 0) + s.d[i + 1]; };
console.log('arranco', JSON.stringify(g.marks));
try {
  const key = async (k, wait = 2500) => { await g.page.keyboard.down(k); await nap(250); await g.page.keyboard.up(k); await nap(wait); };
  await g.page.click('#r5Canvas').catch(() => {}); await nap(6000);
  for (let i = 0; i < 5; i++) await key('ArrowDown');
  await key('1', 3000); await g.shot(`${out}/21-opciones.png`); await key('ArrowDown'); await key('1', 4000); await g.shot(`${out}/22-pantalla.png`);
  console.log('en calibrate');
  console.log('re', JSON.stringify(await g.page.evaluate(() => window.reStart({everyMs: 250}))));
  await nap(1000); Object.assign(names, (await g.page.evaluate(() => window.reDrain())).names || {});   // descartar muestras, guardar nombres
  await nap(6000); await drain('antes');
  await key('1', 500); for (let i = 0; i < 40; i++) { await nap(1000); if (i % 5 === 2) await g.shot(`${out}/s${String(i).padStart(2, '0')}.png`); if (i === 14) await drain('despues'); } await drain('tarde'); fs.writeFileSync(`${out}/espia-linea.json`, JSON.stringify({names, linea}));
  await g.shot(`${out}/20-espia.png`);
  const nm = id => names[id] || id, rows = [];
  for (const id of new Set([...Object.keys(tot.antes), ...Object.keys(tot.despues)])) {
    const a = (tot.antes[id] || 0) / 6, d = (tot.despues[id] || 0) / 15; rows.push([nm(id), +a.toFixed(1), +d.toFixed(1)]); }
  const nuevas = rows.filter(r => r[1] === 0 && r[2] > 0).sort((x, y) => y[2] - x[2]);
  const subas = rows.filter(r => r[1] > 0 && r[2] > r[1] * 3 && r[2] > 5).sort((x, y) => y[2] / y[1] - x[2] / x[1]);
  fs.writeFileSync(`${out}/espia-calibrar.json`, JSON.stringify({nuevas, subas, rows}, null, 1));
  console.log('nuevas', nuevas.length, JSON.stringify(nuevas.slice(0, 60)));
  console.log('subas', JSON.stringify(subas.slice(0, 30)));
} finally { await g.close(); }
