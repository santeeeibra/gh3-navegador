// Claude 2026-10-23: mete una partida (s000.d + toc.dat) en el guardado del navegador (IndexedDB «gh3-data») de un perfil de pruebas.
// Uso: node tools/modelos/importar-guardado.mjs <perfil> <carpeta-con-s000.d-y-toc.dat> [--rellenar 16384] [--base <carpeta-volcada>]
// --base: carpeta con user/.../Progress ya volcada de otro perfil (listar-guardado.mjs --volcar) para tomar .header y miniatura.
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from 'file:///D:/guitar hero/tools/d1-wasm/fast-start.mjs';
const [perfil, carpeta] = process.argv.slice(2), opt = k => { const i = process.argv.indexOf('--' + k); return i < 0 ? null : process.argv[i + 1]; };
const PROG = '/data/user/B13EBABEBABEBABE/415607F7/00000001/Progress/', HEAD = '/data/user/B13EBABEBABEBABE/415607F7/Headers/00000001/Progress.header';
const s000 = fs.readFileSync(path.join(carpeta, 's000.d')); let toc = fs.readFileSync(path.join(carpeta, 'toc.dat'));
if (opt('rellenar') && toc.length < Number(opt('rellenar'))) toc = Buffer.concat([toc, Buffer.alloc(Number(opt('rellenar')) - toc.length)]);
const base = opt('base'), rd = f => base ? fs.readFileSync(path.join(base, 'user/B13EBABEBABEBABE/415607F7', f)) : null;
const entradas = {[PROG + 's000.d']: s000, [PROG + 'toc.dat']: toc};
if (base) { entradas[PROG + '__thumbnail.png'] = rd('00000001/Progress/__thumbnail.png'); entradas[HEAD] = rd('Headers/00000001/Progress.header'); }
const g = await startGame({nombre: perfil, root: 'artifacts/d1-wasm/alta100/op7', query: 'manual=1&save=0', headless: true, owner: 'Claude (importar guardado)', deadline: Date.now() + 90000, esperarTurno: false});
await new Promise(r => setTimeout(r, 3000));
const n = await g.page.evaluate(ent => new Promise(res => { const q = indexedDB.open('gh3-data', 1); q.onupgradeneeded = () => q.result.createObjectStore('files'); q.onerror = () => res('error'); q.onsuccess = () => { const db = q.result, tx = db.transaction('files', 'readwrite'), st = tx.objectStore('files'); let k = 0; for (const [p, b] of Object.entries(ent)) { st.put(new Uint8Array(b).buffer, p); k++; } tx.oncomplete = () => res(k); }; }), Object.fromEntries(Object.entries(entradas).map(([k, v]) => [k, Array.from(v)])));
console.log('escritos en el guardado de', perfil + ':', n, 'archivos (s000.d', s000.length, 'toc.dat', toc.length + ')');
await g.close?.();
process.exit(0);
