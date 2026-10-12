// Extrae la imagen PE descifrada de un default.xex (XEX2) para análisis estático.
// Solo lee el .xex; escribe la salida donde se indique (usar artifacts/, nunca la carpeta del juego).
// Uso: node tools/ghidra/xex-extract.mjs <default.xex> <salida.pe | -> [lzx-raw-out]
// Sin LZX propio: si la compresión es "normal" (LZX), guarda el flujo LZX de-bloqueado en
// [lzx-raw-out] para descomprimirlo con lzx.cpp de rexglue (tools/ghidra/lzx-unpack.cpp).
import fs from 'node:fs';
import crypto from 'node:crypto';

const [xexPath, outPath, lzxOut] = process.argv.slice(2);
if (!xexPath || !outPath) { console.error('uso: xex-extract.mjs <xex> <out|-> [lzx-raw]'); process.exit(2); }
const x = fs.readFileSync(xexPath);
const u32 = (o) => x.readUInt32BE(o);
if (x.toString('latin1', 0, 4) !== 'XEX2') throw new Error('no es XEX2');
const headerSize = u32(8), secOff = u32(0x10), count = u32(0x14);
const opt = new Map();
for (let i = 0; i < count; i++) opt.set(u32(0x18 + i * 8), u32(0x18 + i * 8 + 4));
const ffi = opt.get(0x3ff), base = opt.get(0x10201), entry = opt.get(0x10100);
const encType = x.readUInt16BE(ffi + 4), compType = x.readUInt16BE(ffi + 6), infoSize = u32(ffi);
const imageSize = u32(secOff + 4), loadAddr = u32(secOff + 0x110);
const RETAIL = Buffer.from('20B185A59D28FDC340583FBB0896BF91', 'hex');
const dec = (key, data) => { const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16)); d.setAutoPadding(false); return Buffer.concat([d.update(data), d.final()]); };
const session = dec(RETAIL, x.subarray(secOff + 0x150, secOff + 0x160));
const info = { headerSize, base: (base ?? loadAddr) >>> 0, loadAddr, entry, imageSize, encType, compType, infoSize, len: x.length };
console.log(JSON.stringify(Object.fromEntries(Object.entries(info).map(([k, v]) => [k, typeof v === 'number' ? '0x' + v.toString(16) : v]))));
if (outPath === '-') process.exit(0);

let body = x.subarray(headerSize);
if (encType === 1) body = dec(session, body.subarray(0, body.length & ~15));
let img;
if (compType === 0) img = body;
else if (compType === 1) { // basic: bloques datos + ceros
  img = Buffer.alloc(imageSize); let p = 0, d = 0;
  for (let n = 0; n < (infoSize - 8) / 8; n++) {
    const ds = u32(ffi + 8 + n * 8), zs = u32(ffi + 12 + n * 8);
    body.copy(img, d, p, p + ds); p += ds; d += ds + zs;
  }
} else if (compType === 2) { // normal: de-bloquear y dejar el LZX crudo
  const window = u32(ffi + 8); let blockSize = u32(ffi + 12), hash = x.subarray(ffi + 16, ffi + 36);
  const out = []; let p = 0;
  while (blockSize) {
    const blk = body.subarray(p, p + blockSize);
    if (!crypto.createHash('sha1').update(blk).digest().equals(hash)) throw new Error('hash de bloque no coincide (clave?)');
    const nextSize = blk.readUInt32BE(0), nextHash = blk.subarray(4, 24);
    let q = 24;
    for (;;) { const cs = blk.readUInt16BE(q); q += 2; if (!cs) break; out.push(blk.subarray(q, q + cs)); q += cs; }
    p += blockSize; blockSize = nextSize; hash = nextHash;
  }
  const raw = Buffer.concat(out);
  if (!lzxOut) throw new Error('compresión LZX: pasar [lzx-raw-out]');
  fs.writeFileSync(lzxOut, raw);
  fs.writeFileSync(lzxOut + '.json', JSON.stringify({ window, imageSize, base: info.base }));
  console.log(`LZX crudo ${raw.length} B, ventana 0x${window.toString(16)} -> ${lzxOut}`);
  process.exit(0);
} else throw new Error('compresión desconocida ' + compType);
if (img.readUInt16LE(0) !== 0x5a4d) throw new Error('sin firma MZ: descifrado incorrecto');
fs.writeFileSync(outPath, img.subarray(0, imageSize));
console.log(`PE ${imageSize} B -> ${outPath}`);
