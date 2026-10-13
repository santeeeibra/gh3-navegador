// Saca a PNG las texturas de los dibujos de la autopista de capturas R5L de la canción (Claude, hw60).
// Uso: node tools/hw60/extract-r5l.mjs <salida> <dir-captura>...   (cada dir: frame.r5f + resources.json + <phys>-<len>.bin)
import fs from 'node:fs'; import path from 'node:path'; import { createHash as sha } from 'node:crypto';
import { createHash } from '../r5-menu/hash.mjs'; import { readLiveDraws } from '../r5-live-song/live-reader.mjs';
import { prepareTextureBase } from '../r5-menu/texture-layout.mjs'; import { decodeBC, png } from './bc.mjs';
const [outDir, ...caps] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const ROAD = ['B43CF443883B8351', '87D4CAE67E72C501', '582ABCF5FF619A55', '80708BD1B82638B0', '94B97981B512BDA2', '19815E13AC0DCC92', '27643FEB20B8CBBD', '10CA3B730086027C'];
const hex = (n) => n.toString(16).toUpperCase().padStart(16, '0'), hash = await createHash();
const idxPath = path.join(outDir, 'index.json'), seen = new Map((fs.existsSync(idxPath) ? JSON.parse(fs.readFileSync(idxPath)) : []).map((e) => [e.sha, e]));
const counts = {};
for (const cap of caps) {
  const res = JSON.parse(fs.readFileSync(path.join(cap, 'resources.json'))).resources;
  const ranges = res.map((r) => ({ ...r, file: path.join(cap, `${r.phys}-${r.length}.bin`) })).filter((r) => fs.existsSync(r.file)).map((r) => ({ ...r, data: fs.readFileSync(r.file) }));
  const read = (p, n) => { const r = ranges.find((r) => r.phys <= p && p + n <= r.phys + r.length); if (!r) throw Error('falta ' + p + ':' + n); return new Uint8Array(r.data.subarray(p - r.phys, p - r.phys + n)); };
  let n = 0;
  for (const d of readLiveDraws(new Uint8Array(fs.readFileSync(path.join(cap, 'frame.r5f'))), { hash, wanted: new Set(ROAD), verifyShaders: new Set() , counts })) {
    const vs = hex(d.vs), ps = hex(d.ps);
    for (const t of d.textures) {
      try {
        const p = prepareTextureBase(t, read(t.basePhys, t.baseBytes), { allowUnknown: true });
        const fmt = p.format, data = p.data || p.bytes;
        const key = sha('sha256').update(data).digest('hex');
        if (seen.has(key)) { const e = seen.get(key); if (!e.where.includes(cap + '#' + d.index)) e.where.push(cap + '#' + d.index); continue; }
        if (!/^bc[123]/.test(fmt)) { seen.set(key, { sha: key, vs, ps, format: fmt, skip: true, where: [cap + '#' + d.index] }); continue; }
        const rgba = decodeBC(fmt, data, p.width, p.height, p.bytesPerRow), name = `${vs.slice(0, 8)}-${ps.slice(0, 8)}-${p.width}x${p.height}-${key.slice(0, 8)}.png`;
        fs.writeFileSync(path.join(outDir, name), png(rgba, p.width, p.height)); n++;
        seen.set(key, { sha: key, name, vs, ps, format: fmt, w: p.width, h: p.height, where: [cap + '#' + d.index] });
      } catch (e) { counts.err = (counts.err || 0) + 1; counts.lastErr = e.message; }
    }
  }
  console.log(cap, 'nuevas', n);
}
fs.writeFileSync(idxPath, JSON.stringify([...seen.values()], null, 1)); console.log(counts);
