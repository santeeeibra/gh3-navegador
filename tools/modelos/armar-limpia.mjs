// modelos (Claude 2026-10-22): copia limpia = alta100/op2pub (línea publicada, con gancho reloj-audio)
// + 10 materiales sin sombra (r5-scene-mobile/shaders.json) + 8 sombreadores nuevos (modelos/shaders) en el lector de calidad alta.
import fs from 'node:fs';
const D = 'artifacts/d1-wasm/modelos/limpia', F = D + '/r5snap-native60-scene.js';
const all = JSON.parse(fs.readFileSync('artifacts/r5-scene-mobile/shaders.json', 'utf8'));
const SL = Object.fromEntries(Object.entries(all).filter(([, v]) => v.shadowless));
const m = JSON.parse(fs.readFileSync('artifacts/d1-wasm/modelos/shaders/manifest.json', 'utf8'));
const NEW = Object.fromEntries(Object.entries(m).map(([id, v]) => [id, {id, stage: v.stage, constants: v.constants, code: fs.readFileSync(v.wgsl, 'utf8')}]));
let s = fs.readFileSync('artifacts/d1-wasm/alta100/op2pub/r5snap-native60-scene.js', 'utf8');
const a = 'var Oe=O,De=new Set(';
if (s.split(a).length !== 2) throw Error('ancla');
s = s.replace(a, 'var Oe=Object.assign(O,' + JSON.stringify(NEW) + ',' + JSON.stringify(SL) + '),De=new Set(');
fs.writeFileSync(F, s);
console.log('nuevos', Object.keys(NEW).length, 'sin sombra', Object.keys(SL).length);
