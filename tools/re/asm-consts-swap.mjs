// Lleva al gh3-web.js publicado las claves nuevas de ASM_CONSTS de un enlace nuevo.
// Exige que el JS enlazado viejo y el nuevo difieran SOLO en esas claves. Uso: <viejo> <nuevo> <publicado> <salida>
import fs from 'node:fs';
const [oldF, newF, pubF, outF] = process.argv.slice(2);
const CR = String.fromCharCode(13);
const a = fs.readFileSync(oldF, 'utf8').split('\n'), b = fs.readFileSync(newF, 'utf8').split('\n');
if (a.length !== b.length) throw Error('el JS enlazado cambió de largo: revisar a mano');
const pairs = [];
for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) {
  const ma = a[i].split(CR)[0].match(/^(\s*)(\d+): (.*)$/), mb = b[i].split(CR)[0].match(/^(\s*)(\d+): (.*)$/);
  if (!ma || !mb || ma[3] !== mb[3]) throw Error('diferencia que no es de ASM_CONSTS en la línea ' + (i + 1));
  pairs.push([ma[2], mb[2], ma[3]]);
}
let pub = fs.readFileSync(pubF, 'utf8');
for (const [o, n, body] of pairs) {
  const k = `${o}: ${body.slice(0, 40)}`;
  if (pub.split(k).length !== 2) throw Error('clave no única en el publicado: ' + o);
  pub = pub.replace(k, `${n}: ${body.slice(0, 40)}`);
}
fs.writeFileSync(outF, pub);
console.log(`JS publicado con ${pairs.length} clave(s) ASM_CONSTS nuevas: ${pairs.map(p => p[0] + '→' + p[1]).join(' ')}`);
