// Claude 2026-10-22 (alta100 op7): vuelve a enchufar la capa autopista60 (y con ella el gancho reloj↔audio) en los
// lectores de la línea op2/op5, que se rearmaron desde la fuente sin los agregados de tools/autopista60/build.mjs.
//   - r5snap-native60-{scene,colas,render}.js (hilo CP): importScripts("autopista60-tap.js") al final, igual que build.mjs.
//   - r5snap-armador.js (worker armador, donde ahora se preparan los dibujos): carga autopista60-filtro.js
//     (= tools/op7/filtro-armador.js), que define __hw60DrawFilter; los *-arm.js ya lo consultan.
// Lee los originales de --base (por defecto alta100/op5) y escribe en --dest (por defecto alta100/op7).
// Uso: node tools/op7/armar-capa.mjs [--base dir] [--dest dir]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const base = opt('base', 'artifacts/d1-wasm/alta100/op5'), dest = opt('dest', 'artifacts/d1-wasm/alta100/op7');
const TAP = '\n;try{importScripts("autopista60-tap.js")}catch(e){console.error("[autopista60] lector: "+e)}\n';
const put = (name, text) => { const to = path.join(dest, name); if (fs.existsSync(to)) fs.unlinkSync(to); fs.writeFileSync(to, text); };
const hechos = {};
for (const name of ['r5snap-native60-scene.js', 'r5snap-native60-colas.js', 'r5snap-native60-render.js']) {
  const text = fs.readFileSync(path.join(base, name), 'utf8');
  if (text.includes('autopista60-tap.js')) throw Error(name + ': ya tiene el lector');
  put(name, text + TAP); hechos[name] = 'lector';
}
let arm = fs.readFileSync(path.join(base, 'r5snap-armador.js'), 'utf8');
const ancla = 'let mem=null,base=0,busy=null;';
if (arm.split(ancla).length !== 2) throw Error('armador: ancla no única');
arm = arm.replace(ancla, 'try{importScripts("autopista60-filtro.js")}catch(e){console.error("[autopista60] filtro: "+e)}\n' + ancla);
put('r5snap-armador.js', arm); hechos['r5snap-armador.js'] = 'filtro';
fs.copyFileSync('tools/op7/filtro-armador.js', path.join(dest, 'autopista60-filtro.js'));
for (const n of ['scene', 'colas', 'render']) {
  const t = fs.readFileSync(path.join(dest, `r5snap-native60-${n}-arm.js`), 'utf8');
  if (!t.includes('globalThis.__hw60DrawFilter(')) throw Error(n + '-arm: no consulta el filtro');
}
console.log(JSON.stringify({base, dest, hechos}));
