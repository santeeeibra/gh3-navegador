#!/usr/bin/env node
// Manifiesto paso 2: analiza el registro [m2-*] de una corrida completa (tools/manifest/m2-run.mjs) y genera
// artifacts/manifest/manifest-<canción>-completo.json. Solo lectura; la carpeta original solo con stat().
// Uso: node tools/manifest/m2-analyze.mjs <run.log> [canción=slowride] [salida.json]
// Estados de soporte: mismas fuentes y reglas que build-manifest.mjs (paso 1).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (...p) => path.join(ROOT, 'artifacts', ...p);
const [logPath, song = 'slowride', outArg] = process.argv.slice(2);
if (!logPath) { console.error('uso: m2-analyze.mjs <run.log> [canción] [salida.json]'); process.exit(2); }
const out = path.resolve(outArg || A('manifest', `manifest-${song}-completo.json`));
const GAME = process.env.MANIFEST_GAME_DIR || 'D:\\Descargas\\GH3LOR-XEX\\GH3LOR-XEX\\Guitar Hero 3 Legends of Rock';
const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');

// ---------- soporte de shaders (igual que el paso 1) ----------
const SH = /^shader_([0-9A-F]{16})\.ucode\.bin\.(vert|frag)$/;
const dumps = new Map();
for (const d of ['g0-native-1', 'g0-native-3', 'g0-native-slowride', 'g0-native-slowride2']) {
  const dir = A('g0', d, 'shaders'); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { const m = f.match(SH); if (m) dumps.set(m[1], m[2]); }
}
const menuDump = new Set();
for (const d of ['g0-native-1', 'g0-native-3']) { const dir = A('g0', d, 'shaders'); if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) { const m = f.match(SH); if (m) menuDump.add(m[1]); } }
const hashes = (j) => new Set((JSON.stringify(j || {}).match(/shader_[0-9A-F]{16}/g) || []).map((x) => x.slice(7)));
const spirv = hashes(readJson(A('r4-shaders', 'native-conversion.json')));
const edgeOk = new Set(), edgeBad = new Set();
for (const x of readJson(A('r4-shaders', 'edge-repacked.json'))?.results || []) (x.moduleValid ? edgeOk : edgeBad).add(x.name.match(/[0-9A-F]{16}/)[0]);
const m44 = hashes(readJson(A('r4-wgsl-menu-44', 'edge-44.json'))?.shaders);
const songNaga = new Set(); const nagaDir = A('r5-live-song', 'shaders', 'logs');
if (fs.existsSync(nagaDir)) for (const f of fs.readdirSync(nagaDir)) if (f.endsWith('.naga.txt') && /Validation successful/.test(fs.readFileSync(path.join(nagaDir, f), 'utf8'))) songNaga.add(f.slice(0, 16));
const status = (h) => m44.has(h) ? 'menu44-edge-identico' : edgeOk.has(h) ? 'wgsl-edge-valido' : songNaga.has(h) ? 'wgsl-naga-valido-cancion' : edgeBad.has(h) ? 'wgsl-rechazado-edge' : spirv.has(h) ? 'solo-spirv' : dumps.has(h) ? 'volcado-sin-traducir' : 'sin-volcado';
const tally = (hs) => [...hs].reduce((t, h) => ((t[status(h)] = (t[status(h)] || 0) + 1), t), {});

// ---------- lectura del registro ----------
// Fases por orden del registro: arranque-menu → cancion (desde que se abre music\<canción>.) → post (después del último
// avance del reloj de la canción: resultados y lo que siga).
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);
let lastAdvance = -1, maxClock = -Infinity, songOpen = -1;
lines.forEach((l, i) => {
  if (songOpen < 0 && /\[g1-file\]/.test(l) && l.toLowerCase().includes(`\\music\\${song}.`)) songOpen = i;
  const m = l.match(/^\[m2-win\].* clock=(-?[\d.]+)/);
  if (m && songOpen >= 0 && +m[1] > maxClock) { maxClock = +m[1]; lastAdvance = i; }
});
const phaseOf = (i) => (songOpen < 0 || i < songOpen ? 'arranque-menu' : i <= lastAdvance ? 'cancion' : 'post');
const PH = ['arranque-menu', 'cancion', 'post'];

const files = new Map(), opens = [];
const ph = Object.fromEntries(PH.map((p) => [p, { windows: 0, swaps: 0, draws: 0, pairs: new Map(), shaders: new Set(), tex: new Set(), reads: 0, readBytes: 0 }]));
const tex = new Map(); let unanalyzed = 0, badfetch = 0, firstSwapWin = null;
lines.forEach((l, i) => {
  const p = ph[phaseOf(i)];
  let m;
  if ((m = l.match(/^\[m2-read\] path=(.*) off=(\d+) req=(\d+) got=(\d+) st=([0-9A-F]+)/))) {
    const key = m[1].replace(/^scatter:/, '');
    const f = files.get(key.toLowerCase()) || { path: key, reads: 0, got: 0, ranges: [], phases: {} };
    f.reads++; f.got += +m[4]; f.phases[phaseOf(i)] = (f.phases[phaseOf(i)] || 0) + +m[4];
    if (+m[4]) f.ranges.push([+m[2], +m[2] + +m[4]]);
    files.set(key.toLowerCase(), f); p.reads++; p.readBytes += +m[4];
  } else if ((m = l.match(/^\[m2-win\] swap=(\d+) ms=(\d+) clock=(-?[\d.]+) draws=(\d+) unanalyzed=(\d+) badfetch=(\d+) texTotal=\d+ pairs=(\S*) tex=(\S*)/))) {
    p.windows++; p.draws += +m[4]; unanalyzed = +m[5]; badfetch = +m[6];
    for (const kv of m[7].split(';').filter(Boolean)) {
      const [k, n] = kv.split(':'); p.pairs.set(k, (p.pairs.get(k) || 0) + +n);
      for (const h of k.split('/')) if (!/^0+$/.test(h)) p.shaders.add(h);
    }
    for (const id of m[8].split(',').filter(Boolean)) p.tex.add(+id);
    if (firstSwapWin === null) firstSwapWin = +m[1];
  } else if ((m = l.match(/^\[m2-tex\] id=(\d+) (.*)/))) {
    const o = { id: +m[1] }; for (const kv of m[2].split(' ')) { const [k, v] = kv.split('='); o[k] = /^\d+$/.test(v) ? +v : v; }
    tex.set(o.id, o);
  } else if ((m = l.match(/\[g1-file\] path=(.+?) status=([0-9A-F]+)/i)) && !m[1].endsWith('\\')) {
    opens.push({ path: m[1], phase: phaseOf(i) });
  }
});

const union = (r) => { r.sort((a, b) => a[0] - b[0]); let n = 0, s = -1, e = -1; for (const [a, b] of r) { if (a > e) { n += e - s; s = a; e = b; } else e = Math.max(e, b); } return n + (e - s); };
const sizeOf = (p) => { try { return fs.statSync(path.join(GAME, p)).size; } catch { return null; } };
const fileList = [...files.values()].map((f) => {
  const size = sizeOf(f.path), unique = f.ranges.length ? union(f.ranges) : 0;
  return { path: f.path, size, reads: f.reads, bytesRead: f.got, uniqueBytes: unique, coverage: size ? +(unique / size).toFixed(4) : null, bytesByPhase: f.phases };
}).sort((a, b) => b.uniqueBytes - a.uniqueBytes);

const texBytes = (ids) => [...ids].reduce((a, id) => a + (tex.get(id)?.bytes || 0) + (tex.get(id)?.mipbytes || 0), 0);
const fmtCount = (ids) => [...ids].reduce((t, id) => { const f = tex.get(id)?.fmt; t[f] = (t[f] || 0) + 1; return t; }, {});
const menuShaders = ph['arranque-menu'].shaders;
const songShaders = new Set([...ph.cancion.shaders, ...ph.post.shaders]);
const newVsMenu = [...songShaders].filter((h) => !menuShaders.has(h));
const shaderRows = [...songShaders].map((h) => {
  let draws = 0; for (const [k, n] of ph.cancion.pairs) if (k.includes(h)) draws += n;
  return { hash: h, stage: dumps.get(h) || null, drawsInSong: draws, inMenuRun: menuShaders.has(h), inMenuDump: menuDump.has(h), status: status(h) };
}).sort((a, b) => b.drawsInSong - a.drawsInSong);

// control cruzado con los 2 cuadros de Codex (r5-live-song/pairs.json)
const codex = new Set(); for (const fr of readJson(A('r5-live-song', 'pairs.json')) || []) for (const k of Object.keys(fr.pairs)) k.split('/').forEach((h) => codex.add(h));

const m = {
  song, generatedAt: new Date().toISOString(), tool: 'tools/manifest/m2-analyze.mjs', log: rel(path.resolve(logPath)), lines: lines.length,
  phases: Object.fromEntries(PH.map((p) => [p, { windows: ph[p].windows, draws: ph[p].draws, uniquePairs: ph[p].pairs.size, uniqueShaders: ph[p].shaders.size, textures: ph[p].tex.size, textureBytes: texBytes(ph[p].tex), reads: ph[p].reads, readBytes: ph[p].readBytes }])),
  songClockMaxMs: maxClock, unanalyzedShaders: unanalyzed, badTextureFetches: badfetch,
  files: { opened: opens, read: fileList },
  shaders: {
    menuRun: menuShaders.size, songAndPost: songShaders.size, newVsMenuRun: newVsMenu.length,
    status: tally(songShaders), newStatus: tally(newVsMenu), postOnly: [...ph.post.shaders].filter((h) => !ph.cancion.shaders.has(h) && !menuShaders.has(h)).length,
    codexFramesCovered: [...codex].filter((h) => songShaders.has(h)).length + '/' + codex.size,
    notInAnyDump: [...songShaders].filter((h) => !dumps.has(h)).length,
    list: shaderRows,
  },
  textures: {
    total: tex.size, song: ph.cancion.tex.size, songBytes: texBytes(ph.cancion.tex), songFormats: fmtCount(ph.cancion.tex),
    songOnlyVsMenu: [...ph.cancion.tex].filter((id) => !ph['arranque-menu'].tex.has(id)).length,
    note: 'Textura = descriptor distinto (dirección+formato+tamaño). La misma imagen recargada en otra dirección cuenta otra vez. bytes = base + mips como los carga el texture cache.',
    list: [...tex.values()].map((t) => ({ ...t, phases: PH.filter((p) => ph[p].tex.has(t.id)) })),
  },
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(m, null, 1));
console.log(JSON.stringify({ out: rel(out), phases: m.phases, clockMaxS: maxClock / 1000, shaders: { menuRun: m.shaders.menuRun, songAndPost: m.shaders.songAndPost, newVsMenu: m.shaders.newVsMenuRun, status: m.shaders.status, newStatus: m.shaders.newStatus, postOnly: m.shaders.postOnly, codex: m.shaders.codexFramesCovered, notInAnyDump: m.shaders.notInAnyDump },
  textures: { total: m.textures.total, song: m.textures.song, songMB: +(m.textures.songBytes / 1e6).toFixed(1), songOnlyVsMenu: m.textures.songOnlyVsMenu }, unanalyzed, badfetch,
  filesRead: fileList.length, topFiles: fileList.slice(0, 12).map((f) => [f.path, f.size, f.uniqueBytes, f.coverage]) }, null, 1));
