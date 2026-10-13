// Servidor estático de la página vigente (web/gh3-native60) para pruebas SIN el juego: no hay wasm, chunks ni bundles
// del juego en el repo; lo que falte responde 404. Registra cada pedido para comprobar qué se descargó y cuándo.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {chromium} from 'playwright';

const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json'};

export async function serveWeb({root = 'web/gh3-native60', routes = {}} = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    requests.push({path: url.pathname, search: url.search, at: Date.now()});
    for (const [k, v] of Object.entries({'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin', 'Cache-Control': 'no-store'})) res.setHeader(k, v);
    const route = routes[url.pathname];
    if (route) { const r = typeof route === 'function' ? route(url) : route; res.setHeader('Content-Type', r.type || 'text/html; charset=utf-8'); res.end(r.body); return; }
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
    if (!file.startsWith(path.resolve(root) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('no'); return; }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((r) => server.close(r))};
}

// Nube: Chromium preinstalado (/opt/pw-browsers/chromium). PC de Santi: Edge, como las pruebas anteriores.
export function launch(args = []) {
  const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : null);
  return chromium.launch({headless: true, args: ['--enable-unsafe-webgpu', ...args], ...(exe ? {executablePath: exe} : {channel: 'msedge'})});
}

export const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
// iPhone 11 en horizontal (896×414 CSS px, dpr 2). Emulación: NO equivale a la prueba física.
export const IPHONE11_LANDSCAPE = {userAgent: IPHONE_UA, viewport: {width: 896, height: 414}, deviceScaleFactor: 2, hasTouch: true, isMobile: true};

export function checker(report) {
  return (name, ok, extra) => {
    report.checks.push({name, ok: !!ok, ...(extra === undefined ? {} : {extra})});
    console.log((ok ? 'OK   ' : 'FALLA ') + name + (extra === undefined ? '' : ' ' + JSON.stringify(extra)));
    if (!ok) report.failed = (report.failed || 0) + 1;
  };
}
