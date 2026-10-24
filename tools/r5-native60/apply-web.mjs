// Aplica la página vigente del repo (web/gh3-native60) sobre la demo local que tiene el juego (wasm, chunks, bundles).
// Claude 2026-10-13. Orden: 1) node tools/r5-native60/build.mjs  (copia la base y arma bundles con los shaders locales)
//                           2) node tools/r5-native60/apply-web.mjs [--demo artifacts/r5-native60/demo]
// build.mjs copia la base hw60 ENCIMA de la demo (incluido index.html); por eso la página del repo va después.
// Antes de reemplazar guarda un respaldo de cada archivo que cambia en <demo>-respaldo-<fecha>/. No borra nada.
// No copia datos del juego (no están en el repo) y se niega a seguir si la demo no tiene el runtime con r5NativePort.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2), at = args.indexOf('--demo');
const demo = path.resolve(at >= 0 ? args[at + 1] : 'artifacts/r5-native60/demo');
const web = path.resolve(args.includes('--web') ? args[args.indexOf('--web') + 1] : 'web/gh3-native60');
const dry = args.includes('--simular');
const runtime = path.join(demo, 'gh3-web.js');
if (!fs.existsSync(runtime)) throw Error('No encuentro ' + runtime + ': primero node tools/r5-native60/build.mjs (con el juego en la PC).');
if (!fs.readFileSync(runtime, 'utf8').includes("Module['r5NativePort']")) throw Error('El runtime de la demo no tiene el enlace r5NativePort: correr build.mjs antes.');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19), backup = demo + '-respaldo-' + stamp;
const changed = [], same = [];
for (const name of fs.readdirSync(web)) {
  const src = path.join(web, name), dst = path.join(demo, name);
  if (!fs.statSync(src).isFile()) continue;
  const next = fs.readFileSync(src);
  if (fs.existsSync(dst) && Buffer.compare(fs.readFileSync(dst), next) === 0) { same.push(name); continue; }
  changed.push(name);
  if (dry) continue;
  if (fs.existsSync(dst)) { fs.mkdirSync(backup, {recursive: true}); fs.copyFileSync(dst, path.join(backup, name)); }
  fs.writeFileSync(dst, next);
}
console.log(JSON.stringify({demo, aplicados: changed, iguales: same.length, respaldo: changed.length && !dry ? backup : null, simulacion: dry}, null, 1));
