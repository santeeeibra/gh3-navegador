// Muestra por que la capa de la autopista se apago (st.hides de autopista60.js) en la ultima corrida con --manual.
import fs from 'node:fs'; import path from 'node:path';
const base = 'artifacts/gh3-liviano/accesos', d = process.argv[2] || fs.readdirSync(base).filter(x => fs.existsSync(path.join(base, x, 'resultado.json'))).sort().at(-1);
const r = JSON.parse(fs.readFileSync(path.join(base, d, 'resultado.json'), 'latin1').replace(/\0/g, ''));
const m = r.muestras.filter(s => s.hides && s.hides.length), last = m.at(-1);
const t0 = r.muestras.find(s => s.clock > 0)?.ms ?? 0, wall0 = r.muestras.find(s => s.clock > 0);
console.log('Carpeta:', d, '| apagones registrados:', last ? last.hides.length : 0);
(last?.hides || []).forEach(h => console.log(new Date(h.at).toLocaleTimeString(), '|', h.why, '| duro', h.ms ?? '?', 'ms'));
