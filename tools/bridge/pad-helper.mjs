// Ayudante local del puente: recibe el estado del mando desde la página del anfitrión (HTTP, solo 127.0.0.1)
// y se lo manda por UDP (127.0.0.1:5183) a la xinput1_4.dll intermediaria que está junto al juego.
import http from 'node:http';
import dgram from 'node:dgram';
const PUERTO = 5182;
const PERMITIDOS = new Set(['https://riff-duel.vercel.app', 'http://127.0.0.1:5181', 'http://localhost:5181', 'http://127.0.0.1:5173', 'http://localhost:5173']);
const udp = dgram.createSocket('udp4');
const CERO = {btn: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0};
let est = {...CERO};
let ultimo = Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, Number.isFinite(v) ? v : 0));
function enviar() {
  const b = Buffer.alloc(12);
  b.writeUInt16LE(est.btn & 0xFFFF, 0); b.writeUInt8(est.lt, 2); b.writeUInt8(est.rt, 3);
  b.writeInt16LE(est.lx, 4); b.writeInt16LE(est.ly, 6); b.writeInt16LE(est.rx, 8); b.writeInt16LE(est.ry, 10);
  udp.send(b, 5183, '127.0.0.1');
}
const hayEntrada = () => est.btn || est.lt || est.rt || est.lx || est.ly || est.rx || est.ry;
// Reenvío periódico (la DLL suelta todo si pasan 3 s sin señal). Si el anfitrión desaparece 10 s, suelta todo.
setInterval(() => {
  if (hayEntrada() && Date.now() - ultimo > 10000) est = {...CERO};
  if (hayEntrada()) enviar();
}, 100);

http.createServer((q, r) => {
  const origen = q.headers.origin;
  if (origen && !PERMITIDOS.has(origen)) { r.writeHead(403).end('origen no permitido'); return; }
  const cab = origen ? {'Access-Control-Allow-Origin': origen, 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': '*'} : {};
  if (q.method === 'OPTIONS') { r.writeHead(204, cab).end(); return; }
  const u = new URL(q.url, 'http://x');
  ultimo = Date.now();
  if (u.pathname === '/s') {
    const g = k => Number(u.searchParams.get(k));
    est = {btn: clamp(g('b'), 0, 0xFFFF) | 0, lt: clamp(g('lt'), 0, 255) | 0, rt: clamp(g('rt'), 0, 255) | 0,
           lx: clamp(g('lx'), -32767, 32767) | 0, ly: clamp(g('ly'), -32767, 32767) | 0,
           rx: clamp(g('rx'), -32767, 32767) | 0, ry: clamp(g('ry'), -32767, 32767) | 0};
    enviar(); r.writeHead(200, cab).end('ok');
  } else if (u.pathname === '/reset') {
    est = {...CERO}; enviar(); r.writeHead(200, cab).end('ok');
  } else r.writeHead(404, cab).end('no existe');
}).listen(PUERTO, '127.0.0.1', () => console.log('Ayudante de mando activo en 127.0.0.1:' + PUERTO + ' (cerrá esta ventana para detenerlo)'));
