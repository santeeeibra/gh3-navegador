// R5L: lee los mini-archivos guardados por test-consumer.js con el lector de Codex (solo lectura) y cuenta
// eventos por cuadro, draws del par de menú 2D y motivos. Uso: node tools/d1-wasm/r5live/check-frames.mjs <carpeta> [salida.json]
import fs from 'node:fs';
import path from 'node:path';
import {readFrameCapture, replayEvents} from '../../r5-menu/frame-reader.mjs';
import {createHash} from '../../r5-menu/hash.mjs';

const [dir, outArg] = process.argv.slice(2);
const hash = await createHash();
const MENU_VS = 0xB43CF443883B8351n, MENU_PS = 0x526B394DE2AB8891n;
const rows = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.r5f')).sort()) {
  const buf = fs.readFileSync(path.join(dir, f));
  const row = {file: f, bytes: buf.length};
  try {
    const cap = readFrameCapture(buf, {hash});
    const ev = [...replayEvents(cap, 0)];
    const draws = ev.filter(e => e.type === 'draw'), copies = ev.filter(e => e.type === 'copy');
    const menu = draws.filter(d => d.vs === MENU_VS && d.ps === MENU_PS);
    const pairs = {};
    for (const d of draws) { const k = (d.vs ?? 0n).toString(16) + '/' + (d.ps ?? 0n).toString(16); pairs[k] = (pairs[k] ?? 0) + 1; }
    Object.assign(row, {ok: true, frames: cap.frames?.length, events: ev.length, draws: draws.length, issued: draws.filter(d => d.issued).length,
      copies: copies.length, menuPairDraws: menu.length, texturesWithBase: draws.flatMap(d => d.textures ?? []).filter(t => t.baseBytes).length,
      topPairs: Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 5)});
  } catch (e) { Object.assign(row, {ok: false, error: String(e && e.message || e)}); }
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (outArg) fs.writeFileSync(outArg, JSON.stringify(rows, null, 2));
