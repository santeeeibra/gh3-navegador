// Busca globales QB por nombre en los .pak.xen (solo lectura). Uso: node tools/hw60/qb-scan.mjs <pak...> -- nombre...
import fs from 'node:fs'; import zlib from 'node:zlib';
const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
export const qbKey = (s) => { let c = 0xFFFFFFFF; for (const ch of s.toLowerCase()) c = T[(c ^ ch.charCodeAt(0)) & 255] ^ (c >>> 8); return c >>> 0; };
const args = process.argv.slice(2), sep = args.indexOf('--'), paks = args.slice(0, sep), names = args.slice(sep + 1);
const keys = new Map(names.map((n) => [qbKey(n), n]));
for (const p of paks) {
  let b = fs.readFileSync(p); try { b = zlib.inflateRawSync(b); } catch {}
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  for (let i = 0; i + 16 <= b.length; i += 4) {
    const k = dv.getUint32(i + 4); if (!keys.has(k)) continue;
    const hdr = dv.getUint32(i); if ((hdr & 0xFFFF00FF) !== 0x00200000) continue;
    const t = (hdr >> 8) & 255, v = t === 2 ? dv.getFloat32(i + 12) : t === 1 ? dv.getInt32(i + 12) : '0x' + dv.getUint32(i + 12).toString(16);
    let extra = ''; if (t === 3 || t === 0x0A || t === 0x05 || t === 0x06) { const d = dv.getUint32(i + 12); if (d < b.length - 12) extra = [0, 1, 2].map((j) => dv.getFloat32(d + 4 + j * 4).toFixed(3)).join(','); }
    console.log(p.split('/').pop(), keys.get(k), 'tipo', t.toString(16), v, extra);
  }
}
