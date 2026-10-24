// autopista60 (Claude, 2026-10-14): lector paralelo de la autopista en el hilo del CP. Base: tools/hw60/codex/tap.mjs
// (Codex) sin cambios de fondo + el ANCLA DE AUDIO: en el mismo instante en que se captura cada cuadro del juego se lee
// cuántas muestras escribió el juego en el anillo de audio (contador de escritura del AudioWorklet). La página junta ese
// par (c155.w del cuadro, muestra escrita) con la muestra que está sonando y dibuja con el tiempo del audio que se oye.
// Lo demás igual que Codex: por BroadcastChannel('hw60') manda geometría, constantes y texturas nuevas de pista, gemas,
// gemas estrella, compases, colas, botones y llamaradas; __hw60DrawFilter saca esas piezas del dibujo del juego sólo
// mientras la capa late (heartbeat de 350 ms); si la capa se apaga o falla, el juego vuelve a dibujarlas.
import { readLiveDraws } from '../r5-live-song/live-reader.mjs';
import { prepareTextureBase } from '../r5-menu/texture-layout.mjs';
import { preparePrimitive } from '../r5-menu/primitive.mjs';
const hex = (n) => n.toString(16).toUpperCase().padStart(16, '0');
const STRIDE = { '80708BD1B82638B0': 5, '582ABCF5FF619A55': 7, '87D4CAE67E72C501': 7, '19815E13AC0DCC92': 7, '27643FEB20B8CBBD': 7, 'C6F0B6F9BA5A2B12': 7, '10CA3B730086027C': 6, '035C1CB9583C0C7E': 6 };
const WANTED = new Set(Object.keys(STRIDE)), COLAS = new Set(['10CA3B730086027C', '035C1CB9583C0C7E']);
const chan = new BroadcastChannel('hw60');
const sent = new Map();
let frame = 0, lastBoard = null, enabled = true, stats = { frames: 0, draws: 0, errors: 0, ms: 0, lastError: null, filtered: 0, noRing: 0 };
let overlayUntil = 0, hasBoard = false, lastBoardAt = -1e9, ringPtr = 0, ringU32 = null;
chan.onmessage = (e) => {
  const m = e.data;
  if (m?.type === 'tapEnable') { enabled = !!m.on; if (!enabled) overlayUntil = 0; }
  if (m?.type === 'tapResend') sent.clear();
  if (m?.type === 'overlayReady') overlayUntil = m.on ? m.at + 350 : 0;
  if (m?.type === 'ring' && m.ptr > 0) ringPtr = m.ptr >>> 0;
};
globalThis.__hw60DrawFilter = (d) => {
  const own = enabled && (hasBoard || performance.now() - lastBoardAt < 300) && performance.timeOrigin + performance.now() < overlayUntil && WANTED.has(hex(d.vs));
  if (own) stats.filtered++;
  return !own;
};
// Contador de escritura del anillo de audio (Uint32 en ringPtr de la memoria wasm, el mismo que lee el AudioWorklet).
// readPhysical devuelve una vista de la memoria wasm: su .buffer es la memoria compartida (se rehace si crece).
function ringWrite(api) {
  if (!ringPtr) { stats.noRing++; return null; }
  const buf = api.readPhysical(0, 4).buffer;
  if (!ringU32 || ringU32.buffer !== buf) ringU32 = new Uint32Array(buf);
  return Atomics.load(ringU32, ringPtr >>> 2) >>> 0;
}

let syncSeg = 0, syncLivePtr = 0;
chan.addEventListener('message', e => { if(e.data?.type==='syncMemory') {syncSeg=e.data.seg>>>0;syncLivePtr=e.data.livePtr>>>0;} });
function syncRead(api) {
  if(!syncSeg) return null;
  try {
    const buffer=api.readPhysical(0,4).buffer, dv=new DataView(buffer);
    const host=a=>(dv.getUint32(syncSeg+(a>>>24)*4,true)+a)>>>0;
    const f=a=>dv.getFloat32(host(a),false), d=a=>dv.getFloat64(host(a),false), u=a=>dv.getUint32(host(a),false);
    const at=performance.timeOrigin+performance.now(), baseSec=d(0x82BD7C38);
    const row={at,baseSec,legacyEdgeMs:f(0x829B57B0),inputOffsetMs:f(0x829B56C0),
      earlySec:f(0x829A0438),lateSec:f(0x829AD418),hammerEarlySec:f(0x829AD448),hammerLateSec:f(0x82991718),
      noteIndex:u(0x829B5748),noteArray:u(0x829B6988),baseSecAfter:d(0x82BD7C38)};
    if(syncLivePtr) {const a=new Int32Array(buffer,syncLivePtr,11);row.input={seq:Atomics.load(a,0),buttons:Atomics.load(a,1),latch:Atomics.load(a,10),writtenAt:dv.getFloat64(syncLivePtr+32,true)};}
    row.finishedAt=performance.timeOrigin+performance.now();
    return row;
  }catch(e){return {error:String(e.message)};}
}

const sameBytes = (a, b) => { if (!a || a.length !== b.length) return false; for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) return false; return true; };
function tap(bytes, info, api) {
  if (!enabled || !api?.readPhysical) { hasBoard = false; return; }
  const t0 = performance.now(), w = ringWrite(api), sync = syncRead(api), out = [], textures = [];
  frame++;
  const read = (p, n) => api.readPhysical(p, n).slice();
  for (const d of readLiveDraws(bytes, { wanted: WANTED, verifyShaders: new Set(), counts: {} })) {
    try {
      if (!d.issued) continue;
      const vs = hex(d.vs), ps = hex(d.ps), r = d.registers, f = new DataView(r.buffer, r.byteOffset);
      const cf = (base, n) => { const o = new Float32Array(n * 4); for (let i = 0; i < n * 4; i++) o[i] = f.getFloat32((base + i) * 4, true); return o; };
      const item = { vs, ps, blend: r[0x2201] >>> 0, mask: r[0x2104] & 15, vc: cf(0x4000, COLAS.has(vs) ? 132 : 10), vk: cf(0x4000 + 154 * 4, 2), vt: cf(0x4000 + 253 * 4, 3), pc: cf(0x4400, 3) };
      const tx = d.textures[0];
      if (tx) {
        const key = JSON.stringify([tx.basePhys, tx.baseBytes, ...tx.raw]);
        item.tex = key; item.sampler = { clampX: tx.raw[0] >>> 10 & 7, clampY: tx.raw[0] >>> 13 & 7, mag: tx.raw[3] >>> 19 & 3 };
        const last = sent.get(key);
        if ((last === undefined || frame - last > 600) && textures.length < 3) {
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
          const prim = preparePrimitive(d, ib); item.idx = prim.indices.length === 6 ? null : prim.indices;
          if (prim.indices.length === 6) item.quad = Array.from(prim.indices);
        }
      }
      out.push(item); stats.draws++;
    } catch (e) { stats.errors++; stats.lastError = String(e?.message || e); }
  }
  hasBoard = out.some(d => d.vs === '80708BD1B82638B0'); if (hasBoard) lastBoardAt = t0; // cuadros sin pista en el medio: se sigue filtrando
  stats.frames++; stats.ms += performance.now() - t0;
  chan.postMessage({ type: 'frame', sync, seq: info?.seq, swap: info?.swap, at: performance.timeOrigin + t0, w, draws: out, textures, stats: frame % 60 === 0 ? { ...stats } : null });
}
const inner = globalThis.__r5liveConsumer;
globalThis.__r5liveConsumer = (bytes, info, api) => { try { tap(bytes, info, api); } catch (e) { stats.errors++; stats.lastError = String(e?.message || e); } return inner ? inner(bytes, info, api) : undefined; };
