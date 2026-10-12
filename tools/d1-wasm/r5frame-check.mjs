// R5F v1: verificador INDEPENDIENTE del productor (no comparte código C++; solo el contrato
// artifacts/r5-runtime-claude/CONTRATO-R5F-V1.md). Separa:
//   complete          = FOOTER status 0
//   structurallyValid = complete + hash + tamaños + referencias + cuentas recalculadas
//   replayableExact   = por cuadro: structurallyValid + regla de exactitud recalculada (§6)
// Uso: node tools/d1-wasm/r5frame-check.mjs <archivo.r5f> [salida.json] [--expect-invalid]
import fs from 'node:fs';
import createXxh3 from './r5f-xxh3.mjs';

const [file, outArg, flag] = process.argv.slice(2);
if (!file) { console.error('uso: r5frame-check.mjs <archivo.r5f> [salida.json] [--expect-invalid]'); process.exit(2); }
const X = await createXxh3();
const buf = fs.readFileSync(file);
const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
const xxh3 = (off, len) => {
  const p = X._malloc(Math.max(1, len));
  X.HEAPU8.set(u8.subarray(off, off + len), p);
  const h = BigInt.asUintN(64, BigInt(X._r5f_xxh3(p, len)));
  X._free(p);
  return h;
};
const errors = [];
const err = (m) => { if (errors.length < 200) errors.push(m); };
const u32 = (o) => dv.getUint32(o, true), u64 = (o) => dv.getBigUint64(o, true);
const hex = (v) => '0x' + v.toString(16).toUpperCase();
const pad16 = (n) => (n + 15) & ~15;
const zeroRange = (s, e, what) => { for (let i = s; i < e; i++) if (u8[i]) { err(`${what}: byte no cero en ${i}`); return; } };

const summary = { file, bytes: u8.length, complete: false, structurallyValid: false, footer: null, header: null, frames: [], shaders: 0, blobs: 0, blobBytes: 0, records: 0, errors };
const REGS = 0x5003;
const DEP_NAMES = ['memoria', 'resolve-en-captura', 'ambiguo', 'viejo-previo', 'desconocido-overflow'];

if (u8.length < 64) err('archivo más corto que la cabecera');
else {
  const h = { magic: u32(0), version: dv.getUint16(4, true), headerBytes: dv.getUint16(6, true), host: u32(8), triggerKind: u32(12), triggerValue: u32(16), framesRequested: u32(20), regsCount: u32(24), maxBytes: u32(28), startSwap: u32(32), startTimeUs: Number(u64(40)) };
  summary.header = h;
  if (h.magic !== 0x31463552) err('magic distinto de R5F1');
  if (h.version !== 1 || h.headerBytes !== 64) err('versión/cabecera no soportada');
  if (h.regsCount !== REGS) err('regs_count distinto de 0x5003');
  if (h.framesRequested < 1 || h.framesRequested > 4) err('frames_requested fuera de 1..4');
  zeroRange(36, 40, 'cabecera reserved0'); zeroRange(48, 64, 'cabecera reserved');
}

const shaders = new Map();   // "type:hash" -> {flags}
const blobs = new Map();     // id -> {phys, bytes, kind, srcChanged}
let nextBlob = 1, nextEvent = 1n, pendingDeltaSeq = null, frame = null, frameNo = 0, footer = null, records = 0;
let off = 64;
const newFrame = (fb) => ({ frameNo: fb.frame_no, openSwap: fb.open_swap, events: 0, draws: 0, drawsIssued: 0, notIssued: 0, copies: 0, blobsNew: 0, bytesStart: off, drawsEdramUnknown: 0, copiesSrcUnknown: 0, dep: [0, 0, 0, 0, 0], srcChanged: 0, unsupported: 0, copyFail: 0, swap: null, end: null, notes: [], textures: [], copyList: [], edramUnknownTargets: [0, 0, 0, 0, 0] });

while (off < u8.length && !footer) {
  if (off + 16 > u8.length) { err(`registro cortado en ${off}`); break; }
  const type = u32(off), bytes = u32(off + 4), seq = u64(off + 8), b = off + 16;
  if (bytes < 16 || bytes % 16 || off + bytes > u8.length) { err(`registro inválido en ${off} (type ${type}, bytes ${bytes})`); break; }
  const end = off + bytes;
  const expectSize = (n) => { if (pad16(16 + n) !== bytes) err(`tipo ${type} en ${off}: tamaño ${bytes}, esperado ${pad16(16 + n)}`); zeroRange(off + 16 + n, end, `padding tipo ${type} en ${off}`); };
  const isEvent = type === 5 || type === 6 || type === 7;
  if (isEvent) {
    if (seq !== nextEvent) err(`event_seq ${seq} en ${off}, esperado ${nextEvent}`);
    if (pendingDeltaSeq !== null && pendingDeltaSeq !== seq) err(`REG_DELTA para ${pendingDeltaSeq} seguido de evento ${seq}`);
    pendingDeltaSeq = null; nextEvent = seq + 1n;
    if (!frame) err(`evento fuera de cuadro en ${off}`); else frame.events++;
  } else if (type !== 2 && type !== 9 && seq !== 0n) err(`tipo ${type} en ${off} con event_seq ${seq} (debe ser 0)`);
  if (type !== 9) records++;
  switch (type) {
    case 1: {  // FRAME_BEGIN
      const fb = { frame_no: u32(b), open_swap: u32(b + 4), time_us: Number(u64(b + 8)), regs_present: u32(b + 16), hist_count: u32(b + 20), hist_overflow: u32(b + 24) };
      if (frame) err(`FRAME_BEGIN dentro del cuadro ${frame.frameNo}`);
      if (fb.frame_no !== frameNo) err(`frame_no ${fb.frame_no}, esperado ${frameNo}`);
      if (summary.header && fb.open_swap !== summary.header.startSwap + frameNo) err(`open_swap ${fb.open_swap} no es start_swap+${frameNo}`);
      if ((fb.regs_present !== 0) !== (frameNo === 0)) err('regs_present debe ser 1 solo en el cuadro 0');
      if (frameNo > 0 && (fb.hist_count || fb.hist_overflow)) err('historial solo en el cuadro 0');
      zeroRange(b + 28, b + 32, 'FRAME_BEGIN reserved');
      expectSize(32 + (fb.regs_present ? REGS * 4 : 0) + fb.hist_count * 32);
      frame = newFrame(fb);
      frame.histCount = fb.hist_count; frame.histOverflow = fb.hist_overflow;
      if (fb.hist_count) {
        frame.history = [];
        let p = b + 32 + (fb.regs_present ? REGS * 4 : 0);
        for (let i = 0; i < fb.hist_count; i++, p += 32) frame.history.push({ extentStart: hex(u32(p)), extentLength: u32(p + 4), destBase: hex(u32(p + 8)), destInfo: hex(u32(p + 12)), firstSwap: u32(p + 16), lastSwap: u32(p + 20), count: u32(p + 24) });
      }
      break;
    }
    case 2: {  // REG_DELTA
      const n = u32(b);
      expectSize(8 + n * 8);
      if (pendingDeltaSeq !== null) err(`dos REG_DELTA seguidos en ${off}`);
      if (seq !== nextEvent) err(`REG_DELTA en ${off} para ${seq}, el próximo evento es ${nextEvent}`);
      pendingDeltaSeq = seq;
      for (let i = 0; i < n; i++) if (u32(b + 8 + i * 8) >= REGS) { err(`REG_DELTA índice fuera del banco en ${off}`); break; }
      break;
    }
    case 3: {  // SHADER
      const t = u32(b), dwords = u32(b + 4), hash = u64(b + 8), flags = u32(b + 16), nvb = u32(b + 24), ntb = u32(b + 28);
      expectSize(32 + nvb * 8 + ntb * 8 + dwords * 4);
      const k = `${t}:${hash}`;
      if (shaders.has(k)) err(`SHADER repetido ${k}`);
      if (t > 1) err(`SHADER tipo ${t}`);
      {  // hash = XXH3 de los bytes BE del guest; el payload trae palabras host LE
        const uc = b + 32 + nvb * 8 + ntb * 8;
        if (uc + dwords * 4 <= u8.length) {
          const be = new Uint8Array(dwords * 4);
          for (let i = 0; i < dwords; i++) new DataView(be.buffer).setUint32(i * 4, u32(uc + i * 4), false);
          const p = X._malloc(Math.max(1, be.length)); X.HEAPU8.set(be, p);
          const hb = BigInt.asUintN(64, BigInt(X._r5f_xxh3(p, be.length))); X._free(p);
          if (hb !== hash) err(`SHADER ${k}: hash BE no coincide (${hex(hb)})`);
        }
      }
      shaders.set(k, { flags });
      break;
    }
    case 4: {  // BLOB
      const id = u32(b), kind = u32(b + 4), phys = u32(b + 8), n = u32(b + 12), h = u64(b + 16), flags = u32(b + 24);
      expectSize(32 + n);
      zeroRange(b + 28, b + 32, 'BLOB reserved');
      if (id !== nextBlob) err(`blob_id ${id}, esperado ${nextBlob}`);
      nextBlob = id + 1;
      if (kind < 1 || kind > 5) err(`BLOB kind ${kind}`);
      if (b + 32 + n <= u8.length && xxh3(b + 32, n) !== h) err(`BLOB ${id}: XXH3 no coincide`);
      blobs.set(id, { phys, bytes: n, kind, srcChanged: !!(flags & 1) });
      summary.blobBytes += n;
      if (frame) frame.blobsNew++;
      break;
    }
    case 5: {  // DRAW
      const d = { drawIndex: u32(b), status: u32(b + 4), unsupported: u32(b + 8), indexBlob: u32(b + 48), nvf: u32(b + 52), vs: u64(b + 56), ps: u64(b + 64), ntf: u32(b + 72), edramPrior: u32(b + 76), edramTargets: u32(b + 80), replayFlags: u32(b + 84) };
      expectSize(96 + d.nvf * 24 + d.ntf * 128);
      zeroRange(b + 88, b + 96, 'DRAW reserved');
      if (!frame) break;
      frame.draws++;
      const issued = d.status === 0 || d.status === 4;
      if (d.status > 4) err(`DRAW status ${d.status}`);
      if (issued) frame.drawsIssued++; else frame.notIssued++;
      const ref = (id, what) => { if (id !== 0 && !blobs.has(id)) err(`DRAW ${d.drawIndex}: ${what} blob ${id} no definido antes`); return blobs.get(id); };
      if (d.vs && !shaders.has(`0:${d.vs}`)) err(`DRAW ${d.drawIndex}: VS ${hex(d.vs)} no definido antes`);
      if (d.ps && !shaders.has(`1:${d.ps}`)) err(`DRAW ${d.drawIndex}: PS ${hex(d.ps)} no definido antes`);
      let srcChanged = !!ref(d.indexBlob, 'índices')?.srcChanged, texNotExact = false;
      for (let i = 0; i < d.nvf; i++) srcChanged = !!ref(u32(b + 96 + i * 24 + 12), 'vfetch')?.srcChanged || srcChanged;
      for (let i = 0; i < d.ntf; i++) {
        const e = b + 96 + d.nvf * 24 + i * 128;
        const t = { slot: u32(e), status: u32(e + 28), format: u32(e + 32), basePhys: u32(e + 76), baseBytes: u32(e + 80), baseBlob: u32(e + 84), mipPhys: u32(e + 88), mipBytes: u32(e + 92), mipBlob: u32(e + 96), dep: u32(e + 100), depBase: u32(e + 104), depMip: u32(e + 108), lastCopySeq: Number(u64(e + 112)), copies: u32(e + 120) };
        srcChanged = !!ref(t.baseBlob, 'textura base')?.srcChanged || srcChanged;
        srcChanged = !!ref(t.mipBlob, 'mips')?.srcChanged || srcChanged;
        if (t.dep > 4) err(`DRAW ${d.drawIndex}: dep ${t.dep}`);
        const rank = [0, 1, 2, 4, 3];
        if (rank[t.dep] !== Math.max(rank[t.depBase] ?? 9, rank[t.depMip] ?? 9)) err(`DRAW ${d.drawIndex}: dep_class no es el peor de base/mips`);
        if (issued) { frame.dep[t.dep]++; if (t.dep > 1) texNotExact = true; }
        if (issued && t.dep > 0 && frame.textures.length < 64) frame.textures.push({ draw: d.drawIndex, slot: t.slot, basePhys: hex(t.basePhys), baseBytes: t.baseBytes, mipBytes: t.mipBytes, dep: DEP_NAMES[t.dep], lastCopySeq: t.lastCopySeq, copies: t.copies });
      }
      if (issued) {
        if (d.unsupported) frame.unsupported++;
        if (d.edramPrior) frame.drawsEdramUnknown++;
        for (let k = 0; k < 5; k++) if (d.edramPrior & (1 << k)) frame.edramUnknownTargets[k]++;
        if (srcChanged) frame.srcChanged++;
        const flags = (texNotExact ? 1 : 0) | (srcChanged ? 2 : 0) | (d.unsupported ? 4 : 0) | (d.edramPrior ? 8 : 0);
        if (flags !== d.replayFlags) err(`DRAW ${d.drawIndex}: replay_flags ${d.replayFlags}, recalculado ${flags}`);
        if ((d.status === 4) !== (d.unsupported !== 0)) err(`DRAW ${d.drawIndex}: status/unsupported_mask incoherentes`);
      }
      break;
    }
    case 6: {  // COPY
      const c = { status: u32(b + 4), rectBlob: u32(b + 68), flags: u32(b + 72) };
      expectSize(96);
      zeroRange(b + 76, b + 80, 'COPY reserved0'); zeroRange(b + 88, b + 96, 'COPY reserved1');
      if (c.rectBlob && !blobs.has(c.rectBlob)) err(`COPY: rect blob ${c.rectBlob} no definido antes`);
      if (!frame) break;
      frame.copies++;
      if (c.status === 1) frame.copyFail++;
      if (c.status > 2) err(`COPY status ${c.status}`);
      if ((c.flags & 1) && (c.flags & 8)) frame.copiesSrcUnknown++;
      const names = ['copia', 'clearProfundidad', 'clearColor', 'origenNoDeterminado', 'sobrescrituraCompleta'].filter((_, i) => c.flags & (1 << i));
      if (frame.copyList.length < 64) frame.copyList.push({ seq: Number(seq), status: c.status, flags: names, destBase: hex(u32(b + 44)), extentStart: hex(u32(b + 48)), extentLength: u32(b + 52), copyControl: hex(u32(b + 8)), colorEdramInfo: hex(u32(b + 16)), depthEdramInfo: hex(u32(b + 12)) });
      break;
    }
    case 7: {  // SWAP
      expectSize(32);
      zeroRange(b + 28, b + 32, 'SWAP reserved');
      if (u32(b + 24) > 4) err(`SWAP frontbuffer_dep ${u32(b + 24)}`);
      if (frame) {
        frame.swap = { swapIndex: u32(b), frontbufferPhys: hex(u32(b + 4)), width: u32(b + 8), height: u32(b + 12), timeUs: Number(u64(b + 16)), frontbufferDep: DEP_NAMES[u32(b + 24)] ?? u32(b + 24) };
        frame.fbDep = u32(b + 24);
        if (frame.swap.swapIndex !== frame.openSwap + 1) err(`SWAP ${frame.swap.swapIndex} no cierra el cuadro abierto en ${frame.openSwap}`);
      }
      break;
    }
    case 8: {  // FRAME_END
      expectSize(80);
      zeroRange(b + 76, b + 80, 'FRAME_END reserved');
      if (!frame) { err('FRAME_END sin cuadro'); break; }
      const e = { frameNo: u32(b), draws: u32(b + 4), drawsIssued: u32(b + 8), notIssued: u32(b + 12), copies: u32(b + 16), blobsNew: u32(b + 20), bytesFrame: u32(b + 24), drawsEdramUnknown: u32(b + 28), copiesSrcUnknown: u32(b + 32), texAmbiguous: u32(b + 36), texStale: u32(b + 40), texOverflow: u32(b + 44), texCaptureResolve: u32(b + 48), srcChanged: u32(b + 52), unsupportedDraws: u32(b + 56), replayableExact: u32(b + 60), g1DrawsDelta: u32(b + 64), g1CopiesDelta: u32(b + 68), events: u32(b + 72) };
      frame.end = e;
      if (!frame.swap) err(`cuadro ${frame.frameNo}: FRAME_END sin SWAP`);
      const mine = { frameNo: frame.frameNo, draws: frame.draws, drawsIssued: frame.drawsIssued, notIssued: frame.notIssued, copies: frame.copies, blobsNew: frame.blobsNew, drawsEdramUnknown: frame.drawsEdramUnknown, copiesSrcUnknown: frame.copiesSrcUnknown, texAmbiguous: frame.dep[2], texStale: frame.dep[3], texOverflow: frame.dep[4], texCaptureResolve: frame.dep[1], srcChanged: frame.srcChanged, unsupportedDraws: frame.unsupported, events: frame.events };
      for (const k of Object.keys(mine)) if (mine[k] !== e[k]) err(`cuadro ${frame.frameNo}: ${k} declarado ${e[k]}, recalculado ${mine[k]}`);
      if (e.events > 4096) err(`cuadro ${frame.frameNo}: más de 4096 eventos`);
      if (e.g1DrawsDelta !== e.drawsIssued + e.copies) frame.notes.push(`contador [g1] draws ${e.g1DrawsDelta} ≠ emitidos+copies ${e.drawsIssued + e.copies}`);
      if (e.g1CopiesDelta !== e.copies) frame.notes.push(`contador [g1] copies ${e.g1CopiesDelta} ≠ COPY ${e.copies}`);
      const exact = frame.unsupported === 0 && frame.drawsEdramUnknown === 0 && frame.copiesSrcUnknown === 0 && frame.copyFail === 0 &&
        frame.dep[2] === 0 && frame.dep[3] === 0 && frame.dep[4] === 0 && frame.srcChanged === 0 && (frame.fbDep ?? 9) <= 1;
      if ((e.replayableExact === 1) !== exact) err(`cuadro ${frame.frameNo}: replayable_exact declarado ${e.replayableExact}, recalculado ${exact ? 1 : 0}`);
      frame.exactRule = exact;
      frame.reasons = [];
      if (frame.drawsEdramUnknown) frame.reasons.push(`${frame.drawsEdramUnknown} draws sobre EDRAM previa no determinada`);
      if (frame.copiesSrcUnknown) frame.reasons.push(`${frame.copiesSrcUnknown} copies leen EDRAM no determinada`);
      if (frame.copyFail) frame.reasons.push(`${frame.copyFail} copies con GetResolveInfo fallido`);
      if (frame.dep[3]) frame.reasons.push(`${frame.dep[3]} texturas con bytes viejos de resolves previos a la captura`);
      if (frame.dep[2]) frame.reasons.push(`${frame.dep[2]} texturas ambiguas`);
      if (frame.dep[4]) frame.reasons.push(`${frame.dep[4]} texturas desconocidas por desborde del historial`);
      if ((frame.fbDep ?? 9) > 1) frame.reasons.push(`búfer mostrado en el swap: ${DEP_NAMES[frame.fbDep] ?? 'sin swap'}`);
      if (frame.unsupported) frame.reasons.push(`${frame.unsupported} draws no soportados`);
      if (frame.srcChanged) frame.reasons.push(`${frame.srcChanged} draws con fuente cambiada durante la copia`);
      summary.frames.push(frame);
      frame = null; frameNo++;
      break;
    }
    case 9: {  // FOOTER
      expectSize(32);
      footer = { status: u32(b), reason: u32(b + 4), frames: u32(b + 8), records: u32(b + 12), totalBytes: Number(u64(b + 16)), xxh3: u64(b + 24) };
      if (end !== u8.length) err(`${u8.length - end} bytes después del FOOTER`);
      if (footer.totalBytes !== u8.length) err(`total_bytes ${footer.totalBytes} ≠ tamaño ${u8.length}`);
      if (xxh3(0, off) !== footer.xxh3) err('XXH3 del archivo no coincide');
      if (footer.records !== records) err(`FOOTER records ${footer.records}, contados ${records}`);
      if (footer.frames !== summary.frames.length) err(`FOOTER frames ${footer.frames}, cerrados ${summary.frames.length}`);
      footer.xxh3 = hex(footer.xxh3);
      break;
    }
    default: err(`tipo de registro desconocido ${type} en ${off}`);
  }
  off = end;
}
summary.records = records; summary.shaders = shaders.size; summary.blobs = blobs.size;
summary.footer = footer;
if (!footer) err('falta FOOTER (captura incompleta o abortada)');
if (frame) err(`cuadro ${frame.frameNo} sin FRAME_END`);
if (footer && footer.status === 0 && summary.header && summary.frames.length !== summary.header.framesRequested) err(`completa con ${summary.frames.length} cuadros, pedidos ${summary.header.framesRequested}`);
summary.complete = !!footer && footer.status === 0;
if (footer && footer.status !== 0) err(`FOOTER status ${footer.status} (${['completa', 'truncada', 'abortada'][footer.status] || '?'}), reason ${footer.reason}: archivo INCOMPLETO`);
summary.structurallyValid = summary.complete && errors.length === 0;
for (const f of summary.frames) {
  f.replayableExact = summary.structurallyValid && f.exactRule;
  delete f.exactRule; delete f.bytesStart; delete f.dep;
}
summary.replayableExactFrames = summary.frames.filter((f) => f.replayableExact).map((f) => f.frameNo);
const out = outArg && !outArg.startsWith('--') ? outArg : null;
if (out) fs.writeFileSync(out, JSON.stringify(summary, (k, v) => (typeof v === 'bigint' ? hex(v) : v), 2));
const expectInvalid = [outArg, flag].includes('--expect-invalid');
console.log(JSON.stringify({ file, complete: summary.complete, structurallyValid: summary.structurallyValid, replayableExactFrames: summary.replayableExactFrames, frames: summary.frames.length, errors: errors.slice(0, 5) }));
process.exit(expectInvalid ? (summary.structurallyValid ? 1 : 0) : (summary.structurallyValid ? 0 : 1));
