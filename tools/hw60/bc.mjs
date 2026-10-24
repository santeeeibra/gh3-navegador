// Decodificación BC1/BC2/BC3 (DXT) a RGBA8 y PNG mínimo (Claude, hw60). Solo herramientas offline.
import zlib from 'node:zlib';
const c565 = (c) => [((c >> 11) & 31) * 255 / 31 | 0, ((c >> 5) & 63) * 255 / 63 | 0, (c & 31) * 255 / 31 | 0];
function colorBlock(src, o, out, W, x0, y0, H, forceFour) {
  const a = src[o] | src[o + 1] << 8, b = src[o + 2] | src[o + 3] << 8, A = c565(a), B = c565(b);
  const pal = [A, B, null, null], four = forceFour || a > b;
  pal[2] = four ? A.map((v, i) => (2 * v + B[i]) / 3 | 0) : A.map((v, i) => (v + B[i]) >> 1);
  pal[3] = four ? A.map((v, i) => (v + 2 * B[i]) / 3 | 0) : [0, 0, 0];
  const bits = (src[o + 4] | src[o + 5] << 8 | src[o + 6] << 16 | src[o + 7] << 24) >>> 0;
  for (let p = 0; p < 16; p++) { const x = x0 + (p & 3), y = y0 + (p >> 2); if (x >= W || y >= H) continue; const k = (bits >>> (p * 2)) & 3, d = (y * W + x) * 4; out[d] = pal[k][0]; out[d + 1] = pal[k][1]; out[d + 2] = pal[k][2]; out[d + 3] = (!four && k === 3) ? 0 : 255; }
}
function alphaBlock3(src, o, out, W, x0, y0, H) {
  const a0 = src[o], a1 = src[o + 1], pal = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) pal.push(((7 - i) * a0 + i * a1) / 7 | 0); else { for (let i = 1; i < 5; i++) pal.push(((5 - i) * a0 + i * a1) / 5 | 0); pal.push(0, 255); }
  let bits = 0n; for (let i = 0; i < 6; i++) bits |= BigInt(src[o + 2 + i]) << BigInt(8 * i);
  for (let p = 0; p < 16; p++) { const x = x0 + (p & 3), y = y0 + (p >> 2); if (x >= W || y >= H) continue; out[(y * W + x) * 4 + 3] = pal[Number((bits >> BigInt(3 * p)) & 7n)]; }
}
export function decodeBC(format, data, W, H, bytesPerRow) {
  const out = new Uint8Array(W * H * 4), bs = format.startsWith('bc1') ? 8 : 16, bw = Math.ceil(W / 4), bh = Math.ceil(H / 4);
  bytesPerRow ||= bw * bs;
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    const o = by * bytesPerRow + bx * bs;
    if (bs === 8) colorBlock(data, o, out, W, bx * 4, by * 4, H, false);
    else { colorBlock(data, o + 8, out, W, bx * 4, by * 4, H, true); if (format.startsWith('bc3')) alphaBlock3(data, o, out, W, bx * 4, by * 4, H); else for (let p = 0; p < 16; p++) { const x = bx * 4 + (p & 3), y = by * 4 + (p >> 2); if (x < W && y < H) out[(y * W + x) * 4 + 3] = ((data[o + (p >> 1)] >> ((p & 1) * 4)) & 15) * 17; } }
  }
  return out;
}
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); Buffer.from(d).copy(b, 8); b.writeUInt32BE(crc(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
export function png(rgba, W, H) {
  const raw = Buffer.alloc((W * 4 + 1) * H); for (let y = 0; y < H; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
