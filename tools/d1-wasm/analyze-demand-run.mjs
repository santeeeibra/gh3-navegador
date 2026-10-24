// Claude 2026-10-12: resumen de una corrida de demand-game-check (Codex o copia Claude).
// Uso: node tools/d1-wasm/analyze-demand-run.mjs <carpeta de la corrida>
import fs from 'node:fs';
const dir = process.argv[2];
const r = JSON.parse(fs.readFileSync(dir + '/verification.json', 'utf8'));
const m = JSON.parse(fs.readFileSync('artifacts/unified-game/demo/manifest.json', 'utf8'));
const song = r.song, t0 = r.t0;
const pkgOf = new Map();
for (const [id, p] of Object.entries(m.packages)) for (const i of p.files) { const f = m.files[i]; if (!pkgOf.has(f.path)) pkgOf.set(f.path, id); }
const songFiles = m.packages[song].files.map(i => m.files[i]);
const songPaths = new Set(songFiles.map(f => f.path));
const songChunks = songFiles.reduce((n, f) => n + f.chunks.length, 0), songBytes = songFiles.reduce((n, f) => n + f.size, 0);
const req = r.networkRequests.map(x => ({ ...x, ms: x.at - t0, pkg: x.path ? pkgOf.get(x.path) || '?' : '?' }));
const st = s => r.stageEvents.find(e => e.stage === s);
const firstStep = r.stepsAt?.[0] ?? (r.steps?.[0] ? Date.parse(r.steps[0].at) - t0 : undefined);
const MB = n => (n / 1048576).toFixed(1) + ' MB';
const group = list => { const g = {}; for (const x of list) { const k = x.pkg; g[k] = g[k] || { n: 0, bytes: 0 }; g[k].n++; g[k].bytes += x.size; } return Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.n + ' partes / ' + MB(v.bytes)])); };
const out = { dir, ok: r.ok, error: r.error?.split('\n')[0], quick: r.quick, latMs: r.latMs, bwKBps: r.bwKBps, song, notes: r.notes };
out.preparacion = { hastaPrimerPaso_ms: firstStep, pedidos: group(req.filter(x => x.ms < firstStep)) };
out.etapas = r.stageEvents.map(e => `${e.stage}:${e.song}@${e.ms}${e.retry ? '(retry)' : ''}`);
const pv = st('preview'), ls = st('loadStart'), lc = st('levelConfirmed'), sp = st('songPlaying');
if (pv) {
  const preWin = req.filter(x => x.ms >= pv.ms && x.ms < pv.ms + 1500 && songPaths.has(x.path));
  const bg = req.filter(x => x.ms >= pv.ms + 1500 && songPaths.has(x.path) && (!ls || x.ms < ls.ms));
  out.preview = {
    ms: pv.ms, partesTemaEnPrimeros1500ms: preWin.length + '/' + songChunks, archivos: [...new Set(preWin.map(x => x.path))],
    precargaPrimerPedido_ms_desdePreview: bg[0] ? bg[0].ms - pv.ms : null, partesPrecargaAntesDeLoadStart: bg.length,
  };
}
const songReq = req.filter(x => songPaths.has(x.path));
out.tema = { partes: songChunks, bytes: MB(songBytes), pedidosRed: songReq.length, ultimoPedido_ms: songReq.at(-1)?.ms, unicos: new Set(songReq.map(x => x.hash)).size };
const gate = r.cacheEvents?.filter(e => e.songLoad) || [];
if (gate.length) out.compuerta = gate.map(e => `${e.complete ? 'completo' : e.error ? 'error ' + e.error : 'inicio'} ${e.song} ${MB(e.done)}/${MB(e.total)} @${e.ms}`);
const pf = r.cacheEvents?.filter(e => e.prefetch || e.prefetchError) || [];
if (pf.length) out.precarga = pf.map(e => e.prefetchError ? 'error ' + JSON.stringify(e.prefetchError) : `${e.song}/${e.priority}/${e.complete ? 'completa' : 'en curso'} @${e.ms}`);
out.misses = r.cacheEvents?.filter(e => e.misses).length;
out.fatal = r.cacheEvents?.filter(e => e.fatal || e.error).map(e => e.fatal || e.error);
if (lc) out.levelConfirmed_a_songPlaying_ms = sp ? sp.ms - lc.ms : null;
if (sp) {
  const during = req.filter(x => x.ms >= sp.ms);
  out.durantecancion = { pedidos: group(during), audioDelTema: during.filter(x => songPaths.has(x.path)).length };
}
// cuenta regresiva: reloj negativo observado entre levelConfirmed y songPlaying (eventos de gh3-stage) o en pasos
out.relojNegativoEnPasos = (r.steps || []).filter(s => typeof s.clock === 'number' && s.clock < 0).map(s => s.clock).slice(0, 3);
out.songPlayingDetalle = sp && Object.fromEntries(Object.entries(sp).filter(([k]) => !['at'].includes(k)));
const S = r.samples || [], a0 = S.find(s => s.audio)?.audio, a1 = S.at(-1)?.audio;
const aKeys = a1 ? Object.keys(a1).filter(k => typeof a1[k] === 'number') : [];
out.audio = a1 && Object.fromEntries(aKeys.map(k => [k, a0 && a0[k] !== a1[k] ? `${a0[k]}→${a1[k]}` : a1[k]]));
out.audioSignal = r.audioSignal;
out.final = r.final && { clock: r.final.clock, presented: r.final.presented, bot: r.final.bot };
out.reinicios = (S.at(-1)?.bot?.resets || 0) - (r.resets0 || 0);
const stalls = []; for (let i = 1; i < S.length; i++) if (S[i].clock === S[i - 1].clock) stalls.push(S[i].clock);
out.relojTrabado = stalls.length;
const T = S.filter(x => typeof x.t === 'number' && x.clock > 0);
if (T.length > 2) { const a = T[0], b = T.at(-1), dt = (b.t - a.t) / 1000; out.rendimiento = { segundos: +dt.toFixed(1), imagenesPorSeg: +((b.presented - a.presented) / dt).toFixed(1), ritmoJuego: +(((b.clock - a.clock) / 1000) / dt).toFixed(3), cortesAudioEnCancion: (b.audio?.underruns || 0) - (a.audio?.underruns || 0), saltosAudio: (b.audio?.skips || 0) - (a.audio?.skips || 0), cpuThrottle: r.cpuThrottle || 1, query: r.query }; }
out.pageErrors = r.pageErrors;
console.log(JSON.stringify(out, null, 1));
