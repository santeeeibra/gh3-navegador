// Claude 2026-10-23 (fluido H, cambio 2): las canciones de jefe (bosstom, bossslash, bossdevil) no tienen paquete en
// manifest.json, así que su audio (BossTom.fsb 9 MB, BossSlash 11 MB, BossDevil 22 MB) se baja de a partes de 2 MB
// con pedido sincrónico MIENTRAS suena la batalla. Este script les arma paquete (song.pak + .dat + .fsb), igual que
// las demás canciones: el cargador las prepara al confirmar el tema, antes de que arranque el reloj.
// Uso: node tools/fluido-h/jefes-paquetes.mjs --dest <demo>
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2), i = args.indexOf('--dest');
if (i < 0) throw Error('falta --dest');
const file = path.join(args[i + 1], 'manifest.json'), m = JSON.parse(fs.readFileSync(file, 'utf8'));
const idx = new Map(m.files.map(f => [f.path.toLowerCase(), f.id])), hechos = {};
for (const [id, fsb, title] of [['bosstom', 'BossTom', 'Batalla: Tom Morello'], ['bossslash', 'BossSlash', 'Batalla: Slash'], ['bossdevil', 'BossDevil', 'Batalla: Lou']]) {
  const files = [`data/compressed/songs/${id}_song.pak.xen`, `data/music/${id}.dat.xen`, `data/music/${fsb.toLowerCase()}.fsb.xen`].map(p => { const n = idx.get(p); if (n == null) throw Error('falta ' + p); return n; });
  if (m.packages[id]) continue;
  m.packages[id] = {title, files, status: 'jefe-fluido-h'};
  hechos[id] = files.map(n => m.files[n].path);
}
fs.writeFileSync(file, JSON.stringify(m));
console.log(JSON.stringify({manifest: file, agregados: hechos}));
