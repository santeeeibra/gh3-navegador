// Notas de un tema (dificultad medium por defecto) en un rango de tiempo. Solo lectura de la copia del juego.
// Uso: node tools/re/chart.mjs <tema> [desde_ms] [hasta_ms] [dificultad]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {inflateRawSync} from 'node:zlib';
const [song, from = 0, to = 1e9, diff = 'medium'] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync('artifacts/all-songs/server-config.json', 'utf8'));
const cc = {window: {}};
vm.runInNewContext(fs.readFileSync('tools/d1-wasm/gh3-song.js', 'utf8'), cc);
const raw = inflateRawSync(fs.readFileSync(path.join(config.game, `DATA/COMPRESSED/SONGS/${song}_song.pak.xen`)));
const chart = cc.window.gh3Song.parseSongPak(new Uint8Array(raw), song, diff);
const frets = m => ['V', 'R', 'A', 'Z', 'N'].filter((_, i) => m & (1 << i)).join('') || '-';
let i = 0;
for (const n of chart.notes) {
  i++;
  if (n.t < +from || n.t > +to) continue;
  console.log(`#${i}\t${n.t}\tlargo ${n.len}\t${frets(n.mask ?? n.m ?? 0)}\t${JSON.stringify(n)}`);
}
console.log(`total ${chart.notes.length} notas`);
