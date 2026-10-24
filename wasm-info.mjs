// wasm-info.mjs - SOLO LECTURA. Muestra la estructura de un .wasm sin cargarlo entero.
// Uso: node wasm-info.mjs ruta\al\archivo.wasm
import fs from 'node:fs';

const file = process.argv[2];
if (!file) { console.log('Uso: node wasm-info.mjs ruta\\al\\archivo.wasm'); process.exit(1); }

const fd = fs.openSync(file, 'r');
const total = fs.fstatSync(fd).size;

function readAt(pos, len) {
  const b = Buffer.alloc(len);
  const n = fs.readSync(fd, b, 0, len, pos);
  return b.subarray(0, n);
}
function leb(buf, p) {
  let result = 0, mul = 1, b;
  do { b = buf[p.i++]; result += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
  return result;
}
function str(buf, p) {
  const len = leb(buf, p);
  const s = buf.toString('utf8', p.i, p.i + len);
  p.i += len;
  return s;
}
function limits(buf, p) {
  const flags = leb(buf, p);
  const min = leb(buf, p);
  const max = (flags & 1) ? leb(buf, p) : null;
  return { min, max, shared: !!(flags & 2), mem64: !!(flags & 4) };
}
const PAGE = 65536;
const fmtMem = (m) =>
  `inicial ${m.min} pág (${(m.min * PAGE / 1048576).toFixed(0)} MB), ` +
  `máxima ${m.max === null ? 'sin tope' : m.max + ' pág (' + (m.max * PAGE / 1048576).toFixed(0) + ' MB)'}, ` +
  `compartida(hilos): ${m.shared ? 'SÍ' : 'no'}${m.mem64 ? ', memory64' : ''}`;

const NOMBRES = { 1: 'type', 2: 'import', 3: 'function', 4: 'table', 5: 'memory', 6: 'global',
  7: 'export', 8: 'start', 9: 'element', 10: 'code', 11: 'data', 12: 'datacount', 13: 'tag' };

const head = readAt(0, 8);
if (head.toString('hex') !== '0061736d01000000') {
  console.log('No parece un .wasm válido (encabezado distinto).');
  process.exit(1);
}

const secciones = [];
const customs = [];
const memorias = [];
let features = null;
let producers = null;
let errores = [];

let pos = 8;
while (pos < total) {
  try {
    const h = readAt(pos, 16);
    const p = { i: 1 };
    const id = h[0];
    const size = leb(h, p);
    const bodyStart = pos + p.i;

    if (id === 0) {
      const b = readAt(bodyStart, Math.min(size, 256));
      const q = { i: 0 };
      const name = str(b, q);
      customs.push({ name, size });
      if ((name === 'target_features' || name === 'producers') && size < 1000000) {
        const body = readAt(bodyStart, size);
        const r = { i: 0 };
        str(body, r); // saltar nombre
        if (name === 'target_features') {
          const n = leb(body, r);
          features = [];
          for (let k = 0; k < n; k++) { const pre = String.fromCharCode(body[r.i++]); features.push(pre + str(body, r)); }
        } else {
          const nf = leb(body, r);
          producers = [];
          for (let k = 0; k < nf; k++) {
            const fname = str(body, r);
            const nv = leb(body, r);
            for (let v = 0; v < nv; v++) { const a = str(body, r); const c = str(body, r); producers.push(`${fname}: ${a} ${c}`); }
          }
        }
      }
    } else {
      secciones.push({ nombre: NOMBRES[id] || ('id' + id), size });
      if (id === 5 && size < 1000000) {
        const body = readAt(bodyStart, size);
        const r = { i: 0 };
        const n = leb(body, r);
        for (let k = 0; k < n; k++) memorias.push({ origen: 'definida', ...limits(body, r) });
      }
      if (id === 2 && size < 64 * 1048576) {
        const body = readAt(bodyStart, size);
        const r = { i: 0 };
        const n = leb(body, r);
        for (let k = 0; k < n; k++) {
          const mod = str(body, r);
          const field = str(body, r);
          const kind = body[r.i++];
          if (kind === 0) leb(body, r);
          else if (kind === 1) { r.i++; limits(body, r); }
          else if (kind === 2) memorias.push({ origen: `importada (${mod}.${field})`, ...limits(body, r) });
          else if (kind === 3) { r.i += 2; }
          else if (kind === 4) { r.i++; leb(body, r); }
          else throw new Error('tipo de import desconocido ' + kind);
        }
      }
    }
    pos = bodyStart + size;
  } catch (e) {
    errores.push(`Se cortó en el byte ${pos}: ${e.message}`);
    break;
  }
}

console.log(`Archivo: ${file}`);
console.log(`Tamaño: ${(total / 1048576).toFixed(1)} MB`);
console.log('\n== Secciones (tamaño en MB) ==');
for (const s of secciones) console.log(`  ${s.nombre}: ${(s.size / 1048576).toFixed(2)} MB`);
console.log('\n== Secciones personalizadas ==');
if (!customs.length) console.log('  (ninguna)');
for (const c of customs) console.log(`  ${c.name}: ${(c.size / 1048576).toFixed(2)} MB`);
console.log('\n== Memoria ==');
if (!memorias.length) console.log('  (no encontrada)');
for (const m of memorias) console.log(`  ${m.origen}: ${fmtMem(m)}`);
console.log('\n== Features del objetivo (target_features) ==');
console.log(features ? '  ' + features.join(' ') : '  (sección ausente: NO se puede saber SIMD/atomics desde acá)');
console.log('\n== Quién lo generó (producers) ==');
console.log(producers ? producers.map((x) => '  ' + x).join('\n') : '  (sección ausente)');

const tieneNombres = customs.some((c) => c.name === 'name');
const tieneDwarf = customs.some((c) => c.name.startsWith('.debug'));
console.log('\n== Resumen ==');
console.log(`  Hilos (memoria compartida): ${memorias.some((m) => m.shared) ? 'SÍ' : 'no'}`);
console.log(`  Nombres de funciones (sección name): ${tieneNombres ? 'sí' : 'no'}`);
console.log(`  Info de depuración (.debug_*): ${tieneDwarf ? 'sí (no es build de release)' : 'no'}`);
if (errores.length) console.log('\nAVISO: ' + errores.join('; '));
