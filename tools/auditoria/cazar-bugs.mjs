// Claude 2026-10-14: auditoría "cazadora de bugs" del GH3 en el navegador (Edge headless).
// Arranca la página con fast-start (perfil persistente, sin re-descargar), recorre menús y opcionalmente
// entra a una canción, y vigila: errores JS/worker/motor, pedidos fallidos, cuelgues, cortes de audio,
// velocidad del juego, imágenes/s y crecimiento de memoria (posible fuga).
// Ahorro de tokens: TODO el detalle va a artifacts/auditoria/<fecha>/ (crudo.json + capturas);
// por pantalla sale solo un resumen corto con los hallazgos ordenados por gravedad.
// Uso: node tools/auditoria/cazar-bugs.mjs [--rutas menu,opciones,tienda] [--seg 20] [--cancion 40]
//                                          [--root artifacts/d1-wasm/guitar7/demo] [--perfil auditoria] [--ver]
// Código de salida: 0 sin hallazgos graves, 2 con hallazgos graves, 1 si la auditoría misma falló.
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from '../d1-wasm/fast-start.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const RUTAS = String(arg('rutas', 'menu,opciones,tienda,lista')).split(',').filter(Boolean);
const SEG = +arg('seg', 20), CANCION = +arg('cancion', 0) || 0;
const ROOT = arg('root', 'artifacts/d1-wasm/guitar7/demo'), PERFIL = arg('perfil', 'auditoria');
const OUT = path.resolve('artifacts/auditoria', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
fs.mkdirSync(OUT, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));

const consola = new Map(), red = [], muestras = [], hallazgos = [];
const anotar = (grav, tipo, detalle, donde) => hallazgos.push({grav, tipo, detalle: String(detalle).slice(0, 300), donde});
const contar = (tipo, txt) => { const k = tipo + ': ' + String(txt).replace(/\d+/g, 'N').slice(0, 200); const e = consola.get(k) || {n: 0, ej: String(txt).slice(0, 400)}; e.n++; consola.set(k, e); };

// Foto compacta del estado que ya junta gh3-diag.js (window.gh3Diag) + contadores de d4.
const foto = page => page.evaluate(() => {
  const g = window.gh3Diag || {}, d = window.d4 || {};
  return {t: performance.now() / 1000, stage: g.stage, ended: g.ended, nErr: g.errors?.length || 0, quietS: g.quietS,
    swap: d.songRenderer?.swap ?? null, img: d.songPresented || 0, juegoPct: g.speed?.juegoPct, imgS: g.speed?.imgS,
    relojPct: g.speed?.relojPct, under: g.audio?.underruns, skips: g.audio?.skips, audio: g.audio?.state,
    memMB: g.mem?.wasmBytes ? Math.round(g.mem.wasmBytes / 1048576) : null, heapMB: typeof g.mem?.jsHeap === 'number' ? Math.round(g.mem.jsHeap / 1048576) : null,
    fatal: !!g.rendererFatal, loaderErr: window.gh3Loader?.error || null};
});

async function observar(g, donde, seg) {
  const fin = Date.now() + seg * 1000, propias = [];
  while (Date.now() < fin) {
    try { const f = await foto(g.page); f.donde = donde; muestras.push(f); propias.push(f); } catch (e) { anotar(3, 'página no responde', e.message, donde); break; }
    await nap(2000);
  }
  await g.shot(path.join(OUT, `${donde.replace(/[^\w]+/g, '_')}.png`));
  if (propias.length < 2) return;
  const a = propias[0], b = propias.at(-1), dt = b.t - a.t;
  if (b.ended) anotar(3, 'el motor terminó', b.ended, donde);
  if (b.fatal) anotar(3, 'error fatal de gráficos', 'songRenderer.fatal', donde);
  if (b.loaderErr) anotar(3, 'error del cargador', b.loaderErr, donde);
  if (b.quietS > 45) anotar(2, 'posible cuelgue', `${b.quietS} s sin registros del motor`, donde);
  if (a.swap !== null && b.swap !== null && b.swap === a.swap && dt > 8) anotar(3, 'juego congelado', `swaps sin avanzar ${dt.toFixed(0)} s`, donde);
  if (a.img === b.img && dt > 8 && b.stage !== 'detenido') anotar(2, 'imagen congelada', `0 cuadros nuevos en ${dt.toFixed(0)} s`, donde);
  const pcts = propias.map(f => f.juegoPct).filter(Number.isFinite);
  if (pcts.length && Math.min(...pcts) < 75) anotar(1, 'juego lento', `velocidad mín ${Math.min(...pcts)} % (prom ${Math.round(pcts.reduce((s, x) => s + x, 0) / pcts.length)} %)`, donde);
  if (Number.isFinite(a.under) && b.under > a.under) anotar(donde.startsWith('cancion') ? 2 : 1, 'cortes de audio', `+${b.under - a.under} underruns, +${(b.skips || 0) - (a.skips || 0)} saltos`, donde);
  if (b.audio && b.audio !== 'running') anotar(1, 'audio no activo', b.audio, donde);
  if (a.memMB && b.memMB - a.memMB > 150) anotar(2, 'memoria wasm creciendo', `${a.memMB}→${b.memMB} MB en ${dt.toFixed(0)} s`, donde);
  if (a.heapMB && b.heapMB - a.heapMB > 80) anotar(2, 'heap JS creciendo (¿fuga?)', `${a.heapMB}→${b.heapMB} MB en ${dt.toFixed(0)} s`, donde);
  if (b.nErr > a.nErr) anotar(3, 'errores nuevos en gh3Diag', `+${b.nErr - a.nErr}`, donde);
}

let g, fallo = null;
try {
  g = await startGame({nombre: PERFIL, root: ROOT, query: 'manual=1&diag=1', owner: 'Claude (auditoría)', headless: arg('ver', false) !== true});
  g.page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') contar('consola.' + m.type(), m.text()); });
  g.page.on('pageerror', e => contar('excepción', e.message));
  g.page.on('requestfailed', r => red.push({url: r.url().slice(-120), err: r.failure()?.errorText}));
  g.page.on('response', r => { if (r.status() >= 400) red.push({url: r.url().slice(-120), status: r.status()}); });
  for (const e of g.errors) contar('excepción (arranque)', e);
  for (const ruta of RUTAS) {
    if (ruta !== 'menu') { await g.irA('menu').catch(() => {}); for (let i = 0; i < 4; i++) await g.tap('b', 900); }  // volver al menú principal
    try { await g.irA(ruta); } catch (e) { anotar(2, 'no pudo navegar', e.message, ruta); continue; }
    await observar(g, ruta, SEG);
  }
  if (CANCION) {
    for (let i = 0; i < 6; i++) await g.tap('b', 900);
    await g.irA('lista');
    const t0 = Date.now();
    while (Date.now() - t0 < 120000 && (await foto(g.page)).stage !== 'cancion') await g.tap('a', 2500);
    if ((await foto(g.page)).stage !== 'cancion') anotar(3, 'no entró a la canción', '120 s apretando A desde la lista', 'cancion');
    else await observar(g, 'cancion', CANCION);
  }
  const diag = await g.page.evaluate(() => ({errors: window.gh3Diag?.errors, consoleErrors: window.gh3Diag?.consoleErrors, stages: window.gh3Diag?.stages, previous: window.gh3Diag?.previous?.verdict})).catch(() => ({}));
  for (const e of diag.errors || []) contar('gh3Diag.' + e.kind, e.message);
  fs.writeFileSync(path.join(OUT, 'crudo.json'), JSON.stringify({rutas: RUTAS, seg: SEG, cancion: CANCION, root: ROOT, marcas: g.marks, diag, muestras, red, consola: [...consola]}, null, 1));
} catch (e) { fallo = e.message; anotar(3, 'la auditoría no pudo correr', e.message, 'arranque'); }
finally { await g?.close(); }

// Consola y red agregadas → hallazgos.
for (const [k, v] of consola) anotar(k.startsWith('consola.warning') ? 1 : 3, k.split(':')[0], `${v.n}× ${v.ej}`, 'global');
const redAgr = new Map(); for (const r of red) { const k = (r.status || r.err) + ' ' + r.url.replace(/\?.*/, ''); redAgr.set(k, (redAgr.get(k) || 0) + 1); }
for (const [k, n] of redAgr) anotar(2, 'pedido fallido', `${n}× ${k}`, 'red');

hallazgos.sort((a, b) => b.grav - a.grav);
const G = ['', 'aviso', 'MEDIO', 'GRAVE'], graves = hallazgos.filter(h => h.grav === 3).length;
const resumen = [`AUDITORÍA GH3 · ${ROOT} · rutas ${RUTAS.join(',')}${CANCION ? ' + canción ' + CANCION + ' s' : ''}`,
  `hallazgos: ${graves} graves, ${hallazgos.filter(h => h.grav === 2).length} medios, ${hallazgos.filter(h => h.grav === 1).length} avisos · detalle: ${path.relative(process.cwd(), OUT)}`,
  ...hallazgos.slice(0, 25).map(h => `[${G[h.grav]}] ${h.donde} · ${h.tipo}: ${h.detalle.slice(0, 160)}`),
  ...(hallazgos.length > 25 ? [`… ${hallazgos.length - 25} más en resumen.txt`] : [])];
fs.writeFileSync(path.join(OUT, 'resumen.txt'), [...resumen.slice(0, 2), ...hallazgos.map(h => `[${G[h.grav]}] ${h.donde} · ${h.tipo}: ${h.detalle}`)].join('\n') + '\n');
console.log(resumen.join('\n'));
process.exitCode = fallo ? 1 : graves ? 2 : 0;
