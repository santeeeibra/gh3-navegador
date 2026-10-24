// Claude 2026-10-22 (alta100 op7): banda visible en calidad alta = lo mismo que tools/modelos/armar-limpia.mjs
// (10 materiales sin sombra de artifacts/r5-scene-mobile/shaders.json + 8 sombreadores nuevos de modelos/shaders),
// pero en el lector del ARMADOR (r5snap-native60-scene-arm.js), que es donde op5/op7 tienen la tabla de sombreadores.
// Lee el original de --base (alta100/op5) y escribe en --dest (alta100/op7).
// Uso: node tools/op7/armar-banda.mjs [--base dir] [--dest dir]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const base = opt('base', 'artifacts/d1-wasm/alta100/op5'), dest = opt('dest', 'artifacts/d1-wasm/alta100/op7');
const all = JSON.parse(fs.readFileSync('artifacts/r5-scene-mobile/shaders.json', 'utf8'));
const SL = Object.fromEntries(Object.entries(all).filter(([, v]) => v.shadowless));
const m = JSON.parse(fs.readFileSync('artifacts/d1-wasm/modelos/shaders/manifest.json', 'utf8'));
const NEW = Object.fromEntries(Object.entries(m).map(([id, v]) => [id, {id, stage: v.stage, constants: v.constants, code: fs.readFileSync(v.wgsl, 'utf8')}]));
const name = 'r5snap-native60-scene-arm.js';
let s = fs.readFileSync(path.join(base, name), 'utf8');
const a = 'var Oe=O,';
if (s.split(a).length !== 2) throw Error('ancla no única: ' + a);
s = s.replace(a, 'var Oe=Object.assign(O,' + JSON.stringify(NEW) + ',' + JSON.stringify(SL) + '),');
const to = path.join(dest, name); if (fs.existsSync(to)) fs.unlinkSync(to); fs.writeFileSync(to, s);
console.log(JSON.stringify({dest: to, nuevos: Object.keys(NEW).length, sinSombra: Object.keys(SL).length}));
