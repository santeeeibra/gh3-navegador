// Claude 2026-10-23: ¿el port restaura su propia Carrera al recargar? Ronda 1: crea banda en un perfil nuevo y deja que guarde.
// Ronda 2: arranca de nuevo con el mismo perfil y abre Carrera. Uso: node tools/modelos/probar-carrera.mjs [perfil]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {startGame} from 'file:///D:/guitar hero/tools/d1-wasm/fast-start.mjs';
const perfil = process.argv[2] || 'rtcarrera', dir = path.resolve('artifacts/d1-wasm/perfil-pruebas', perfil), out = path.resolve('artifacts/gh3-liviano/accesos', 'carrera-' + Date.now());
fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(out, {recursive: true});
const abrir = () => startGame({nombre: perfil, root: 'artifacts/d1-wasm/alta100/op7', query: 'manual=1&diag=1', headless: true, owner: 'Claude (probar carrera)', deadline: Date.now() + 170000, esperarTurno: false, init: "try{localStorage.setItem('gh3q','liviano')}catch{}"});
const idb = g => g.page.evaluate(() => new Promise(res => { const q = indexedDB.open('gh3-data', 1); q.onerror = () => res(null); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('files')) return res(null); const st = db.transaction('files').objectStore('files'), o = {}, c = st.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(o); if (/Progress\/(toc|s000)/.test(x.key)) { const u = new Uint8Array(x.value); let h = 2166136261; for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 16777619) >>> 0; } o[x.key.split('/').pop()] = h.toString(16) + '|' + x.value.byteLength; } x.continue(); }; }; }));
let g = await abrir();
const r0 = await idb(g);
const seq = (process.argv[3] || 'a,s').split(',');
for (const [i, k] of seq.entries()) { await g.tap(k, 5000); if (i === seq.length - 1 || process.argv.includes('--todas')) await g.shot(path.join(out, 'r1-paso' + (i + 1) + '-' + k + '.png')); }
await new Promise(r => setTimeout(r, 7000));
const r1 = await idb(g); console.log('ronda 1: huella al arrancar', JSON.stringify(r0), '| al final', JSON.stringify(r1), '| cambió:', JSON.stringify(r0) !== JSON.stringify(r1));
await g.close?.();
g = await abrir();
await g.tap('a', 3500); await g.shot(path.join(out, 'r2-01-carrera.png'));
const r2 = await idb(g); console.log('ronda 2, mismos archivos al reabrir:', JSON.stringify(r1 && r2 && Object.keys(r1).every(k => r1[k] === r2[k])));
console.log('capturas en', out);
await g.close?.(); process.exit(0);
