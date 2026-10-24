// Claude 2026-10-17: copia LOCAL artifacts/d1-wasm/tactil-hora/demo = la publicada (c1strum-pub) + rasgueos táctiles demorados
// con la hora del toque original. Parchea el gh3-touch.js publicado (minificado) con anclas únicas. No publica.
import fs from 'node:fs';
import {build} from 'esbuild';
const SRC = 'artifacts/d1-wasm/c1strum-pub/demo', T = 'artifacts/d1-wasm/tactil-hora';
const rep = (s, a, b) => { if (s.split(a).length !== 2) throw Error('Ancla no única: ' + a.slice(0, 80)); return s.replace(a, b); };
fs.rmSync(T + '/demo', {recursive: true, force: true}); fs.mkdirSync(T + '/demo', {recursive: true});
for (const f of fs.readdirSync(SRC)) if (fs.statSync(SRC + '/' + f).isFile() && !['gh3-touch.js', 'c1-strum-page.js'].includes(f)) fs.linkSync(SRC + '/' + f, T + '/demo/' + f);
let t = fs.readFileSync(SRC + '/gh3-touch.js', 'utf8');
// E(e): rasgueo; si hay que esperar para separarlo del anterior, se reintenta con setTimeout -> llevar T0 (hora del toque).
t = rep(t, 'function E(e){const a=performance.now()', 'function E(e,T0){T0??=window.syncPress?.touchAt?.();const a=performance.now()');
t = rep(t, 'E(e)},n);y.push(r);return}', 'E(e,T0)},n);y.push(r);return}');
t = rep(t, 'm|=e,P[e]=a,c.strums++,b(),', 'm|=e,P[e]=a,c.strums++,window.gh3Input&&(window.gh3Input.touchAt=T0),b(),window.gh3Input&&(window.gh3Input.touchAt=void 0),');
// se(): rasgueo automático 30 ms después de tocar un color -> la hora es la del primer color tocado.
t = rep(t, 'function se(){I||(I=setTimeout(()=>{I=0,[...v.values()].some(e=>e.role==="fret")&&E(p.down)},oe))}',
  'function se(){const T0=window.syncPress?.touchAt?.();I||(I=setTimeout(()=>{I=0,[...v.values()].some(e=>e.role==="fret")&&E(p.down,T0)},oe))}');
fs.writeFileSync(T + '/demo/gh3-touch.js', t);
await build({entryPoints: ['tools/c1-strum/c1-strum-page.mjs'], bundle: true, minify: true, format: 'iife', define: {C1STRUM_DEFAULT: '7'}, outfile: T + '/demo/c1-strum-page.js', logLevel: 'warning'});
console.log(T + '/demo');
