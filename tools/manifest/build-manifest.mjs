#!/usr/bin/env node
// Manifiesto por canción (paso 1): SOLO LECTURA de datos ya existentes.
// No ejecuta el juego ni compila. Lee la carpeta original solo con stat() (tamaños).
// Uso: node tools/manifest/build-manifest.mjs [song=slowride] [salida.json]
// Las rutas de entrada se pueden cambiar con variables MANIFEST_* (ver CONFIG).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const A = (...p) => path.join(ROOT, 'artifacts', ...p);
const song = process.argv[2] || 'slowride';
const out = path.resolve(process.argv[3] || A('manifest', `manifest-${song}.json`));

const CONFIG = {
  gameDir: process.env.MANIFEST_GAME_DIR || 'D:\\Descargas\\GH3LOR-XEX\\GH3LOR-XEX\\Guitar Hero 3 Legends of Rock',
  songLog: process.env.MANIFEST_SONG_LOG || A('d1-wasm', 'r6', 'song-rate', 'song-rate-1.log'),
  menuLog: process.env.MANIFEST_MENU_LOG || A('d1-wasm', 'd3', 'g1e-node-press1.log'),
  menuShaderDirs: (process.env.MANIFEST_MENU_SHADERS || [A('g0', 'g0-native-1', 'shaders'), A('g0', 'g0-native-3', 'shaders')].join(';')).split(';'),
  songShaderDirs: (process.env.MANIFEST_SONG_SHADERS || [A('g0', 'g0-native-slowride', 'shaders'), A('g0', 'g0-native-slowride2', 'shaders')].join(';')).split(';'),
  r4Spirv: A('r4-shaders', 'native-conversion.json'),
  r4Edge: A('r4-shaders', 'edge-repacked.json'),
  menu44: A('r4-wgsl-menu-44', 'edge-44.json'),
  songPairs: process.env.MANIFEST_SONG_PAIRS || A('r5-live-song', 'pairs.json'),
  songWgslLogs: A('r5-live-song', 'shaders', 'logs'),
  songCaptures: process.env.MANIFEST_SONG_CAPTURES || A('r5-live-song', 'capture-1'),
};

const readJson = (f) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/');
const sources = {};
const src = (k, f) => { sources[k] = { path: rel(f), exists: fs.existsSync(f) }; return sources[k].exists; };

// ---------- Archivos abiertos (líneas [g1-file] del runtime wasm) ----------
function openedFiles(log) {
  const seen = new Map();
  for (const line of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
    const m = line.match(/\[g1-file\] path=(.+?) status=([0-9A-Fa-f]+) access=([0-9A-Fa-f]+)/);
    if (!m) continue;
    const p = m[1];
    if (p.endsWith('\\')) continue; // aperturas de carpeta
    const key = p.toLowerCase();
    if (!seen.has(key)) seen.set(key, { path: p, order: seen.size, opens: 0, status: m[2] });
    seen.get(key).opens++;
  }
  return [...seen.values()];
}

function category(p) {
  const l = p.toLowerCase();
  if (l.startsWith('save:')) return 'guardado';
  if (/\.qb\.|\\qb\.pa|\.toc\.|materiallibrary|cutscene_infos/.test(l)) return 'scripts-datos';
  if (/\\music\\.*\.(fsb|dat)\.xen$/.test(l)) return 'audio-cancion';
  if (/\\streams\\/.test(l)) return 'audio-efectos';
  if (/\.bik\.xen$/.test(l)) return 'video';
  if (/\\songs\\.*_song\.pak\.xen$/.test(l)) return 'chart-cancion';
  if (/\\zones\\/.test(l)) return 'escenario';
  if (/\\fonts\\|\\images\\|_tex\.pak|\.png$/.test(l)) return 'textura-ui';
  if (/_anims\.pak|\\anims\\/.test(l)) return 'animaciones';
  if (/\\pak\\/.test(l)) return 'modelo-personaje-instrumento';
  return 'otro';
}

function sizeOf(p) {
  if (!/^game:\\/i.test(p)) return null;
  try { return fs.statSync(path.join(CONFIG.gameDir, p.slice(5))).size; } catch { return null; }
}

// ---------- Shaders ----------
const SH = /^shader_([0-9A-F]{16})\.ucode\.bin\.(vert|frag)$/;
function shaderSet(dirs) {
  const s = new Map();
  for (const d of dirs) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) { const m = f.match(SH); if (m) s.set(m[1], m[2]); }
  }
  return s;
}
const hashOf = (name) => (name.match(/([0-9A-F]{16})/) || [])[1];

function build() {
  // archivos
  src('songLog', CONFIG.songLog); src('menuLog', CONFIG.menuLog);
  const songFiles = openedFiles(CONFIG.songLog);
  const menuKeys = new Set(fs.existsSync(CONFIG.menuLog) ? openedFiles(CONFIG.menuLog).map((f) => f.path.toLowerCase()) : []);
  const firstSong = songFiles.findIndex((f) => f.path.toLowerCase().includes(`\\music\\${song}.`));
  const files = songFiles.map((f) => {
    const size = sizeOf(f.path);
    return {
      path: f.path, order: f.order, opens: f.opens, category: category(f.path), bytes: size,
      phase: firstSong >= 0 && f.order >= firstSong ? 'cancion' : 'arranque-menu',
      alsoInMenuRun: menuKeys.has(f.path.toLowerCase()),
    };
  });
  const sum = (arr) => arr.reduce((a, f) => a + (f.bytes || 0), 0);
  const songOnly = files.filter((f) => f.phase === 'cancion');
  const byCat = {};
  for (const f of files) { const c = (byCat[f.category] ||= { files: 0, bytes: 0, songPhaseFiles: 0, songPhaseBytes: 0 }); c.files++; c.bytes += f.bytes || 0; if (f.phase === 'cancion') { c.songPhaseFiles++; c.songPhaseBytes += f.bytes || 0; } }

  // shaders volcados (acumulados por corrida nativa)
  CONFIG.menuShaderDirs.forEach((d, i) => src(`menuShaders${i}`, d));
  CONFIG.songShaderDirs.forEach((d, i) => src(`songShaders${i}`, d));
  const menuSh = shaderSet(CONFIG.menuShaderDirs);
  const songSh = shaderSet(CONFIG.songShaderDirs);
  const newInSong = [...songSh.keys()].filter((h) => !menuSh.has(h));

  // soporte
  src('r4Spirv', CONFIG.r4Spirv); src('r4Edge', CONFIG.r4Edge); src('menu44', CONFIG.menu44);
  const spirv = new Set(); const r4 = readJson(CONFIG.r4Spirv);
  if (r4) for (const x of JSON.stringify(r4).match(/shader_[0-9A-F]{16}/g) || []) spirv.add(x.slice(7));
  const edgeOk = new Set(); const edgeBad = new Set(); const er = readJson(CONFIG.r4Edge);
  for (const x of er?.results || []) (x.moduleValid ? edgeOk : edgeBad).add(hashOf(x.name));
  const m44 = new Set(); const e44 = readJson(CONFIG.menu44);
  for (const x of JSON.stringify(e44?.shaders || {}).match(/shader_[0-9A-F]{16}/g) || []) m44.add(x.slice(7));
  const songNaga = new Set();
  if (src('songWgslLogs', CONFIG.songWgslLogs)) for (const f of fs.readdirSync(CONFIG.songWgslLogs)) {
    if (f.endsWith('.naga.txt') && /Validation successful/.test(fs.readFileSync(path.join(CONFIG.songWgslLogs, f), 'utf8'))) songNaga.add(f.slice(0, 16));
  }
  const status = (h) => m44.has(h) ? 'menu44-edge-identico' : edgeOk.has(h) ? 'wgsl-edge-valido' : songNaga.has(h) ? 'wgsl-naga-valido-cancion' : edgeBad.has(h) ? 'wgsl-rechazado-edge' : spirv.has(h) ? 'solo-spirv' : (songSh.has(h) || menuSh.has(h)) ? 'volcado-sin-traducir' : 'sin-volcado';

  // shaders realmente usados en cuadros de la canción (pares VS/PS de la captura viva de Codex)
  src('songPairs', CONFIG.songPairs);
  const pairsJson = readJson(CONFIG.songPairs) || [];
  const used = new Map();
  const frames = pairsJson.map((fr) => {
    const hs = new Set();
    for (const [k, v] of Object.entries(fr.pairs)) for (const h of k.split('/')) { hs.add(h); used.set(h, (used.get(h) || 0) + v.count); }
    return { n: fr.n, events: fr.events, pairs: Object.keys(fr.pairs).length, shaders: hs.size };
  });
  const usedList = [...used.entries()].map(([h, draws]) => ({
    hash: h, stage: songSh.get(h) || menuSh.get(h) || null, draws, inMenuDump: menuSh.has(h), status: status(h),
  })).sort((a, b) => b.draws - a.draws);
  const tally = (list) => list.reduce((t, x) => ((t[x.status] = (t[x.status] || 0) + 1), t), {});

  // rangos de memoria por cuadro (texturas+vértices+índices mezclados)
  const memFrames = [];
  if (src('songCaptures', CONFIG.songCaptures)) for (const d of fs.readdirSync(CONFIG.songCaptures)) {
    const r = readJson(path.join(CONFIG.songCaptures, d, 'resources.json'));
    if (r) memFrames.push({ frame: d, seq: r.info?.seq, ranges: r.resources.length, bytes: r.total, missing: r.missing.length });
  }

  return {
    song, generatedAt: new Date().toISOString(), tool: 'tools/manifest/build-manifest.mjs', sources,
    files: {
      note: 'Aperturas de archivo del runtime wasm (NtCreateFile -> [g1-file]); no registra qué bytes se leen. Tamaños por stat() de la copia original.',
      total: files.length, totalBytes: sum(files), songPhase: songOnly.length, songPhaseBytes: sum(songOnly),
      notInMenuRun: files.filter((f) => !f.alsoInMenuRun).length, missingSize: files.filter((f) => f.bytes == null && !f.path.startsWith('SAVE')).length,
      byCategory: byCat, list: files,
    },
    shaders: {
      note: 'Volcados nativos acumulados por corrida (menú incluido en la de canción).',
      menuUnique: menuSh.size, songRunUnique: songSh.size,
      songRunStages: { vert: [...songSh.values()].filter((s) => s === 'vert').length, frag: [...songSh.values()].filter((s) => s === 'frag').length },
      newInSongRun: newInSong.length, newInSongRunStatus: tally(newInSong.map((h) => ({ status: status(h) }))),
      menuStatus: tally([...menuSh.keys()].map((h) => ({ status: status(h) }))),
      usedInSongFrames: { note: 'Pares VS/PS dibujados en cuadros capturados por Codex (r5-live-song).', frames, unique: usedList.length, notInMenuDump: usedList.filter((x) => !x.inMenuDump).length, status: tally(usedList), list: usedList },
      newInSongRunList: newInSong.map((h) => ({ hash: h, stage: songSh.get(h), status: status(h) })),
    },
    memoryPerFrame: { note: 'Rangos de memoria GPU leídos por cuadro en la captura de canción; texturas sin separar.', frames: memFrames },
  };
}

const m = build();
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(m, null, 1));
const s = m.shaders;
console.log(JSON.stringify({ out: rel(out), files: { total: m.files.total, MB: +(m.files.totalBytes / 1e6).toFixed(1), songPhase: m.files.songPhase, songPhaseMB: +(m.files.songPhaseBytes / 1e6).toFixed(1), missingSize: m.files.missingSize },
  shaders: { menu: s.menuUnique, songRun: s.songRunUnique, newInSong: s.newInSongRun, newStatus: s.newInSongRunStatus, usedInFrames: s.usedInSongFrames.unique, usedStatus: s.usedInSongFrames.status } }, null, 1));
