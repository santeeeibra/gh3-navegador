// Parche "hora más barata" (paso 2 del plan de velocidad en alta, 2026-10-24): sobre gh3-web.js de una copia aislada.
// 1) _emscripten_get_now: timeOrigin se lee una vez (es constante) en vez de en cada llamada.
// 2) _clock_time_get: sin bigintToI53Checked (el parámetro de precisión se ignora).
import fs from 'node:fs';
const f = process.argv[2]; let s = fs.readFileSync(f, 'utf8');
const rep = (a, b) => { if (s.split(a).length !== 2) throw new Error('no encontrado una vez: ' + a); s = s.replace(a, () => b); };
rep('var _emscripten_get_now = () => performance.timeOrigin + performance.now();', 'var __gh3T0 = performance.timeOrigin;\nvar _emscripten_get_now = () => __gh3T0 + performance.now();');
rep('  ignored_precision = bigintToI53Checked(ignored_precision);\n  ptime >>>= 0;', '  ptime >>>= 0;');
fs.writeFileSync(f, s); console.log('parche de hora aplicado a', f);
