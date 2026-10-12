#!/usr/bin/env node
// Manifiesto: extrae las líneas [m2-ucode] de un registro m2 a archivos shader_<HASH>.ucode.bin.<vert|frag>,
// con el mismo contenido que Shader::DumpUcode del nativo (dwords de ucode_data() en little-endian).
// Control: compara cada archivo contra los volcados nativos de artifacts/g0 cuando existen (deben ser idénticos).
// Uso: node tools/manifest/m2-ucode.mjs <run.log> <carpeta-salida>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [logPath, outDir] = process.argv.slice(2);
if (!logPath || !outDir) { console.error('uso: m2-ucode.mjs <run.log> <carpeta-salida>'); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });
const native = new Map();
for (const d of ['g0-native-1', 'g0-native-3', 'g0-native-slowride', 'g0-native-slowride2']) {
  const dir = path.join(ROOT, 'artifacts', 'g0', d, 'shaders');
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (/^shader_[0-9A-F]{16}\.ucode\.bin\.(vert|frag)$/.test(f)) native.set(f, path.join(dir, f));
}
const r = { written: 0, sameAsNative: 0, differentFromNative: [], newVsNative: [], badLength: [] };
for (const l of fs.readFileSync(logPath, 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\[m2-ucode\] (vert|frag) ([0-9A-F]{16}) dwords=(\d+) hex=([0-9A-F]*)$/);
  if (!m) continue;
  const [, stage, hash, n, hex] = m;
  if (hex.length !== +n * 8) { r.badLength.push(hash); continue; }
  const buf = Buffer.alloc(+n * 4);
  for (let i = 0; i < +n; i++) buf.writeUInt32LE(parseInt(hex.slice(i * 8, i * 8 + 8), 16), i * 4);
  const name = `shader_${hash}.ucode.bin.${stage}`;
  fs.writeFileSync(path.join(outDir, name), buf); r.written++;
  if (native.has(name)) { if (fs.readFileSync(native.get(name)).equals(buf)) r.sameAsNative++; else r.differentFromNative.push(name); }
  else r.newVsNative.push({ name, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex') });
}
fs.writeFileSync(path.join(outDir, 'ucode-check.json'), JSON.stringify(r, null, 1));
console.log(JSON.stringify({ ...r, newVsNative: r.newVsNative.map((x) => x.name) }, null, 1));
process.exit(r.differentFromNative.length || r.badLength.length ? 1 : 0);
