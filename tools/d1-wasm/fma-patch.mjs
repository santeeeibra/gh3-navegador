// Claude 2026-10-21 (alta100 op4): WebAssembly no tiene multiplicar-sumar fusionado; la libc de emscripten hace fma()/fmaf()
// por software (lento). El código recompilado de GH3 la llama muchísimo (fmadd/fmsub de PowerPC).
// Este script reescribe SOLO el cuerpo de fma/fmaf del .wasm ya armado por: a*b+c común (un redondeo más; diferencia mínima).
// Sin recompilar. Uso: node tools/d1-wasm/fma-patch.mjs <entrada.wasm> <salida.wasm> [--ver]
import fs from 'node:fs';
const [inp, out, ...flags] = process.argv.slice(2), b = fs.readFileSync(inp);
let p = 8;
const leb = () => { let r = 0, s = 0, x; do { x = b[p++]; r |= (x & 127) << s; s += 7; } while (x & 128); return r >>> 0; };
const enc = n => { const o = []; do { let x = n & 127; n >>>= 7; if (n) x |= 128; o.push(x); } while (n); return Buffer.from(o); };
const secs = [];
while (p < b.length) { const id = b[p++], size = leb(), start = p; secs.push({id, start, end: start + size, head: null}); p = start + size; }
const at = s => { p = s.start; };
// Tipos, importaciones (cuántas funciones importadas), funciones (tipo de cada una), nombres.
const types = [], funcType = []; let imported = 0; const names = new Map();
for (const s of secs) {
  if (s.id === 1) { at(s); for (let n = leb(), i = 0; i < n; i++) { p++; const np = leb(), ps = [...b.subarray(p, p + np)]; p += np; const nr = leb(), rs = [...b.subarray(p, p + nr)]; p += nr; types.push({ps, rs}); } }
  if (s.id === 2) { at(s); for (let n = leb(), i = 0; i < n; i++) { for (let j = 0; j < 2; j++) { const l = leb(); p += l; } const k = b[p++]; if (k === 0) { leb(); imported++; } else if (k === 1) { p++; const f = b[p++]; leb(); if (f & 1) leb(); } else if (k === 2) { const f = b[p++]; leb(); if (f & 1) leb(); } else if (k === 3) { p += 2; } else if (k === 4) { p++; leb(); } } }
  if (s.id === 3) { at(s); for (let n = leb(), i = 0; i < n; i++) funcType.push(leb()); }
  if (s.id === 0) { at(s); const nl = leb(), nm = b.toString('utf8', p, p + nl); p += nl; if (nm !== 'name') continue;
    while (p < s.end) { const sub = b[p++], sz = leb(), e = p + sz; if (sub === 1) { for (let n = leb(), i = 0; i < n; i++) { const idx = leb(), l = leb(); names.set(b.toString('utf8', p, p + l), idx); p += l; } } p = e; } }
}
const F64 = 0x7c, F32 = 0x7d, want = {fma: F64, fmaf: F32}, target = new Map();
if (flags.includes("--lista")) { for (const [k, v] of names) if (/fma|normalize/i.test(k) && k.length < 40) console.log(k, v, JSON.stringify(types[funcType[v - imported]])); process.exit(0); }
for (const [nm, t] of Object.entries(want)) {
  const idx = names.get(nm); if (idx === undefined) { console.log(nm + ': no está'); continue; }
  const ty = types[funcType[idx - imported]];
  if (ty.ps.join() !== [t, t, t].join() || ty.rs.join() !== String(t)) throw Error(nm + ': firma inesperada ' + JSON.stringify(ty));
  target.set(idx - imported, t); console.log(nm + ': función ' + idx + ' (definida ' + (idx - imported) + ')');
}
if (flags.includes('--ver') || !target.size) process.exit(0);
// Cuerpo nuevo: sin locales; local.get 0, local.get 1, mul, local.get 2, add, end.
const body = t => { const mul = t === F64 ? 0xa2 : 0x94, add = t === F64 ? 0xa0 : 0x92; const c = Buffer.from([0x00, 0x20, 0, 0x20, 1, mul, 0x20, 2, add, 0x0b]); return Buffer.concat([enc(c.length), c]); };
const code = secs.find(s => s.id === 10); at(code); const n = leb(), parts = [enc(n)]; let last = p;
for (let i = 0; i < n; i++) { const st = p, sz = leb(), e = p + sz; if (target.has(i)) { parts.push(b.subarray(last, st), body(target.get(i))); last = e; } p = e; }
parts.push(b.subarray(last, code.end));
const payload = Buffer.concat(parts);
const before = b.subarray(0, code.start), idPos = before.lastIndexOf(10, code.start - 1);
// Reescribir la cabecera de la sección de código (id + tamaño LEB).
let h = code.start - 1; while (b[h - 1] & 128 && h > 0) h--; // inicio del LEB del tamaño
const outBuf = Buffer.concat([b.subarray(0, h - 1), Buffer.from([10]), enc(payload.length), payload, b.subarray(code.end)]);
fs.writeFileSync(out, outBuf); console.log(JSON.stringify({out, antes: b.length, despues: outBuf.length}));
