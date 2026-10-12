// Paquete móvil de DIAGNÓSTICO (Claude, solo local; nunca publicar). Parte del paquete RGBA de Codex tal cual
// (artifacts/mobile-private/GH3-Slow-Ride-privado.gh3mobile, sin modificarlo ni usar su empaquetador) y cambia solo
// archivos de la página: + gh3-diag.js (en <head>), + gh3-touch.js, + gh3-landscape.js, gh3-input.js con setTouch, gh3-web.js con el aviso
// de carga/compilación antepuesto. Los datos del juego se copian por partes (mismos hashes: el iPhone los reutiliza).
// Salida: artifacts/d1-wasm/mobilediag/GH3-Slow-Ride-diag.gh3mobile. Uso: node tools/d1-wasm/mobilediag-build.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
const SRC = 'artifacts/mobile-private/GH3-Slow-Ride-privado.gh3mobile', DIR = 'artifacts/d1-wasm/mobilediag', OUT = DIR + '/GH3-Slow-Ride-diag.gh3mobile';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fd = fs.openSync(SRC, 'r'), pre = Buffer.alloc(12); fs.readSync(fd, pre, 0, 12, 0);
if (pre.toString('latin1', 0, 8) !== 'GH3MOB01') throw Error('No es un paquete móvil');
const hlen = pre.readUInt32LE(8), hbuf = Buffer.alloc(hlen); fs.readSync(fd, hbuf, 0, hlen, 12);
const H = JSON.parse(hbuf.toString('utf8')), body = 12 + hlen, byHash = new Map(H.chunks.map((c) => [c.hash, c]));
const read = (c) => { const b = Buffer.alloc(c.size); fs.readSync(fd, b, 0, c.size, body + c.offset); if (sha(b) !== c.hash) throw Error('Parte dañada en el paquete de origen'); return b; };
const fileOf = (name) => { const f = H.static.find((s) => s.url === '/iphone/private/' + name); if (!f) throw Error('Falta ' + name); return Buffer.concat(f.parts.map((h) => read(byHash.get(h)))); };
// Lo que cambia, con chequeos de que la base sigue siendo la esperada.
const orig = fs.readFileSync('artifacts/d1-wasm/touch/gh3-input.orig.js');
if (sha(fileOf('gh3-input.js')) !== sha(orig)) throw Error('gh3-input.js del paquete cambió: revisar el diff táctil antes de reemplazarlo');
let html = fileOf('index.html').toString('utf8');
const rep = (a, b) => { if (html.split(a).length !== 2) throw Error('index.html cambió: ' + a); html = html.replace(a, b); };
rep('<meta charset="utf-8">', '<meta charset="utf-8">\n<script src="gh3-diag.js"></script>');
rep('<script src="gh3-input.js"></script>', '<script src="gh3-input.js"></script>\n<script src="gh3-touch.js"></script>\n<script src="gh3-landscape.js"></script>');
html = html.replace(/<meta name="viewport" content="[^"]*">/, '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">');
html = html.replace(/<title>[^<]*<\/title>/, '<title>GH3 · diagnóstico móvil</title>');
const web = Buffer.concat([fs.readFileSync(DIR + '/gh3-diag-worker.js'), Buffer.from('\n'), fileOf('gh3-web.js')]);
const changed = { 'index.html': Buffer.from(html), 'gh3-input.js': fs.readFileSync('artifacts/d1-wasm/touch/gh3-input.js'), 'gh3-web.js': web,
  'gh3-touch.js': fs.readFileSync('artifacts/d1-wasm/touch/gh3-touch.js'), 'gh3-diag.js': fs.readFileSync(DIR + '/gh3-diag.js'),
  'gh3-landscape.js': fs.readFileSync(DIR + '/gh3-landscape.js') };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
// Nuevo índice: partes del origen que se siguen usando (en el mismo orden) + partes nuevas al final.
const fresh = new Map(), statics = [];
for (const f of H.static) { const name = f.url.split('/').pop(); if (!changed[name]) statics.push(f); }
for (const [name, bytes] of Object.entries(changed)) {
  const parts = [];
  for (let o = 0; o < bytes.length; o += 2 * 1048576) { const b = bytes.subarray(o, o + 2 * 1048576), h = sha(b); if (!byHash.has(h)) fresh.set(h, b); parts.push(h); }
  statics.push({ url: '/iphone/private/' + name, type: types['.' + name.split('.').pop()], size: bytes.length, parts });
}
const used = new Set(statics.flatMap((s) => s.parts));
for (const id of [...H.catalog.packages.base.files, ...H.catalog.packages.slowride.files]) for (const c of H.catalog.files[id].chunks) used.add(c.hash);
const keep = H.chunks.filter((c) => used.has(c.hash));
let off = 0; const chunks = [];
for (const c of keep) { chunks.push({ hash: c.hash, size: c.size, offset: off }); off += c.size; }
for (const [h, b] of fresh) { chunks.push({ hash: h, size: b.length, offset: off }); off += b.length; }
const header = { ...H, title: 'Slow Ride · diagnóstico móvil + táctil (Claude)', diag: true, touch: true, static: statics, chunks };
const hb = Buffer.from(JSON.stringify(header)), p2 = Buffer.alloc(12); p2.write('GH3MOB01'); p2.writeUInt32LE(hb.length, 8);
const out = fs.openSync(OUT + '.tmp', 'w');
try {
  fs.writeSync(out, p2); fs.writeSync(out, hb);
  for (const c of keep) fs.writeSync(out, read(byHash.get(c.hash)));
  for (const b of fresh.values()) fs.writeSync(out, b);
} finally { fs.closeSync(out); fs.closeSync(fd); }
fs.renameSync(OUT + '.tmp', OUT);
const result = { file: OUT, size: fs.statSync(OUT).size, source: SRC, sourceSize: fs.statSync(SRC).size, chunks: chunks.length, newChunks: fresh.size, newBytes: [...fresh.values()].reduce((n, b) => n + b.length, 0), changed: Object.keys(changed) };
fs.writeFileSync(DIR + '/package-result.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
