// Claude 2026-10-23: lista (y con --volcar <carpeta> guarda) los archivos de partida del perfil de pruebas (IndexedDB «gh3-data»).
// Uso: node tools/modelos/listar-guardado.mjs <perfil> [--volcar <carpeta>]
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from 'file:///D:/guitar hero/tools/d1-wasm/fast-start.mjs';
const volcar = process.argv.indexOf('--volcar') > 0 ? process.argv[process.argv.indexOf('--volcar') + 1] : null;
const g = await startGame({nombre: process.argv[2], root: 'artifacts/d1-wasm/alta100/op7', query: 'manual=1', headless: true, owner: 'Claude (listar guardado)', deadline: Date.now() + 90000, esperarTurno: false});
await new Promise(r => setTimeout(r, 4000));
const r = await g.page.evaluate(() => new Promise(res => { const q = indexedDB.open('gh3-data', 1); q.onerror = () => res('sin base'); q.onsuccess = () => { const db = q.result; if (!db.objectStoreNames.contains('files')) return res('sin store'); const st = db.transaction('files').objectStore('files'); const out = []; const c = st.openCursor(); c.onsuccess = () => { const x = c.result; if (!x) return res(out); out.push([x.key, Array.from(new Uint8Array(x.value))]); x.continue(); }; }; }));
for (const [k, b] of r) { console.log(k, b.length); if (volcar && /\/user\//.test(k)) { const f = path.join(volcar, k.replace(/^\/data\//, '')); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, Buffer.from(b)); } }
await g.close?.();
process.exit(0);
