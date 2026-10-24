// Claude 2026-10-23 (banda/torsos): agrega al lector del armador la variante SIN SOMBRA del material 18D176E1514D82CA
// (actor, 16 muestras PCF de los mapas 14/15; mismo método que las 3 de actores en tools/r5-scene-mobile/shadowless.mjs).
// Uso: node tools/op7/armar-torsos.mjs --dest <demo> [--ids 18D176E1514D82CA,...]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const dest = opt('dest'), ids = opt('ids', '18D176E1514D82CA').split(',');
const m = JSON.parse(fs.readFileSync('artifacts/d1-wasm/modelos/shaders/manifest.json', 'utf8'));
const V = {};
for (const id of ids) {
  let code = fs.readFileSync(m[id].wgsl, 'utf8'), n = 0;
  code = code.replace(/textureSample(?:Grad|Level)\(xe_texture(?:14|15)_[^,]+,[\s\S]*?(?=;)/g, c => { if (!c.endsWith(')')) throw Error('muestra'); n++; return 'vec4<f32>(1f)'; });
  if (n !== 16) throw Error('muestras ' + id + ':' + n);
  // Chrome rechaza dpdyCoarse en flujo no uniforme (este sombreador nunca se había compilado): se apaga ese chequeo.
  if (!code.includes('derivative_uniformity')) code = 'diagnostic(off, derivative_uniformity);' + String.fromCharCode(10) + code;
  V[id] = {id, stage: m[id].stage, constants: m[id].constants, code, shadowless: true};
}
const f = path.join(dest, 'r5snap-native60-scene-arm.js'); let s = fs.readFileSync(f, 'utf8');
const a = 'var Oe=Object.assign(O,';
if (s.split(a).length !== 2) throw Error('ancla');
// V debe ir AL FINAL del Object.assign (pisa a la version con sombra de NEW): cerrar el parentesis por balance
const st = s.indexOf(a) + a.indexOf('('); let d = 0, p = st, q = false, esc = false;
for (; p < s.length; p++) { const ch = s[p]; if (q) { if (esc) esc = false; else if (ch.charCodeAt(0) === 92) esc = true; else if (ch === '"') q = false; continue; } if (ch === '"') q = true; else if (ch === '(') d++; else if (ch === ')' && !--d) break; }
s = s.slice(0, p) + ',' + JSON.stringify(V) + s.slice(p);
fs.writeFileSync(f, s); console.log(JSON.stringify({ids}));
