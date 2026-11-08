// Servidor WebSocket mínimo (RFC 6455) sin dependencias, para el servidor de respaldo de salas.
import crypto from 'node:crypto';
import {EventEmitter} from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX = 16 * 1024;

export class Conexion extends EventEmitter {
  constructor(socket, head) {
    super();
    this.socket = socket; this.abierta = true; this.ultima = Date.now();
    let buf = head?.length ? Buffer.from(head) : Buffer.alloc(0), partes = [], tam = 0;
    const fallar = (code) => { this.close(code); buf = Buffer.alloc(0); };
    const procesar = () => {
      while (this.abierta) {
        if (buf.length < 2) return;
        const fin = !!(buf[0] & 128), op = buf[0] & 15, masc = !!(buf[1] & 128);
        let len = buf[1] & 127, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (len > MAX) return fallar(1009);
        if (!masc) return fallar(1002);
        if (buf.length < off + 4 + len) return;
        const mask = buf.subarray(off, off + 4), pl = Buffer.from(buf.subarray(off + 4, off + 4 + len));
        for (let i = 0; i < pl.length; i++) pl[i] ^= mask[i & 3];
        buf = buf.subarray(off + 4 + len);
        if (op === 8) { this.close(1000); return; }
        if (op === 9) { this.#marco(10, pl); continue; }
        if (op === 10) continue;
        if (op === 1 || op === 0) {
          partes.push(pl); tam += pl.length;
          if (tam > MAX) return fallar(1009);
          if (fin) { const t = Buffer.concat(partes).toString('utf8'); partes = []; tam = 0; this.emit('message', t); }
        }
      }
    };
    socket.on('data', d => { this.ultima = Date.now(); buf = Buffer.concat([buf, d]); procesar(); });
    socket.on('error', () => {});
    socket.on('close', () => { if (this.abierta) { this.abierta = false; } clearInterval(this.pulso); this.emit('close'); });
    this.pulso = setInterval(() => {
      if (Date.now() - this.ultima > 90000) { socket.destroy(); return; }
      this.#marco(9, Buffer.alloc(0));
    }, 25000);
    if (buf.length) procesar();
  }
  #marco(op, payload) {
    if (!this.socket.writable) return;
    const n = payload.length;
    const h = n < 126 ? Buffer.from([128 | op, n]) : Buffer.from([128 | op, 126, n >> 8, n & 255]);
    this.socket.write(Buffer.concat([h, payload]));
  }
  send(texto) { if (this.abierta) this.#marco(1, Buffer.from(texto, 'utf8')); }
  close(code = 1000, motivo = '') {
    if (!this.abierta) return;
    this.abierta = false;
    const r = Buffer.from(motivo.slice(0, 100), 'utf8'), p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0); r.copy(p, 2);
    this.#marco(8, p);
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 2000).unref();
  }
}

// Completa el handshake y devuelve la conexión (o null si la petición no es válida).
export function aceptar(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade).toLowerCase() !== 'websocket') { socket.destroy(); return null; }
  const acc = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + acc + '\r\n\r\n');
  return new Conexion(socket, head);
}

export function rechazar(socket, status, texto) {
  socket.write('HTTP/1.1 ' + status + ' ' + texto + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  socket.destroy();
}
