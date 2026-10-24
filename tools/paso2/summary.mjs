// paso2 (Claude, 2026-10-15): resume una corrida de tools/paso2/run-song.mjs (verification.json) en números comparables.
// Uso: node tools/paso2/summary.mjs <carpeta de corrida> [...]   → imprime JSON y lo guarda en <carpeta>/summary.json
import fs from 'node:fs';
import path from 'node:path';
const r1 = (x, d = 1) => (Number.isFinite(x) ? +x.toFixed(d) : null);
for (const dir of process.argv.slice(2)) {
  const v = JSON.parse(fs.readFileSync(path.join(dir, 'verification.json'), 'utf8'));
  const S = v.samples.filter((s) => s.song === v.song && s.clock > 0);
  const a = S[0], b = S.at(-1), sec = (b.t - a.t) / 1000;
  const per = (f) => (f(b) - f(a)) / sec;
  const tm = (s) => s.renderer?.temporal || {};
  const ev = (v.audioEvents || []), firstSong = ev.filter((e) => e.song === v.song && e.clock > 0);
  const base = ev.filter((e) => !(e.song === v.song && e.clock > 0)).at(-1) || { underruns: 0, silentBlocks: 0, skips: 0 };
  const lastE = firstSong.at(-1) || base;
  const p2 = b.paso2 || null;
  const out = {
    run: path.basename(dir), qual: v.qual, demo: v.demoRoot, ok: v.ok, error: v.error ? String(v.error).split('\n')[0] : null,
    strums: b.bot?.strums, notes: v.notes, clockFinal: r1(b.clock / 1000, 1), pageErrors: v.pageErrors.length,
    audio: { underrunsInSong: lastE.underruns - base.underruns, silentInSong: lastE.silentBlocks - base.silentBlocks, skipsInSong: lastE.skips - base.skips, total: b.audio && { underruns: b.audio.underruns, silentBlocks: b.audio.silentBlocks, skips: b.audio.skips } },
    windowSec: r1(sec),
    capaPerSec: r1(per((s) => s.hw60?.shown || 0)), capaAudioOk: b.hw60?.audioOk, capaErrors: b.hw60?.errors,
    baseImagesPerSec: r1(per((s) => s.cadence?.frames || 0)),
    workerRendersPerSec: r1(per((s) => tm(s).rendered || 0)), workerSnapshotsPerSec: r1(per((s) => tm(s).snapshots || 0)),
    workerFreshPerSec: r1(per((s) => tm(s).p2Fresh || 0)), workerRepostPerSec: r1(per((s) => tm(s).p2Repost || 0)), workerRoadExtrapPerSec: r1(per((s) => tm(s).p2RoadExtrap || 0)),
    sceneExtrapPlansMax: Math.max(...S.map((s) => tm(s).scenePlans || 0)), deltaMsMax: Math.max(...S.map((s) => tm(s).deltaMs || 0)),
    gpuWaitMs: r1(b.renderer?.gpu?.gpuWaitMs, 2), gameSwapsPerSec: r1(per((s) => s.renderer?.received || 0)),
    usage: v.usage || null,
    cadence: b.cadence && { maxGapMs: r1(b.cadence.maxGapMs), gaps: b.cadence.gaps },
    paso2: p2 && { received: p2.received, delayed: p2.delayed, immediate: p2.immediate, capped: p2.capped, dropped: p2.dropped, maxQueue: p2.maxQueue,
      meanWaitMs: r1(p2.waitSum / (p2.waitN || 1)), waitMaxMs: r1(p2.waitMax), lagMeanMs: r1(p2.lagSum / (p2.lagN || 1)), lagAbsMaxMs: r1(p2.lagAbsMax), lagHist: p2.lagHist, estimated: p2.est },
  };
  fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out));
}
