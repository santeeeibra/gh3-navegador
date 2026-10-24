// paso2 (Claude, 2026-10-15): arma la copia aislada artifacts/d1-wasm/paso2/demo desde la copia publicada
// artifacts/d1-wasm/autopista60-pub/demo SIN tocarla (ni a artifacts/ui-layout/demo). Lo que no cambia se enlaza
// (enlace duro); lo que cambia se escribe como archivo nuevo (se borra antes el enlace para no escribir en la base).
// Cambios (paso 2 del plan único: escenario y personajes a la velocidad del juego, sin extrapolación):
//  - r5snap-native60-gpu.js: el dibujante ya no inventa imágenes. Dibuja sólo cuando llega un cuadro real del juego
//    (escena nunca extrapolada). Si la página no tomó el cuadro, lo reenvía igual. Sólo si el juego dibuja su propia
//    autopista (capa apagada/caída) se conserva el corrimiento de la pista de Codex como respaldo (contado aparte).
//    Cada imagen lleva su tiempo de canción (a60T). Se parchea el archivo publicado (difiere un poco de la fuente).
//  - autopista60-tap.js: lector con el tiempo de canción de cada cuadro (tools/paso2/tap.mjs).
//  - native60-page.js: cola con demora (tools/paso2/page.js).
//  - autopista60.js: publica también el instante del reloj (hw60.visualAt).
// Uso: node tools/paso2/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
const base = 'artifacts/d1-wasm/autopista60-pub/demo', out = 'artifacts/d1-wasm/paso2/demo', guard = 'artifacts/ui-layout/demo';
const sha = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const files = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
const OWN = new Set(['r5snap-native60-gpu.js', 'native60-page.js', 'autopista60-tap.js', 'autopista60.js']);
const before = Object.fromEntries(files(base).map((n) => [n, sha(path.join(base, n))]));
const guardBefore = Object.fromEntries(files(guard).map((n) => [n, sha(path.join(guard, n))]));
fs.mkdirSync(out + '/chunks', { recursive: true });
for (const n of files(base)) {
  if (OWN.has(n)) continue;
  const to = path.join(out, n); if (fs.existsSync(to)) fs.unlinkSync(to); fs.linkSync(path.join(base, n), to);
}
for (const n of fs.readdirSync(base + '/chunks')) if (!fs.existsSync(out + '/chunks/' + n)) fs.linkSync(base + '/chunks/' + n, out + '/chunks/' + n);
const put = (name, text) => { const to = path.join(out, name); if (fs.existsSync(to)) fs.unlinkSync(to); fs.writeFileSync(to, text); };
const once = (text, from, to, what) => { const n = text.split(from).length - 1; if (n !== 1) throw Error(`${what}: se esperaba 1 coincidencia y hay ${n}`); return text.replace(from, to); };

// 1) Dibujante GPU (archivo publicado, minificado).
let gpu = fs.readFileSync(path.join(base, 'r5snap-native60-gpu.js'), 'utf8');
gpu = once(gpu, 'ge=tt(te.inputs,Ie,{previous:i?.inputs,intervalMs:n,sceneMotion:Ye})',
  'ge=tt(te.inputs,Ie,{previous:i?.inputs,intervalMs:n,sceneMotion:!1}),L.p2Pending=!0', 'escena sin extrapolación');
gpu = once(gpu, 'if(n<500){const r=e?0:Math.max(0,Math.min(100,n))/1e3,',
  'if(n<500&&!e&&!L.p2Pending&&!(ge.planCount>0))L.p2Idle=(L.p2Idle||0)+1;else if(n<500){const r=e||!(ge.planCount>0)?0:Math.max(0,Math.min(100,n))/1e3,', 'dibujar sólo con cuadro nuevo');
gpu = once(gpu, 'L.rendered++,', 'L.rendered++,e?L.p2Fresh=(L.p2Fresh||0)+1:r>0?L.p2RoadExtrap=(L.p2RoadExtrap||0)+1:L.p2Repost=(L.p2Repost||0)+1,', 'contadores');
gpu = once(gpu, 'a.accepted&&Atomics.compareExchange(ne,0,0,1)===0){const M=De.transferToImageBitmap();Te.postMessage({type:"frame",bitmap:M,info:{seq:te.info.seq,accepted:a.accepted},',
  'a.accepted||(L.p2Pending=!1),a.accepted&&Atomics.compareExchange(ne,0,0,1)===0){L.p2Pending=!1;const M=De.transferToImageBitmap();Te.postMessage({type:"frame",bitmap:M,info:{seq:te.info.seq,accepted:a.accepted,a60T:te.info.a60T,a60Est:te.info.a60Est,fresh:e},', 'tiempo de canción al cuadro');
put('r5snap-native60-gpu.js', '/* paso2 (Claude 2026-10-15): sin extrapolación de escena; ver tools/paso2/build.mjs */' + gpu);

// 2) Lector con tiempo de canción.
await build({ entryPoints: ['tools/paso2/tap.mjs'], bundle: true, format: 'iife', minify: true, outfile: out + '/autopista60-tap.js.tmp', logLevel: 'warning' });
fs.renameSync(out + '/autopista60-tap.js.tmp', out + '/autopista60-tap.js.new'); if (fs.existsSync(out + '/autopista60-tap.js')) fs.unlinkSync(out + '/autopista60-tap.js'); fs.renameSync(out + '/autopista60-tap.js.new', out + '/autopista60-tap.js');

// 3) Página con cola.
put('native60-page.js', fs.readFileSync('tools/paso2/page.js', 'utf8'));

// 4) Capa: instante del reloj.
let a60 = fs.readFileSync(path.join(base, 'autopista60.js'), 'utf8');
a60 = once(a60, 'st.audioTimeMs = target; st.visualTimeMs = T;', 'st.audioTimeMs = target; st.visualTimeMs = T; st.visualAt = p; /* paso2 */', 'capa: visualAt');
put('autopista60.js', a60);

// Bases intactas.
for (const [n, h] of Object.entries(before)) if (sha(path.join(base, n)) !== h) throw Error('Cambió autopista60-pub: ' + n);
for (const [n, h] of Object.entries(guardBefore)) if (sha(path.join(guard, n)) !== h) throw Error('Cambió ui-layout: ' + n);
const result = { base, out, own: [...OWN], baseUnchanged: true, uiLayoutUnchanged: true, baseFiles: Object.keys(before).length, at: new Date().toISOString(),
  baseSha: Object.fromEntries([...OWN].map((n) => [n, before[n]])), sha: Object.fromEntries([...OWN].map((n) => [n, sha(path.join(out, n))])) };
fs.writeFileSync(path.join(path.dirname(out), 'build.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ out, own: result.own, baseUnchanged: true, uiLayoutUnchanged: true }));
