// Claude 2026-10-14: copia publicada (guitar7). CALIBRATE + rasgueos (flecha abajo) 25 s; al volver, ¿responde el menú?
import fs from 'node:fs';
import {startGame} from './fast-start.mjs';
const out = 'artifacts/d1-wasm/calibrar/c4'; fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const g = await startGame({nombre: 'calibrar', root: 'artifacts/d1-wasm/guitar7/demo', port: 5495, owner: 'Claude (Calibrate + rasgueo)', query: ''});
const key = async (k, wait = 2500, ms = 250) => { await g.page.keyboard.down(k); await nap(ms); await g.page.keyboard.up(k); await nap(wait); };
const est = () => g.page.evaluate(() => ({img: window.d4?.songPresented, exit: window.d4?.exit ?? null, loud: +(/loud=(\d+)/.exec((window.d4?.log || []).filter(s => /^\[r6-audio\]/.test(s)).at(-1) || '')?.[1] || 0)}));
try {
  await g.page.click('#r5Canvas').catch(() => {}); await nap(6000);
  for (let i = 0; i < 5; i++) await key('ArrowDown');
  await key('1', 3000); await key('ArrowDown'); await key('1', 4000); await g.shot(`${out}/1-pantalla.png`);
  await key('1', 3500);
  for (let i = 0; i < 50; i++) { await key('ArrowDown', 400, 80); if (i % 10 === 9) { await g.shot(`${out}/r${i}.png`); console.log('rasgueo', i, JSON.stringify(await est())); } }
  await nap(8000); await g.shot(`${out}/2-vuelta.png`); console.log('vuelta', JSON.stringify(await est()));
  await key('ArrowDown', 2000); await g.shot(`${out}/3-abajo.png`);
  await key('ArrowUp', 2000); await g.shot(`${out}/4-arriba.png`);
  await key('2', 3000); await g.shot(`${out}/5-back.png`); console.log('fin', JSON.stringify(await est()), JSON.stringify(g.errors));
} finally { await g.close(); }
