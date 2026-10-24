// Claude 2026-10-23 (shaders de fábrica): junta los pipelines.jsonl de corridas med.mjs --pipelista en la lista
// native60-pipelines.json (sin repetidos, misma clave que preload.mjs descKey).
// Uso: node tools/shaders-fabrica/juntar.mjs <salida.json> <carpeta de corrida>...
import fs from 'node:fs';
const [outFile, ...runs] = process.argv.slice(2);
const key = d => JSON.stringify([d.vs, d.ps, d.blend, d.raster & 7, d.depth, d.stencil >>> 8, d.writeMask]);
const map = new Map(), prev = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')).pipelines || [] : [];
for (const d of prev) map.set(key(d), d);
const antes = map.size;
for (const r of runs) {
  const f = r + '/pipelines.jsonl'; if (!fs.existsSync(f)) { console.log('sin lista: ' + r); continue; }
  let n = 0; for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (line.trim()) { const {d} = JSON.parse(line); if (!map.has(key(d))) { map.set(key(d), d); n++; } }
  console.log(r + ': ' + n + ' nuevos');
}
fs.writeFileSync(outFile, JSON.stringify({version: 1, pipelines: [...map.values()]}));
console.log('total ' + map.size + ' (antes ' + antes + '), ' + fs.statSync(outFile).size + ' bytes');
