import {appendFileSync as require_fs_append} from 'node:fs';
// Claude 2026-10-12: arranque rápido para pruebas con robot.
// - Perfil de Edge PERSISTENTE (artifacts/d1-wasm/perfil-pruebas/<nombre>) + puerto fijo: la caché de partes,
//   la partida guardada y los desbloqueos sobreviven entre corridas → no se vuelve a descargar nada.
// - Saltea videos/pantallas iniciales apretando Start/A seguido hasta el menú principal.
// - Atajos "ir a": rutas guardadas desde el menú principal (irA('opciones'), irA('trucos'), irA('lista'), ...).
// Respeta el turno de artifacts/PRUEBAS-EN-CURSO.md.
// Uso como módulo:  const g = await startGame({nombre:'base'}); await g.irA('lista'); ... await g.close();
// Uso directo:      node tools/d1-wasm/fast-start.mjs [ruta] [--perfil nombre]   (deja captura y tiempos)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {chromium} from 'playwright';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const nap = ms => new Promise(r => setTimeout(r, ms));
const TURN = 'artifacts/PRUEBAS-EN-CURSO.md';
// Menú principal: Career, Co-op Career, Quickplay, Multiplayer, Training, Options, Xbox Live (capturas 2026-10-12).
// Options: Audio, Calibrate Lag, Controller, Manage Band, Save/Load, Videos, The Store, Top Rockers, Cheats.
export const RUTAS = {
  menu: [],
  carrera: ['a'],
  rapida: ['d', 'd', 'a'],                // Partida rápida → elegir dificultad
  lista: ['d', 'd', 'a', 'a'],            // ... → lista de temas (dificultad por defecto)
  opciones: ['d', 'd', 'd', 'd', 'd', 'a'],
  trucos: ['d', 'd', 'd', 'd', 'd', 'a', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'd', 'a'],   // Cheats = 9.º de Options
  tienda: ['d', 'd', 'd', 'd', 'd', 'a', 'd', 'd', 'd', 'd', 'd', 'd', 'a'],
};
const KEYS = {d: 'down', u: 'up', l: 'left', r: 'right', a: 'a', b: 'b', s: 'start'};

export async function startGame({nombre = 'base', root = 'artifacts/d1-wasm/movil-memoria/demo', port = 5491, lat = 0, bw = 0,
  query = 'manual=1&r5lite=0&r5liveconsumer=r5snap-song-scene.js&gfx=url', owner = 'Claude (sesión A)', headless = true, viewport = {width: 1600, height: 900}, init = null, saltear = true, deadline = Infinity, esperarTurno = true, args = [], ctx = {}} = {}) {
  // Claude 2026-10-15 (accesos rápidos): deadline = hora límite (Date.now()) para TODO el arranque; esperarTurno=false = turno ocupado → error sin esperar.
  root = path.resolve(root);
  const token = `claude-fast-${process.pid}-${crypto.randomBytes(6).toString('hex')}`, t0 = Date.now(), marks = {};
  const mark = k => { marks[k] = Date.now() - t0; };
  const left = ms => { const r = Math.min(ms, deadline - Date.now()); if (r <= 0) throw Error('Se acabó el plazo global de la prueba.'); return r; };
  while (!fs.readFileSync(TURN, 'utf8').includes('Estado: LIBRE')) { if (!esperarTurno) throw Error('Turno de pruebas ocupado; no se ejecutó el juego.'); await nap(5000); }
  fs.writeFileSync(TURN, `# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: ${owner}\nReserva: ${token}\nQué: arranque rápido (perfil ${nombre})\nDesde: ${new Date().toISOString()}\nFin: ${Number.isFinite(deadline) ? 'límite ' + new Date(deadline).toISOString() : 'estimado 10 min'}\n`);
  let server, browser;
  const release = () => { try { if (fs.readFileSync(TURN, 'utf8').includes(token)) fs.writeFileSync(TURN, `# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: ${owner}\nQué: arranque rápido; terminado\nFin: ${new Date().toISOString()}\n`); } catch {} };
  try {
    const staticNames = fs.readdirSync(root).filter(n => fs.statSync(path.join(root, n)).isFile());
    const network = [];
    server = createDemandServer({root, staticNames, latencyMs: lat, bandwidthKBps: bw, onChunk: r => network.push(r)});
    await new Promise((r, j) => { server.once('error', j); server.listen(port, '127.0.0.1', r); });
    const profile = path.resolve('artifacts/d1-wasm/perfil-pruebas', nombre); fs.mkdirSync(profile, {recursive: true});
    browser = await chromium.launchPersistentContext(profile, {channel: 'msedge', headless, viewport, args, ...ctx});  // args: p. ej. --remote-debugging-port (perfil de CPU)
    const page = browser.pages()[0] || await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { if (e.data?.type === 'g1eInput') window.g1live = 1; }); return w; }; });
    if (init) await page.addInitScript(init);  // p. ej. preparar localStorage antes de cargar
    page.on('console', m => { if (process.env.GH3_CONSOLA_FILE) { const t = m.text(); if (t.startsWith('[TD]') || /rror|WGSL|pipeline|invalid/i.test(t)) require_fs_append(process.env.GH3_CONSOLA_FILE, t + '\n'); } });
    await page.goto(`http://127.0.0.1:${port}/gh3/?${query}`); mark('pagina');
    await page.waitForFunction(() => !document.getElementById('loaderPlay').disabled || gh3Loader.error, {}, {timeout: left(60000)});
    await page.click('#loaderPlay');
    await page.waitForFunction(() => gh3Loader.ready || gh3Loader.error, {}, {timeout: left(300000)});
    const le = await page.evaluate(() => gh3Loader.error); if (le) throw Error('Cargador: ' + le); mark('cargadorListo');
    await page.waitForFunction(() => window.g1live, {}, {timeout: left(180000)}); mark('juegoVivo');
    // Saltear videos: Start y A alternados cada 350 ms hasta ver el menú principal (saltear:false = no tocar nada).
    for (let k = 0; saltear && !(await page.evaluate(() => !!window.navSeen?.menu)); k++) {
      left(1); if (Date.now() - t0 > 300000) throw Error('No llegó al menú principal.');
      await page.evaluate(n => gh3Input.tap(n), k % 2 ? 'a' : 'start'); await nap(350);
    }
    await nap(1500); mark('menu');
    const tap = async (n, wait = 1800) => { await page.evaluate(x => gh3Input.tap(x), KEYS[n] || n); await nap(wait); };
    const shot = (name, sel = '#r5Canvas') => page.locator(sel).screenshot({path: name}).catch(() => {});
    const irA = async (ruta, {wait = 1800} = {}) => { const pasos = RUTAS[ruta] ?? ruta.split(','); for (const p of pasos) await tap(p, wait); mark('ruta:' + ruta); };
    const close = async () => { await browser?.close().catch(() => {}); await new Promise(r => server.close(r)); release(); };
    return {page, browser, server, marks, network, errors, tap, shot, irA, close, profile};
  } catch (e) { await browser?.close().catch(() => {}); if (server?.listening) await new Promise(r => server.close(r)); release(); throw e; }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Z]):/, '/$1:')}` || process.argv[1]?.endsWith('fast-start.mjs')) {
  const args = process.argv.slice(2), pi = args.indexOf('--perfil'), nombre = pi >= 0 ? args[pi + 1] : 'base';
  const ruta = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1)) || 'menu';
  const out = path.resolve('artifacts/d1-wasm/perfil-pruebas', 'capturas'); fs.mkdirSync(out, {recursive: true});
  let g;
  try {
    g = await startGame({nombre});
    await g.irA(ruta); await g.shot(path.join(out, `${nombre}-${ruta.replace(/[^\w]+/g, '_')}-${Date.now()}.png`));
    const mb = (g.network.reduce((s, n) => s + n.size, 0) / 1048576).toFixed(1);
    console.log(JSON.stringify({ok: !g.errors.length, perfil: nombre, ruta, marcas: g.marks, descargadoMB: +mb, errores: g.errors}));
  } catch (e) { console.log(JSON.stringify({ok: false, error: e.message})); process.exitCode = 1; }
  finally { await g?.close(); }
}
