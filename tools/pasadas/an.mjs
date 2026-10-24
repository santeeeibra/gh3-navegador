// Claude 2026-10-17: compara cada ventana salteada con las ventanas normales vecinas. Uso: node tools/pasadas/an.mjs <carpeta> <K0>
import fs from 'node:fs';
const [dir, k0s] = process.argv.slice(2), K0 = Number(k0s || 0);
const r = JSON.parse(fs.readFileSync(dir + '/resultado.json', 'utf8'));
const sites = JSON.parse(fs.readFileSync('artifacts/d1-wasm/pasadas/sitios.json', 'utf8'));
const HUD = new Set('CAC1FD2246E486B4,57F6448DAC5BEB74,B43CF443883B8351,87D4CAE67E72C501,582ABCF5FF619A55,80708BD1B82638B0,94B97981B512BDA2,19815E13AC0DCC92,27643FEB20B8CBBD,C6F0B6F9BA5A2B12,10CA3B730086027C,035C1CB9583C0C7E'.split(','));
const W = {};
for (const l of (r.sinEscena?.r5live || [])) if (l.includes('[pas]')) { const o = JSON.parse(l.slice(l.indexOf('{'))); W[o.w] = o; }
const sum = (o, f) => Object.entries(o.vs).reduce((a, [k, v]) => a + (f(k) ? v : 0), 0);
const rows = [];
for (const w of Object.keys(W).map(Number).filter(w => w & 1)) {
  const b = [W[w - 1], W[w + 1]].filter(Boolean); if (!b.length) continue;
  const k = K0 + (w - 1) / 2, s = W[w];
  const base = f => b.reduce((a, o) => a + sum(o, f), 0) / b.length;
  const hb = base(h => HUD.has(h)), eb = base(h => !HUD.has(h)), hs = sum(s, h => HUD.has(h)), es = sum(s, h => !HUD.has(h));
  const lost = []; for (const h of new Set(b.flatMap(o => Object.keys(o.vs)))) { const bv = b.reduce((a, o) => a + (o.vs[h] || 0), 0) / b.length, sv = s.vs[h] || 0; if (bv >= 10 && sv < bv * 0.3) lost.push((HUD.has(h) ? 'HUD:' : '') + h.slice(0, 8) + '(' + Math.round(bv) + '→' + sv + ')'); }
  rows.push({k, fn: sites[k]?.call, hud: `${Math.round(hb)}→${hs}`, escena: `${Math.round(eb)}→${es}`, perdidos: lost.join(' ')});
}
for (const x of rows) console.log(String(x.k).padStart(2), (x.fn || '').padEnd(13), 'HUD', x.hud.padEnd(11), 'escena', x.escena.padEnd(12), x.perdidos);
