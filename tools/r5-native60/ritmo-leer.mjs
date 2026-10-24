// Claude 2026-10-21: resume temporal.ritmo de un resultado.json de med.mjs (último valor y evolución).
import fs from 'node:fs';
const j = JSON.parse(fs.readFileSync(process.argv[2] + '/resultado.json', 'utf8')), out = [];
const walk = (o, k) => { if (o && typeof o === 'object') { if (k === 'ritmo' && 'errP95' in o) out.push(o); for (const [kk, v] of Object.entries(o)) walk(v, kk); } };
walk(j);
for (const r of out.filter((_, i) => i % 6 === 0 || i === out.length - 1)) console.log(JSON.stringify(r));
