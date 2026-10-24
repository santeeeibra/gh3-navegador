// Claude 2026-10-22 (alta100 op7): lleva al gh3-web.js PUBLICADO el cambio que trae enlazar con el d2_r5_frame.o del hash.
// Compara dos salidas crudas del enlace (sin hash = watchtf/control-web, fac60f0b; con hash = op7/web):
//   - ASM_CONSTS: mismas funciones en el mismo orden, solo cambian las direcciones -> renombra las claves en el publicado.
//   - Fuera de ASM_CONSTS: solo líneas AGREGADAS (resourceHash, export _r5l_hash128) -> se insertan tras las mismas 3 líneas previas.
// Cualquier otra diferencia corta con error. Control: con viejo = nuevo el resultado debe ser igual al publicado byte a byte.
// Uso: node tools/op7/hash-js.mjs <crudo-sin-hash.js> <crudo-con-hash.js> <publicado.js> <salida.js>
import fs from 'node:fs';
import {splitAsmConsts as split} from '../sincronia/asm-consts.mjs';
const [oldP, newP, pubP, outP] = process.argv.slice(2);
const read = p => fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n');
const pubRaw = fs.readFileSync(pubP, 'utf8'), crlf = pubRaw.includes('\r\n');
const old = split(read(oldP)), next = split(read(newP)), pub = split(pubRaw.replaceAll('\r\n', '\n'));

// 1) ASM_CONSTS por orden.
if (old.entries.length !== next.entries.length || old.entries.length !== pub.entries.length) throw Error('Distinta cantidad de ASM_CONSTS');
// El publicado tiene las mismas claves que el crudo pero en otro orden (merge-js): se renombra por clave.
const ren = new Map(old.entries.map((e, i) => {
  if (e.body !== next.entries[i].body) throw Error('Cuerpo ASM distinto en posición ' + i);
  return [e.key, next.entries[i].key];
}));
for (const e of pub.entries) if (!ren.has(e.key)) throw Error('Clave publicada ausente en el crudo: ' + e.key);
const block = 'var ASM_CONSTS = {\n' + pub.entries.map(e => `  ${ren.get(e.key)}: ${e.body}`).join(',\n') + '\n};';
const pubText = pubRaw.replaceAll('\r\n', '\n');
const origBlock = pubText.slice(pub.start, pub.end);

// 2) Fuera de ASM_CONSTS: solo agregados.
const A = old.outside.split('\n'), B = next.outside.split('\n'), adds = [];
let i = 0, j = 0;
while (j < B.length) {
  if (i < A.length && A[i] === B[j]) { i++; j++; continue; }
  const ctx = A.slice(Math.max(0, i - 3), i).join('\n');
  if (adds.length && adds.at(-1).at === i) adds.at(-1).lines.push(B[j]); else adds.push({at: i, ctx, lines: [B[j]]});
  j++;
}
if (i !== A.length) throw Error('Hay líneas QUITADAS fuera de ASM_CONSTS (no solo agregados)');
let outside = pub.outside;
for (const a of adds) {
  const k = outside.split(a.ctx + '\n').length - 1;
  if (k !== 1) throw Error(`Contexto no único (${k}) para insertar: ${a.lines[0].slice(0, 80)}`);
  outside = outside.replace(a.ctx + '\n', a.ctx + '\n' + a.lines.join('\n') + '\n');
}
// Reponer el bloque ASM en su lugar (outside tiene la marca 'ASM_CONSTS' en vez del bloque).
const mark = outside.indexOf('ASM_CONSTS', outside.indexOf(pubText.slice(Math.max(0, pub.start - 200), pub.start)));
let text = outside.slice(0, mark) + block + outside.slice(mark + 'ASM_CONSTS'.length);
if (!adds.length && block !== origBlock) throw Error('Control: el bloque ASM reconstruido difiere del publicado');
if (crlf) text = text.replaceAll('\n', '\r\n');
fs.writeFileSync(outP, text);
console.log(JSON.stringify({asm: old.entries.length, claves: [...ren].map(([a, b]) => a + '>' + b), agregados: adds.map(a => ({tras: a.ctx.split('\n').at(-1).slice(0, 60), lineas: a.lines.length})), crlf}));
