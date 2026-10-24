// Claude 2026-10-23: crea Carrera, juega la 1.ª canción con el robot hasta el final, mira si el juego guarda (huella de Progress)
// y si al reabrir la Carrera sigue ahí. Uso: node tools/modelos/probar-carrera-cancion.mjs [perfil]
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from 'file:///D:/guitar hero/tools/d1-wasm/fast-start.mjs';
import {leerChart, instalarRobot, initMemoria} from 'file:///D:/guitar hero/tools/accesos/robot.mjs';
const perfil = process.argv[2] || 'rtcancion', dir = path.resolve('artifacts/d1-wasm/perfil-pruebas', perfil), out = path.resolve('artifacts/gh3-liviano/accesos', 'carrera-cancion-' + Date.now());
fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const abrir = () => startGame({nombre: perfil, root: 'artifacts/d1-wasm/alta100/op7', query: 'manual=1&diag=1', headless: true, owner: 'Claude (carrera cancion)', deadline: Date.now() + 590000, esperarTurno: false, init: `(${initMemoria.toString()})();try{localStorage.setItem('gh3q','liviano')}catch{}`});
const idb = g => g.page.evaluate(() => new Promise(res => { const q = indexedDB.open('gh3-data', 1); q.onerror = () => res(null); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('files')) return res(null); const st = db.transaction('files').objectStore('files'), o = {}, c = st.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(o); if (/Progress\/(toc|s000)/.test(x.key)) { const u = new Uint8Array(x.value); let h = 2166136261; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } o[x.key.split('/').pop()] = h.toString(16); } x.continue(); }; }; }));
let g = await abrir(); const r0 = await idb(g);
for (const k of 'a,d,a,d,a,s,a,a'.split(',')) await g.tap(k, 4500);   // hasta el hub de Carrera
await g.shot(path.join(out, '1-hub.png'));
const clock = () => g.page.evaluate(() => window.gh3Song?.clock?.() ?? null);
let empezo = false;
for (let k = 0; k < 14 && !empezo; k++) { await g.tap('a', 5000); empezo = (await clock()) > 0; if (k === 1) await g.shot(path.join(out, '2-tras-play-show.png')); }
console.log('canción empezó:', empezo);
if (empezo) {
  await instalarRobot(g.page, leerChart('slowride'), {});
  let ult = -1, quieto = 0; const t0 = Date.now();
  while (Date.now() - t0 < 420000) { await nap(2000); const c = await clock(); quieto = c === ult ? quieto + 1 : 0; ult = c; if (quieto >= 5 && c > 30000) break; }
  console.log('canción terminó (reloj en', Math.round(ult / 1000), 's)');
  await g.shot(path.join(out, '3-fin.png'));
  for (const k of 'a,a,a'.split(',')) await g.tap(k, 5000);
  await nap(8000); await g.shot(path.join(out, '4-despues.png'));
}
const r1 = await idb(g); console.log('huella inicio', JSON.stringify(r0), 'final', JSON.stringify(r1), 'cambió:', JSON.stringify(r0) !== JSON.stringify(r1));
await g.close?.(); g = await abrir(); await g.tap('a', 4500); await g.shot(path.join(out, '5-reabrir-carrera.png'));
console.log('capturas en', out); await g.close?.(); process.exit(0);
