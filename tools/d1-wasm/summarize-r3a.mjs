// R3a: resume los logs r3a-* (Node: artifacts/d1-wasm/d3; Edge: artifacts/d1-wasm/r3a-web).
// Uso: node tools/d1-wasm/summarize-r3a.mjs [carpeta] [prefijo]
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2] || 'artifacts/d1-wasm/d3', pre = process.argv[3] || 'r3a-';
const last = (txt, tag) => {
  let found = null;
  for (const line of txt.split(/\r?\n/)) {
    const head = '[' + tag + '] {';
    const i = line.indexOf(head);
    if (i >= 0) { try { found = JSON.parse(line.slice(i + tag.length + 3)); } catch {} }
  }
  return found;
};
const rows = [];
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith(pre) && f.endsWith('.log')).sort()) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  const g = last(txt, 'g1'), r = last(txt, 'r3a'), c = last(txt, 'cpu'), b = last(txt, 'r3b'), h = last(txt, 'r3c');
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.log$/, '.json')), 'utf8')); } catch {}
  const vd = ['VdSetGraphicsInterruptCallback', 'VdInitializeRingBuffer', 'VdEnableRingBufferRPtrWriteBack'].filter((v) => txt.includes(v)).length;
  rows.push({ run: f.replace(/\.log$/, ''), exit: meta.exitCode ?? meta.exit, vd, t: g && +g.t.toFixed(1), swaps: g?.swaps, swapsPerS: g && +(g.swaps / g.t).toFixed(2), draws: g?.draws, packets: g?.packets,
    mismatch: r?.mismatchChunks, checked: r?.checkedChunks, unchecked: r?.uncheckedChunks, yields: r?.yield, waitMemRet: r?.waitMem,
    framesBal: r && 'framesPushed' in r ? r.framesPushed - r.framesPopped : null, waitsBal: r && 'waitsStarted' in r ? r.waitsStarted - r.waitsFinished : null, failed: r?.failedPackets,
    cores: c ? +c.cores.toFixed(2) : (meta.cpu ? +meta.cpu.cores.toFixed(2) : null), pageErrors: meta.pageErrors ? meta.pageErrors.length : null,
    async: b?.async, turns: b?.turns, turnMaxUs: b?.turnMaxUs, turnHist: b && b['turnHist_lt0.25_1_4_8_16_ge16ms'], stale: b?.stale, reentry: b?.reentry, doubleArm: b?.doubleArm, gatePending: b?.gatePending, fakePending: b?.fakePending, backendFallback: b?.backendFallback,
    r3c: h && h.state ? h : undefined, page3c: meta.r3c,
    abort: /Aborted\(|RuntimeError/.test(txt), lateCb: /user callback triggered after runtime exited/.test(txt) });
}
for (const r of rows) console.log(JSON.stringify(r));
fs.writeFileSync(path.join(dir, pre + 'summary.json'), JSON.stringify(rows, null, 1));
