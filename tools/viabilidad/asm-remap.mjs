// Viabilidad (Claude 2026-10-16): toma el gh3-web.js de la página actual y le pone las claves ASM_CONSTS del JS enlazado
// con el wasm espía (mismos 4 cuerpos, otras direcciones). Exige mismos cuerpos. Uso: <js actual> <js espía> <salida>
import fs from 'node:fs';
const [curF, spyF, outF] = process.argv.slice(2);
const get = s => { const i = s.indexOf('var ASM_CONSTS = {'), j = s.indexOf('\n};', i); return {i, j, m: [...s.slice(i, j).matchAll(/^(\s*)(\d+): (.*)$/gm)].map(x => [x[2], x[3].replace(/\r$/, '')])}; };
let cur = fs.readFileSync(curF, 'utf8'); const spy = fs.readFileSync(spyF, 'utf8');
const a = get(cur), b = get(spy);
if (a.m.length !== b.m.length) throw Error('distinta cantidad de ASM_CONSTS');
let blk = cur.slice(a.i, a.j);
for (const [k, body] of a.m) { const o = b.m.find(x => x[1] === body); if (!o) throw Error('cuerpo sin par: ' + k);
  blk = blk.replace(new RegExp('^([ \\t]*)' + k + ': ', 'm'), (_, sp) => sp + o[0] + ': '); }
fs.writeFileSync(outF, cur.slice(0, a.i) + blk + cur.slice(a.j));
console.log('ok', a.m.map(x => x[0]).join(','), '→', b.m.map(x => x[0]).join(','));
