// hw60 (Claude): lector paralelo de los dibujos de la autopista en el hilo del CP.
// Se suma al consumidor R5L de Codex (no lo modifica): por cada cuadro del juego manda a la página, por
// BroadcastChannel('hw60'), la geometría en píxeles (1280x720) de pista, gemas, líneas de compás y botones, sus
// constantes y las texturas nuevas (BC sin mosaico). La página redibuja la autopista a 60 cuadros/s.
import { readLiveDraws } from '../../r5-live-song/live-reader.mjs';
import { prepareTextureBase } from '../../r5-menu/texture-layout.mjs';
import { preparePrimitive } from '../../r5-menu/primitive.mjs';
const hex = (n) => n.toString(16).toUpperCase().padStart(16, '0');
// VS de la autopista → dwords por vértice (posición x,y en píxeles; color; uv). Colas 10CA3B73 y su brillo 035C1CB9:
// x,y relativos, color, uv y un índice de la tabla de ondulación (6 dwords). 27643FEB/C6F0B6F9: llamaradas y destellos
// (cuadrados animados por hoja de cuadros).
const STRIDE = { '80708BD1B82638B0': 5, '582ABCF5FF619A55': 7, '87D4CAE67E72C501': 7, '19815E13AC0DCC92': 7, '27643FEB20B8CBBD': 7, 'C6F0B6F9BA5A2B12': 7, '10CA3B730086027C': 6, '035C1CB9583C0C7E': 6 };
const WANTED = new Set(Object.keys(STRIDE)), COLAS = new Set(['10CA3B730086027C', '035C1CB9583C0C7E']);
const chan = new BroadcastChannel('hw60');
const sent = new Map(); // clave de textura -> cuadro en que se mandó
let frame = 0, lastBoard = null, enabled = true, stats = { frames: 0, draws: 0, errors: 0, ms: 0, lastError: null };
let overlayUntil = 0, hasBoard = false;
chan.onmessage = (e) => {
  if (e.data?.type === 'tapEnable') { enabled = !!e.data.on; if (!enabled) overlayUntil = 0; }
  if (e.data?.type === 'tapResend') sent.clear();
  if (e.data?.type === 'overlayReady') overlayUntil = e.data.on ? e.data.at + 350 : 0;
};
// Called synchronously by the copied R5 consumer, before it reads resources.
// A heartbeat expires if the overlay stops: the original is the fallback.
globalThis.__hw60DrawFilter = d => !(enabled && hasBoard && performance.timeOrigin + performance.now() < overlayUntil && WANTED.has(hex(d.vs)));
const sameBytes = (a, b) => { if (!a || a.length !== b.length) return false; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) return false; return true; };
function tap(bytes, info, api) {
  if (!enabled || !api?.readPhysical) { hasBoard = false; return; }
  const t0 = performance.now(), out = [], textures = [];
  frame++;
  const read = (p, n) => api.readPhysical(p, n).slice();
  for (const d of readLiveDraws(bytes, { wanted: WANTED, verifyShaders: new Set(), counts: {} })) {
    try {
      if (!d.issued) continue;
      const vs = hex(d.vs), ps = hex(d.ps), r = d.registers, f = new DataView(r.buffer, r.byteOffset);
      const cf = (base, n) => { const o = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) o[i] = f.getFloat32((base + i) * 4, true); return o; };
      // Constantes del VS: c0..c9 siempre; c0..c131 en las colas (tabla de la ondulación); c154/c155/c253..c255 aparte.
      const item = { vs, ps, blend: r[0x2201] >>> 0, mask: r[0x2104] & 15, vc: cf(0x4000, COLAS.has(vs) ? 132 : 10), vk: cf(0x4000 + 154 * 4, 2), vt: cf(0x4000 + 253 * 4, 3), pc: cf(0x4400, 3) };
      const tx = d.textures[0];
      if (tx) {
        const key = JSON.stringify([tx.basePhys, tx.baseBytes, ...tx.raw]);
        item.tex = key; item.sampler = { clampX: tx.raw[0] >>> 10 & 7, clampY: tx.raw[0] >>> 13 & 7, mag: tx.raw[3] >>> 19 & 3 };
        const last = sent.get(key);
        if ((last === undefined || frame - last > 600) && textures.length < 3) { // pocas por cuadro: no frenar el hilo del CP
          const p = prepareTextureBase(tx, read(tx.basePhys, tx.baseBytes), { allowUnknown: true });
          textures.push({ key, format: p.format, width: p.width, height: p.height, bytesPerRow: p.bytesPerRow, data: p.data });
          sent.set(key, frame);
        }
      }
      const stride = STRIDE[vs];
      if (stride && d.vertices.length) {
        const v = d.vertices[0], phys = (v.raw[0] & ~3) >>> 0, n = (v.raw[1] >>> 2 & 0xffffff) * 4, raw = read(phys, n);
        if (vs === '80708BD1B82638B0' && lastBoard && sameBytes(lastBoard, raw)) item.sameMesh = true;
        else {
          if (vs === '80708BD1B82638B0') lastBoard = raw;
          const dv = new DataView(raw.buffer), count = Math.floor(n / (stride * 4)), verts = new Float32Array(count * 4), colors = new Uint32Array(count);
          const co = stride === 7 ? 4 : 2, uo = stride === 7 ? 5 : 3, extra = stride === 6 ? new Float32Array(count) : null;
          for (let i = 0; i < count; i++) { const b = i * stride * 4; verts[i * 4] = dv.getFloat32(b, false); verts[i * 4 + 1] = dv.getFloat32(b + 4, false); verts[i * 4 + 2] = dv.getFloat32(b + uo * 4, false); verts[i * 4 + 3] = dv.getFloat32(b + uo * 4 + 4, false); colors[i] = dv.getUint32(b + co * 4, false); if (extra) extra[i] = dv.getFloat32(b + 20, false); }
          item.verts = verts; item.colors = colors; if (extra) item.extra = extra;
          const ib = d.indexSource === 1 ? { phys: d.indexPhys, data: read(d.indexPhys, d.indexBytes) } : undefined;
          const prim = preparePrimitive(d, ib); item.idx = prim.indices.length === 6 ? null : prim.indices; // 6 = un cuadrado (0,1,2 / 0,2,3)
          if (prim.indices.length === 6) item.quad = Array.from(prim.indices);
        }
      }
      out.push(item); stats.draws++;
    } catch (e) { stats.errors++; stats.lastError = String(e?.message || e); }
  }
  hasBoard = out.some(d => d.vs === '80708BD1B82638B0');
  stats.frames++; stats.ms += performance.now() - t0;
  chan.postMessage({ type: 'frame', seq: info?.seq, swap: info?.swap, at: performance.timeOrigin + t0, draws: out, textures, stats: frame % 60 === 0 ? { ...stats } : null });
}
const inner = globalThis.__r5liveConsumer;
globalThis.__r5liveConsumer = (bytes, info, api) => { try { tap(bytes, info, api); } catch (e) { stats.errors++; stats.lastError = String(e?.message || e); } return inner ? inner(bytes, info, api) : undefined; };
