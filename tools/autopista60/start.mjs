// autopista60 (Claude, 2026-10-14): abre la copia de prueba (autopista y notas a 60 con el reloj del audio) en
// http://127.0.0.1:5455/gh3/ (desde 2026-10-14: la copia publicable autopista60-pub, pantalla nueva de Codex) con el servidor local de siempre (tools/ui3/serve.mjs) y la abre en Edge.
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const port = 5455, url = `http://127.0.0.1:${port}/gh3/`;
const ours = async () => { try { return (await fetch(url + 'autopista60.js')).ok && (await fetch(url + 'gh3-layout.js')).ok; } catch { return false; } }; // copia publicable (pantalla nueva)
if (!(await ours())) {
  let busy = false; try { await fetch(url); busy = true; } catch {}
  if (busy) { console.log(`\nEl puerto ${port} lo usa otro servidor. Cerrá esa ventana negra y volvé a abrir este acceso.\n`); process.exit(1); }
  const p = spawn(process.execPath, ['tools/ui3/serve.mjs', 'artifacts/d1-wasm/autopista60-pub/demo', String(port)], { stdio: 'inherit', windowsHide: true });
  p.on('error', (e) => console.error(e));
  for (const start = Date.now(); !(await ours());) { if (Date.now() - start > 10000) throw Error('No arrancó el servidor local.'); await new Promise((r) => setTimeout(r, 100)); }
}
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((f) => fs.existsSync(f));
if (edge) spawn(edge, ['--new-window', url], { windowsHide: true, stdio: 'ignore' }).unref(); else console.log('Abrí ' + url + ' en Edge.');
console.log('GH3 abierto (prueba autopista a 60 con el reloj del audio). Dejá esta ventana abierta mientras jugás.');
