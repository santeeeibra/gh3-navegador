// Paso D4: servidor LOCAL (127.0.0.1) con COOP/COEP para SharedArrayBuffer. Sirve solo la página y el
// programa compilado; la carpeta del juego la elige el usuario en la página y no pasa por el servidor.
// NO publicar: gh3-web.wasm contiene código del juego. Uso: node tools/d1-wasm/serve-d4.mjs [puerto]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
const root = process.env.D4_ROOT ? resolve(process.env.D4_ROOT) : resolve(fileURLToPath(new URL('../../artifacts/d1-wasm/d4/', import.meta.url)));
const allowed = { '/': 'index.html', '/index.html': 'index.html', '/gh3-web.js': 'gh3-web.js', '/gh3-web.wasm': 'gh3-web.wasm', '/gh3-input.js': 'gh3-input.js', '/gh3-song.js': 'gh3-song.js' };  // C1: controles; canción híbrida
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.wasm': 'application/wasm' };
const port = Number(process.argv[2] || process.env.PORT || 5178);
createServer((req, res) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cache-Control', 'no-store');
  const pathname = new URL(req.url, 'http://localhost').pathname;
  // R5snap: consumidores locales del snapshot (scripts clásicos r5snap-*.js de esta carpeta; ?r5consumer=).
  const name = allowed[pathname] || (/^\/r5snap-[A-Za-z0-9_.-]+\.js$/.test(pathname) ? pathname.slice(1) : undefined);
  if (!name) { res.writeHead(404).end(); return; }
  const path = resolve(root, name);
  try {
    res.writeHead(200, { 'Content-Type': types[extname(path)], 'Content-Length': statSync(path).size });
    createReadStream(path).pipe(res);
  } catch { res.writeHead(404).end(); }
}).listen(port, '127.0.0.1', () => console.log(`D4: http://127.0.0.1:${port}/`));
