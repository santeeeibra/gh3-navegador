// Claude 2026-10-17: resume las corridas de medir.sh (velocidad del juego, imagen, si perdió, contadores de ganchos).
import fs from 'node:fs';
const dir = 'artifacts/d1-wasm/interruptores/medidas';
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.log'))) {
  const t = fs.readFileSync(dir + '/' + f, 'utf8'), m = t.match(/"out":"([^"]+)"/); if (!m) { console.log(f, 'sin salida'); continue; }
  const o = m[1].replaceAll('\\', '/'); let r; try { r = JSON.parse(fs.readFileSync(o + '/resultado.json', 'utf8')); } catch { console.log(f, 'sin resultado'); continue; }
  const s = r.senales || {}, n = r.interruptores?.n || {};
  const imgs = (r.muestras || []).filter(x => x.etiqueta === 'cancion').map(x => x.rend?.presentados).filter(x => x != null);
  console.log(f.padEnd(20), r.ok ? 'ok' : 'ERR ' + (r.error || ''), 'juego', s.juegoPctProm, 'peor', s.juegoPctPeor, 'reloj', s.relojHasta, 'perdió', r.relojDetenido ?? '-', 'capa', s.capaImgS, 'cortes', s.cortesEnTramo,
    'crowd', n.nCrowd, n.nCrowdTrue, 'luz', n.nLight, n.nLightTrue, 'lod', n.nToggle, n.nViewer, n.nBone, 'shots', fs.readdirSync(o).filter(x => x.endsWith('.png')).length,
    'presentados/s', imgs.length > 1 ? ((imgs.at(-1) - imgs[0]) / ((r.muestras.filter(x => x.etiqueta === 'cancion').length - 1) * 2)).toFixed(1) : '-');
}
