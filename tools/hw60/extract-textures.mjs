// Saca a PNG las texturas que usan los dibujos de la autopista en un fixture R5 (Claude, hw60).
// Uso: node tools/hw60/extract-textures.mjs <fixture-dir> <salida>
import fs from 'node:fs'; import path from 'node:path'; import { decodeBC, png } from './bc.mjs';
const [dir, outDir] = process.argv.slice(2); fs.mkdirSync(outDir, { recursive: true });
const fx = JSON.parse(fs.readFileSync(path.join(dir, 'fixture.json'))), seen = new Map(), list = [];
const ROAD = ['B43CF443883B8351', '87D4CAE67E72C501', '582ABCF5FF619A55', '80708BD1B82638B0', '94B97981B512BDA2', '19815E13AC0DCC92', '27643FEB20B8CBBD', '10CA3B73'];
for (const op of fx.ops) {
  const m = op.manifest; if (!ROAD.some((v) => m.vs.startsWith(v))) continue;
  for (const t of op.textures || []) {
    const x = t.texture; if (!/^bc[123]/.test(x.format)) { list.push({ draw: m.draw, vs: m.vs, skip: x.format }); continue; }
    const k = x.sha256; if (seen.has(k)) { seen.get(k).draws.push(m.draw); continue; }
    const rgba = decodeBC(x.format, fs.readFileSync(path.join(dir, x.file)), x.width, x.height, x.bytesPerRow);
    const name = `${m.vs.slice(0, 8)}-${m.draw}-${x.width}x${x.height}.png`; fs.writeFileSync(path.join(outDir, name), png(rgba, x.width, x.height));
    const e = { name, vs: m.vs, ps: m.ps, format: x.format, w: x.width, h: x.height, sha: k, draws: [m.draw], sampler: t.sampler }; seen.set(k, e); list.push(e);
  }
}
fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(list, null, 1));
console.log(list.filter((e) => e.name).length, 'texturas;', list.filter((e) => e.skip).length, 'omitidas');
