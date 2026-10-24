// Claude 2026-10-22 (alta100 op7): lleva op7 a una carpeta con la página del SITIO (artifacts/pages-gh3/site/gh3).
// Solo reemplaza/agrega los archivos de op7; la página, paneles, autopista60.js y gh3-render-scale.js quedan los del sitio.
//   --dest   carpeta destino (la copia de prueba artifacts/d1-wasm/op7-sitio/demo o el sitio)
//   --js     gh3-web.js a usar (op7-sitio/gh3-web.publicar.js con wasm en R2 «gh3-web-aba13ad1.wasm», o gh3-web.local.js)
//   --wasm   (solo copia de prueba) copia también el wasm de op7 como gh3-web.wasm
// Uso: node tools/op7/armar-sitio.mjs --dest <dir> --js <archivo> [--wasm]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const OP7 = 'artifacts/d1-wasm/alta100/op7', dest = opt('dest'), js = opt('js');
if (!dest || !js) throw Error('faltan --dest y --js');
const ARCHIVOS = ['r5snap-native60-scene.js', 'r5snap-native60-colas.js', 'r5snap-native60-render.js', 'r5snap-armador.js',
  'r5snap-native60-scene-arm.js', 'r5snap-native60-colas-arm.js', 'r5snap-native60-render-arm.js', 'autopista60-filtro.js',
  'gh3-novedades.js', 'gh3-version.js'];
const put = (from, name) => { const to = path.join(dest, name); if (fs.existsSync(to)) fs.unlinkSync(to); fs.copyFileSync(from, to); };
for (const n of ARCHIVOS) put(path.join(OP7, n), n);
put(js, 'gh3-web.js');
if (opt('wasm', false) === true) put(path.join(OP7, 'web/gh3-web.wasm'), 'gh3-web.wasm');
const t = fs.readFileSync(path.join(dest, 'gh3-web.js'), 'utf8');
if ((t.match(/relojAudioMemory/g) || []).length !== 1 || !t.includes('_r5l_hash128')) throw Error('gh3-web.js sin gancho o sin hash');
for (const n of ['r5snap-native60-scene.js', 'r5snap-native60-colas.js', 'r5snap-native60-render.js'])
  if (!fs.readFileSync(path.join(dest, n), 'utf8').includes('autopista60-tap.js')) throw Error(n + ' sin lector de la capa');
console.log(JSON.stringify({dest, archivos: ARCHIVOS.length + 1, wasm: opt('wasm', false) === true, wasmUrl: (t.match(/return "([^"]*\.wasm)"/) || [])[1]}));
