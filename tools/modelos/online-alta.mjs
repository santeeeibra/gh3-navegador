// Claude 2026-10-22 (modelos, paso 1): copia de tools/accesos/verificar-online.mjs con Edge VISIBLE y calidad elegida.
// Abre lasvegasherogame.com/gh3/, aprieta Jugar, llega al menú principal y durante --seg segundos mira si la imagen avanza:
// cuadros presentados del dibujador, imgS del diag y capturas del canvas cada 5 s (iguales = congelada).
// Uso: node tools/modelos/online-alta.mjs [--calidad completo] [--seg 30] [--plazo 300] [--oculto] [--cancion]
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const CAL = String(opt('calidad', 'completo')), SEG = Number(opt('seg', 30)), PLAZO = Number(opt('plazo', 300)) * 1000, t0 = Date.now();
const dir = 'artifacts/d1-wasm/perfil-pruebas/online';
const out = path.resolve('artifacts/d1-wasm/modelos/online', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + CAL);
fs.mkdirSync(out, {recursive: true});
const b = await chromium.launchPersistentContext(dir, {channel: 'msedge', headless: opt('oculto', false) === true, viewport: {width: 1600, height: 900}});
const r = {calidad: CAL, ok: false, errores: [], consola: [], muestras: []};
const write = () => fs.writeFileSync(path.join(out, 'resultado.json'), JSON.stringify(r, null, 1));
const nap = ms => new Promise(z => setTimeout(z, ms));
try {
  const p = b.pages()[0] || await b.newPage(); p.on('pageerror', e => r.errores.push(e.message));
  // Claude 2026-10-22: consola de página y workers con autopista60/armador/gpuval/lector (para ver si el lector de la capa carga).
  r.consola = []; const keepC = m => { const x = m.text(); if (/autopista60|armador|gpuval|lector|importScripts|tap/i.test(x) && r.consola.length < 40) r.consola.push(x.slice(0, 300)); }; p.on('console', keepC); const hookW = w => { r.consola.push('worker: ' + w.url().slice(0, 120)); w.on('console', keepC); }; p.workers().forEach(hookW); p.on('worker', hookW);
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') r.consola.push(m.type() + ' ' + m.text().slice(0, 300)); });
  await p.addInitScript(cal => { try { localStorage.setItem('gh3-test-profile', 'claude'); localStorage.setItem('gh3q', cal); } catch {} }, CAL);
  await p.addInitScript(() => { const W = window.Worker; window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => { if (e.data?.type === 'g1eInput') window.g1live = 1; }); return w; }; });
  // --limpiar: borra el caché HTTP del navegador (no los trozos del juego) antes de entrar.
  if (opt('limpiar', false)) { const cdp = await b.newCDPSession(p); await cdp.send('Network.clearBrowserCache'); r.limpiado = true; }
  await p.goto('https://lasvegasherogame.com/gh3/?manual=1&diag=1');
  r.webgpu = await p.evaluate(() => !!navigator.gpu);
  await p.waitForFunction(() => !document.getElementById('loaderPlay').disabled || gh3Loader.error, {}, {timeout: PLAZO});
  await p.click('#loaderPlay'); r.jugarMs = Date.now() - t0;
  await p.waitForFunction(() => gh3Loader.ready || gh3Loader.error, {}, {timeout: PLAZO - (Date.now() - t0)});
  r.cargador = await p.evaluate(() => gh3Loader.error || 'listo');
  for (let k = 0; !(await p.evaluate(() => !!window.navSeen?.menu)); k++) {
    if (Date.now() - t0 > PLAZO) throw Error('sin menú dentro del plazo');
    if (await p.evaluate(() => window.g1live)) await p.evaluate(n => gh3Input.tap(n), k % 2 ? 'a' : 'start');
    await nap(350);
  }
  r.menuMs = Date.now() - t0; write();
  // --cancion: Partida rápida > primer tema (Slow Ride), sin robot; mide desde que corre el reloj de la canción.
  const CANCION = opt('cancion', false) === true, tap = async (n, w = 1800) => { await p.evaluate(x => gh3Input.tap(x), n); await nap(w); };
  if (CANCION) {
    await nap(2000); for (const k of ['down', 'down', 'a']) await tap(k);
    for (let k = 0; k < 8 && !(await p.evaluate(() => window.songPak)); k++) await tap('a', 2500);
    r.tema = await p.evaluate(() => window.songPak); write();
    while (!(await p.evaluate(() => window.gh3Song?.clock?.() > 0))) { if (Date.now() - t0 > PLAZO) throw Error('la canción no arrancó'); await nap(1000); }
    r.cancionMs = Date.now() - t0;
  }
  const pre = CANCION ? 'cancion' : 'menu', hashes = [];
  for (let s = 0; s <= SEG; s += 5) {
    const m = await p.evaluate(() => { const d = window.gh3Diag, q = window.d4?.songRenderer;
      return {reloj: Math.round(window.gh3Song?.clock?.() ?? -1), capa: window.hw60?.shown ?? null, capaOn: window.hw60?.enabled ?? null, capaEstado: (() => { try { const h = window.hw60; return h ? JSON.parse(JSON.stringify({rafs: h.rafs, hides: (h.hides || []).slice(-4), paused: h.paused, outOfRange: h.outOfRange, frames: h.frames, received: h.received, tab: h.tab ? 1 : 0, dtMs: h.dtMs, tapE: h.tap, errs: h.errors, lastError: h.lastError, a60: h.a60, audioOk: h.audioOk, clockMode: h.clockMode, ls: (() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = String(localStorage.getItem(k)).slice(0, 60); } return o; })(), url: location.search, log: (typeof result !== "undefined" && result.log ? result.log : []).filter(s => /r5live|autopista|armador|gpuval|lector/.test(s)).slice(-12), audioTimeMs: h.audioTimeMs, keys: Object.keys(h).slice(0, 60)})) : null; } catch (e) { return String(e); } })(),
        gancho: (s => s ? {writes: s.writes, nCorr: s.nCorr, meanErrMs: s.meanErrMs} : null)(window.relojAudio?.stats?.()), calidadUsada: window.gh3Quality?.used ?? null, juegoPct: d?.speed?.juegoPct ?? null, imgS: d?.speed?.imgS ?? null,
        rend: q ? {recibidos: q.received, enviados: q.submitted, presentados: q.presented, ocupado: q.droppedBusy, vacios: q.emptySnapshots, omitidos: q.skips} : null}; }).catch(e => ({error: e.message}));
    const png = await p.locator('#r5Canvas').screenshot({path: path.join(out, `${pre}-${s}s.png`)}).catch(() => null);
    m.s = s; m.captura = png ? crypto.createHash('sha1').update(png).digest('hex').slice(0, 12) : null; if (m.captura) hashes.push(m.captura);
    r.muestras.push(m); write();
    if (s < SEG) await nap(5000);
  }
  // Claude 2026-10-22: tipos de mensajes en el canal hw60 durante 3 s (¿el lector de la capa manda algo?).
  r.canalHw60 = await p.evaluate(async () => { const c = new BroadcastChannel('hw60'), n = {}; c.onmessage = e => { const t = e.data?.type; n[t] = (n[t] || 0) + 1; if (t === 'frame' && !n.ej) n.ej = {draws: e.data.draws?.length, stats: e.data.stats}; }; await new Promise(r => setTimeout(r, 3000)); c.close(); return n; }).catch(e => e.message);
  await p.screenshot({path: path.join(out, 'pagina.png')}).catch(() => {});
  const a = r.muestras[0]?.rend, z = r.muestras.at(-1)?.rend;
  r.presentadosEnTramo = a && z ? z.presentados - a.presentados : null;
  r.capturasDistintas = new Set(hashes).size;
  r.congelada = r.capturasDistintas <= 1 || r.presentadosEnTramo === 0;
  r.ok = true;
} catch (e) { r.error = e.message; } finally { write(); await b.close(); console.log(out); console.log(JSON.stringify({ok: r.ok, error: r.error, webgpu: r.webgpu, cargador: r.cargador, menuMs: r.menuMs, tema: r.tema, cancionMs: r.cancionMs, presentadosEnTramo: r.presentadosEnTramo, capturasDistintas: r.capturasDistintas, congelada: r.congelada, ultima: r.muestras.at(-1), errores: r.errores.slice(0, 5)})); }
