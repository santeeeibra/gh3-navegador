// Accesos rápidos de prueba (Claude 2026-10-15, plan GH3 liviano punto 2).
// Arranca GH3 con el perfil caliente (caché de partes + partida guardada) por fast-start y va directo a una situación
// usando los menús ORIGINALES del juego (Práctica / Partida rápida), sin guardar ni restaurar estados internos.
// Plazo global ESTRICTO (por defecto 90 s desde que arranca el proceso): al vencer cierra Edge, el servidor y libera el turno.
// Sin reintentos automáticos. Turno ocupado = no corre (no espera).
//
// Uso:  node tools/accesos/acceso.mjs <escenario> [opciones]
//   menu       → menú principal (mide el arranque)
//   practica   → Training > Practice > tema > guitarra > dificultad > sección --seccion N (0 = canción entera, 1 = Intro, ...) hasta --fin M
//                (M bajadas desde la que propone el juego) > velocidad completa. --robot = toca perfecto.
//   rapida     → Partida rápida sin robot (para --manual, o para medir S segundos).
//   bien       → Partida rápida + robot que acierta todo.
//   errores    → Partida rápida + robot que deja pasar las notas entre --omitir 8-18 (segundos de canción).
//   estrella   → Partida rápida + robot que acierta y aprieta Back (poder estelar) cada 3 s desde --desde 10 s.
//   derrota    → Partida rápida sin tocar; termina cuando el reloj de la canción se detiene (pantalla SONG FAILED).
//   mira       → Partida rápida + robot que MIRA la autopista (tools/accesos/robot-visual.mjs), sin chart. --viaje ms (def. 116, de la línea y 560 al botón) --ajuste ms (def. 0).
//   --contar   → con bien/errores/estrella: además cuenta las gemas que el juego deja pasar (fallos vistos), para comparar con mira.
//   explorar   → aprieta --pasos d,d,a... desde el menú con una captura por paso (--cancion espera el reloj).
// Viabilidad: --q 'sinvisual=1' (parámetros extra de URL)  --espia (contadores por función, build espía)
// Escena (2026-10-16): --calidad completo|liviano|muy (fija gh3q antes de cargar; PC usa «liviano» = sin escenario por defecto)
// Medir: --nucleos 5 (2 núcleos ≈ iPhone, desde la canción)  --cpu (perfil de CPU de todos los hilos en el tramo)
// Opciones: --tema slowride|talkdirtytome|hitmewithyourbestshot|storyofmylife  --segundos S (de canción, def. 20)
//           --plazo 90  --ver (Edge visible)  --manual (Edge visible, sin robot ni plazo una vez llegado: juega Santi; libera el turno al cerrar)
// Resultado: artifacts/gh3-liviano/accesos/<hora>-<escenario>/resultado.json (+ resumen de señales) y capturas.
import fs from 'node:fs';
import path from 'node:path';
import {startGame} from '../d1-wasm/fast-start.mjs';
import {execFileSync} from 'node:child_process';
import {startCpuProfile} from '../d1-wasm/cpu-prof.mjs';
import {volcadoMemoria} from '../accesos/mem-volcado.mjs';
import {memoriaJs} from '../accesos/mem-js.mjs';
import {FIRST_FOUR} from '../local-loader/songs.mjs';
import {leerChart, instalarRobot, initMemoria} from './robot-timeline.mjs';
import {initVisual, instalarVisual, atrasos, cruces} from './robot-visual-probe.mjs';

const T0 = Date.now();
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const escenario = args[0] && !args[0].startsWith('--') ? args[0] : 'menu';
const ESCENARIOS = ['menu', 'practica', 'rapida', 'bien', 'errores', 'estrella', 'derrota', 'explorar', 'mira'];
if (!ESCENARIOS.includes(escenario)) { console.log('Escenarios: ' + ESCENARIOS.join(', ')); process.exit(1); }
const manual = opt('manual', false) === true, tema = String(opt('tema', 'slowride'));
if (!FIRST_FOUR.includes(tema)) { console.log('Temas comprobados: ' + FIRST_FOUR.join(', ')); process.exit(1); }
const PLAZO = Number(opt('plazo', 90)) * 1000, deadline = T0 + PLAZO, SEG = Number(opt('segundos', 20)) * 1000;
const ROOT = opt('root', 'artifacts/d1-wasm/autopista60-pub/demo'), PERFIL = opt('perfil', 'accesos');
const out = path.resolve('artifacts/gh3-liviano/accesos', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + escenario);
fs.mkdirSync(out, {recursive: true});
const nap = ms => new Promise(r => setTimeout(r, ms));
const res = {escenario, tema, manual, plazoS: PLAZO / 1000, root: ROOT, perfil: PERFIL, inicio: new Date(T0).toISOString(), pasos: [], muestras: [], errores: []};
const write = () => fs.writeFileSync(path.join(out, 'resultado.json'), JSON.stringify(res, null, 1));
const t = () => Date.now() - T0;

// Perfil propio: la primera vez se copia del perfil 'auditoria' (mismo puerto 5491 y mismos datos, manifest 1fb7de0a) para no descargar de nuevo.
const prof = path.resolve('artifacts/d1-wasm/perfil-pruebas', PERFIL);
if (!fs.existsSync(prof)) { const src = path.resolve('artifacts/d1-wasm/perfil-pruebas/auditoria'); if (fs.existsSync(src)) { fs.cpSync(src, prof, {recursive: true}); res.perfilCopiadoDe = 'auditoria'; } }

let g = null, cerrado = false, cpuProf = null; const CDP = 9333;
const cerrar = async motivo => { if (cerrado) return; cerrado = true; res.fin = {motivo, ms: t()}; try { await g?.close(); } catch (e) { res.errores.push('cerrar: ' + e.message); } write(); };
// Corte duro: aunque algo quede colgado, a los PLAZO+10 s se cierra todo.
let duro = setTimeout(async () => { res.errores.push('corte duro por plazo'); await cerrar('corte duro'); process.exit(2); }, PLAZO + 10000);
const left = () => { if (Date.now() > deadline) throw Error('Se acabó el plazo global (' + PLAZO / 1000 + ' s) en: ' + (res.pasos.at(-1)?.paso || 'arranque')); };

const muestra = async etiqueta => {
  const s = await g.page.evaluate(() => { const d = window.gh3Diag, a = window.d4?.r6Audio, h = window.hw60;
    return {song: window.songPak || null, clock: window.gh3Song?.clock?.() ?? null, etapa: d?.stage, juegoPct: d?.speed?.juegoPct ?? null, relojPct: d?.speed?.relojPct ?? null,
      imgEscenaS: d?.speed?.imgS ?? null, capaMostradas: h?.shown ?? null, capaDtMs: h?.dtMs != null ? Math.round(h.dtMs) : null, probe: window.syncProbe?.latest, capaAdelantoMs: h?.offsetMs ?? null, clockMode: h?.clockMode, gameClock: h?.gameClock, capaGaps: h?.shownGaps, capaHolds: h?.holds, capaOutOfRange: h?.outOfRange, audioRetrasoMs: a?.lag != null ? Math.round(a.lag / 48) : null, audioRitmo: a?.productionRatio != null ? +a.productionRatio.toFixed(3) : null, gov: window.gh3Governor?.summary?.()?.medidas ?? null, calidad: window.gh3Quality?.used ?? null, rend: (r => r ? {recibidos: r.received, enviados: r.submitted, presentados: r.presented, ocupado: r.droppedBusy, vacios: r.emptySnapshots, gob: r.governorSkipped, t: r.timing, omitidos: r.skips, rec: r.resourceStats} : null)(window.d4?.songRenderer), relojMenosAudioMs: h?.audioTimeMs != null && window.gh3Song?.clock ? Math.round(window.gh3Song.clock() - h.audioTimeMs) : null, cortes: a?.underruns ?? null, saltos: a?.skips ?? null, robot: window.botStats ? {...window.botStats} : null, mira: window.visBot ? (({tiras, strums, muestras, ...v}) => ({...v, strums: strums?.length}))(window.visBot) : null, entrada: window.gh3Input?.stats ? JSON.parse(JSON.stringify(window.gh3Input.stats)) : null, cancionModo: !!window.gh3Input?.songMode?.(),
      capaDom: (() => { const g = document.getElementById('r5Canvas'), c = [...document.querySelectorAll('canvas')].find(x => x !== g && x.style.zIndex); if (!g || !c) return null; const rg = g.getBoundingClientRect(), rc = c.getBoundingClientRect(), cx = rc.left + rc.width / 2, cy = rc.top + rc.height * 0.6;
        const enc = document.elementsFromPoint(cx, cy).slice(0, 5).map(e => e.tagName + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') + ' z' + getComputedStyle(e).zIndex + ' op' + getComputedStyle(e).opacity);
        return {display: c.style.display, z: c.style.zIndex, cajaCapa: [rc.left, rc.top, rc.width, rc.height].map(Math.round), cajaJuego: [rg.left, rg.top, rg.width, rg.height].map(Math.round), zJuego: getComputedStyle(g).zIndex, posJuego: getComputedStyle(g).position, padreCapa: c.parentElement?.tagName, padreJuego: g.parentElement?.id || g.parentElement?.tagName, encima: enc, ctxPerdido: c.getContext('webgl2')?.isContextLost?.()}; })()}; }).catch(e => ({error: e.message}));
  // --mem: memoria por proceso de Edge (paso 4, iPhone) + lo que ve el diag de la página.
  if (opt('mem', false)) { try { s.procesos = JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/accesos/mem-procesos.ps1', 'perfil-pruebas?' + PERFIL])).trim() || '[]'); } catch (e) { s.procesos = 'error: ' + e.message.slice(0, 120); }
    s.diagMem = await g.page.evaluate(() => { const m = window.gh3Diag?.mem; return m ? JSON.parse(JSON.stringify(m)) : null; }).catch(() => null); }
  res.muestras.push({ms: t(), etiqueta, ...s}); write(); return s;
};
// --mem: mapa de la memoria wasm (en el worker que la tiene): MB con datos (no cero) por tramo de 64 MB.
// Las páginas que quedaron en cero casi seguro nunca se tocaron (no cuentan para iOS); las demás sí.
const memMapa = async etiqueta => {
  if (!opt('mem', false)) return;
  for (const w of g.page.workers()) {
    const m = await w.evaluate(DET => { if (typeof wasmMemory === 'undefined') return null; const b = wasmMemory.buffer, n = b.byteLength, u = new Uint32Array(b), P = 1024, tramos = [];
      let usadas = 0; for (let base = 0; base < n / 4; base += 16 * 1048576) { let c = 0; const fin = Math.min(n / 4, base + 16 * 1048576);
        for (let p = base; p < fin; p += P) { for (let i = p; i < p + P; i += 4) if (u[i] | u[i + 1] | u[i + 2] | u[i + 3]) { c++; break; } }
        tramos.push(Math.round(c * 4 / 1024)); usadas += c; }
      // Tabla rexwasm_seg[256] (host - inicio de vista, por segmento de 16 MB): 0xA0..0xBF iguales, 0xC0..0xDF iguales, 0x80..0x8F iguales.
      let seg = null; for (let i = 0; i < Math.min(n / 4, 16777216) - 256 && !seg; i++) { const A = u[i + 0xA0]; if (!A || u[i + 0xBF] !== A || u[i + 0xB0] !== A || u[i + 0xC0] === A || u[i + 0xDF] !== u[i + 0xC0] || u[i + 0x80] !== u[i + 0x8F] || u[i + 0x80] === A) continue;
        let ok = true; for (let k = 0xA0; k <= 0xBF && ok; k++) ok = u[i + k] === A; if (ok) seg = i; }
      const MB = x => Math.round(x / 1048576 * 10) / 10, host = s => (u[seg + s] + s * 16777216) >>> 0;
      const mapa = seg == null ? null : {tablaEn: MB(seg * 4), xex: MB(host(0x80)), fisica: MB(host(0xA0)), relleno: MB(host(0x01)),
        virtuales: Object.fromEntries([...Array(0x7F).keys()].filter(s => host(s) !== host(0x01) || s === 0x01).map(s => ['seg' + s.toString(16), MB(host(s))]))};
      // KB con datos por cada MB (para cruzar con lo residente que mide Windows).
      const por1MB = []; for (let base = 0; base < n / 4; base += 262144) { let c = 0; for (let p = base; p < base + 262144; p += P) { for (let i = p; i < p + P; i += 4) if (u[i] | u[i + 1] | u[i + 2] | u[i + 3]) { c++; break; } } por1MB.push(c * 4); }
      // --memdetalle A-B: páginas de 4 KB con datos (índice dentro del MB) y primeras palabras, para los MB A..B.
      const det = {}; const [dA, dB] = String(DET).split('-').map(Number);
      if (DET) for (let mb = dA; mb <= dB; mb++) { const pg = []; for (let k = 0; k < 256; k++) { const p = mb * 262144 + k * 1024; for (let i = p; i < p + 1024; i += 4) if (u[i] | u[i + 1] | u[i + 2] | u[i + 3]) { pg.push(k + ':' + [...u.subarray(i, i + 4)].map(x => x.toString(16)).join('.') + '@' + (i - p) * 4); break; } } det[mb] = pg; }
      // Build memdiag: tabla gh3_big_alloc (magic 'MEMG', tamaño, dirección, orden, hilo) de reservas >= 256 KB.
      let reservas = null; for (let i = 0; i < Math.min(n / 4, 16777216); i++) if (u[i] === 0x474D454D && u[i + 3] < 4096 && u[i - 5 * u[i + 3]] === 0x474D454D) {
        const t0 = i - 5 * u[i + 3], lista = []; for (let k = 0; k < 4096 && u[t0 + 5 * k] === 0x474D454D; k++) lista.push([u[t0 + 5 * k + 1], u[t0 + 5 * k + 2], u[t0 + 5 * k + 4]]);
        const g = {}; for (const [sz, ptr, hilo] of lista) { const e = g[sz] ||= {veces: 0, MB: 0, desdeMB: 1e9, hastaMB: 0, hilos: new Set()}; e.veces++; e.MB += sz / 1048576; e.desdeMB = Math.min(e.desdeMB, ptr / 1048576); e.hastaMB = Math.max(e.hastaMB, (ptr + sz) / 1048576); e.hilos.add(hilo); }
        reservas = {total: lista.length, MB: Math.round(lista.reduce((x, y) => x + y[0], 0) / 1048576), porTamano: Object.entries(g).sort((x, y) => y[1].MB - x[1].MB).slice(0, 25).map(([sz, e]) => ({tamanoKB: Math.round(sz / 1024), veces: e.veces, MB: Math.round(e.MB), desdeMB: Math.round(e.desdeMB), hastaMB: Math.round(e.hastaMB), hilos: e.hilos.size}))}; break; }
      return {totalMB: Math.round(n / 1048576), conDatosMB: Math.round(usadas * 4 / 1024), por64MB: tramos, mapa, por1MB_KB: por1MB, detalle: det, reservas}; }, opt('memdetalle', '')).catch(e => ({error: e.message}));
    if (m) { (res.memMapa ||= []).push({ms: t(), etiqueta, worker: w.url().split('/').pop(), ...m}); write(); return; }
  }
};
const shot = async name => { if (opt('pagina', false) !== true) return g.shot(path.join(out, name + '.png')); const b = await g.page.locator('#r5Canvas').boundingBox().catch(() => null); if (b) await g.page.screenshot({path: path.join(out, name + '.png'), clip: b}).catch(() => {}); };  // --pagina: incluye la capa autopista60
const pasos = async (lista, etiqueta) => { for (const p of lista) { left(); await g.tap(p, Number(opt('espera', 1800))); } res.pasos.push({ms: t(), paso: etiqueta}); write(); };
const bajar = n => Array(Math.max(0, n)).fill('d');

// Resumen de señales en el tramo de canción (reloj > 0): lo que también mostraría el monitor.
function resumen() {
  const c = res.muestras.filter(m => m.clock > 0 && m.song);
  if (c.length < 2) return null;
  const a = c[0], b = c.at(-1), dt = (b.ms - a.ms) / 1000, prom = k => { const v = c.map(m => m[k]).filter(Number.isFinite); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
  return {segundosMedidos: +dt.toFixed(1), relojDesde: Math.round(a.clock), relojHasta: Math.round(b.clock), juegoPctProm: prom('juegoPct'), juegoPctPeor: Math.min(...c.map(m => m.juegoPct).filter(Number.isFinite)),
    imgEscenaSProm: prom('imgEscenaS'), capaImgS: a.capaMostradas != null ? +((b.capaMostradas - a.capaMostradas) / dt).toFixed(1) : null,
    cortesEnTramo: b.cortes - a.cortes, saltosEnTramo: b.saltos - a.saltos, robot: b.robot};
}

try {
  const visual = !manual && (escenario === 'mira' || opt('contar', false) === true);
  const robot = !manual && (['bien', 'errores', 'estrella'].includes(escenario) || (escenario === 'practica' && opt('robot', false) === true));
  g = await startGame({nombre: PERFIL, root: ROOT, query: 'manual=1&diag=1&prueba=codex' + (opt('adelanto', false) ? '&a60off=' + Number(opt('adelanto')) : '') + (opt('q', false) ? '&' + opt('q') : ''), owner: 'Codex (sincronía local)',
    headless: !(manual || opt('ver', false) === true), deadline: manual ? T0 + 180000 : deadline, esperarTurno: false, init: opt('calidad', false) ? `(${(visual ? initVisual : initMemoria).toString()})();try{localStorage.setItem('gh3q',${JSON.stringify(String(opt('calidad')))})}catch{}` : (visual ? initVisual : initMemoria),
    args: opt('cpu', false) || opt('volcado', false) || opt('js', false) ? ['--remote-debugging-port=' + CDP] : [],
    // --movil: pantalla horizontal de iPhone con toque (la página entra en su modo celular).
    ctx: opt('movil', false) ? {isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'} : {}, ...(opt('movil', false) ? {viewport: {width: 844, height: 390}} : {})});
  res.marcas = g.marks; res.pasos.push({ms: t(), paso: 'menú principal'}); write();
  // En Práctica la página no recibe 'songPlaying' y su cartel «Cargando la canción» queda encima del juego (zona Codex, avisado): se oculta sólo aquí.
  await g.page.addStyleTag({content: '#gameLoading{display:none!important}'});
  res.calidadGuardada = await g.page.evaluate(() => { try { return localStorage.getItem('gh3q'); } catch { return null; } });
  res.calidadUsada = await g.page.evaluate(() => window.gh3Quality || null).catch(() => null);
  await muestra('menu');
  if (opt('esperamenu', false)) await nap(Number(opt('esperamenu')) * 1000);  // build lento (espía): el menú tarda en aceptar teclas
  if (robot) { const omitir = escenario === 'errores' ? String(opt('omitir', '8-18')).split('-').map(x => Number(x) * 1000) : null;
    await instalarRobot(g.page, leerChart(tema), {omitir, estrella: escenario === 'estrella' ? Number(opt('desde', 10)) * 1000 : 0}); res.robot = {omitir, estrella: escenario === 'estrella'}; }
  if (visual) { await instalarVisual(g.page, {modo: escenario === 'mira' ? 'mira' : 'contar', ajusteMs: Number(opt('ajuste', 0)), viajeMs: Number(opt('viaje', 116)), sincro: opt('sincro', false) === true ? 'imagen' : opt('sincro', false)}); res.visual = {modo: escenario === 'mira' ? 'mira' : 'contar'}; }

  // --cpu en el menú (escena 2026-10-16): perfil de CPU de --segundos S quieto en el menú principal.
  if (escenario === 'menu' && opt('cpu', false)) { cpuProf = await startCpuProfile(CDP); res.cpuPerfil = {objetivos: cpuProf.count, desdeMs: t()}; for (let k = 0; k < SEG / 2000; k++) { await nap(2000); await muestra('menu-cpu'); } res.cpuPerfil.hastaMs = t(); res.cpuPerfil.archivos = (await cpuProf.stop(out)).length; cpuProf = null; }
  if (escenario === 'explorar') {
    for (const [i, p] of String(opt('pasos', '')).split(',').filter(Boolean).entries()) {
      left(); await g.tap(p, Number(opt('espera', 1800))); res.pasos.push({ms: t(), paso: p}); await shot(String(i + 1).padStart(2, '0') + '-' + p); await muestra('paso ' + (i + 1));
    }
  } else if (escenario === 'practica') {
    await pasos(['d', 'd', 'd', 'd', 'a', 'd', 'a'], 'Training > Practice');
    await pasos([...bajar(FIRST_FOUR.indexOf(tema)), 'a', 'a', 'a'], 'tema, guitarra, dificultad');
    await pasos([...bajar(Number(opt('seccion', 2))), 'a', ...bajar(Number(opt('fin', 0))), 'a', 'a'], 'sección y velocidad completa');
  } else if (escenario !== 'menu') {
    await pasos(['d', 'd', 'a', ...bajar(FIRST_FOUR.indexOf(tema))], 'Partida rápida');
    // La lista puede tardar en aceptar botones: A otra vez sólo mientras el juego no abrió el tema (máx. 4).
    for (let k = 0; k < Number(opt('aceptar', 4)) && !(await g.page.evaluate(() => window.songPak)); k++) { left(); await g.tap('a', Number(opt('gapa', 2500))); }  // --aceptar N --gapa ms: juego lento (calidad completa)
    res.pasos.push({ms: t(), paso: 'tema elegido: ' + await g.page.evaluate(() => window.songPak)}); write();
  }

  if (escenario !== 'menu' && escenario !== 'explorar') {
    // Esperar a que corra el reloj de la canción.
    while (!((await muestra('entrando')).clock > 0)) { if (manual ? t() > 180000 : Date.now() > deadline - 3000) throw Error('La canción no arrancó dentro del plazo.'); await nap(1000); }
    res.pasos.push({ms: t(), paso: 'canción en marcha'}); await shot('inicio-cancion');
    // --sonda: piezas que dibuja la capa autopista (cajas en coordenadas 1280×720) + captura con capa, para ubicar botones y gemas.
    if (opt('sonda', false)) for (let i = 0; i < 6; i++) { await nap(700); const d = await g.page.evaluate(() => ({clock: window.gh3Song?.clock?.(), cv: [document.getElementById('hw60Canvas')?.width, document.getElementById('hw60Canvas')?.height], piezas: window.hw60?.dump?.()})); fs.writeFileSync(path.join(out, 'sonda-' + i + '.json'), JSON.stringify(d)); const b = await g.page.locator('#hw60Canvas').boundingBox().catch(() => null); if (b) await g.page.screenshot({path: path.join(out, 'sonda-' + i + '.png'), clip: b}).catch(() => {}); }
    // --nucleos MASCARA (p. ej. 5 = CPU lógicas 0 y 2, banco «2 núcleos» ≈ iPhone): limita Edge desde que arranca la canción.
    if (opt('nucleos', false)) { res.nucleos = {mascara: Number(opt('nucleos')), procesos: Number(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/d1-wasm/set-affinity.ps1', String(Number(opt('nucleos'))), 'perfil-pruebas?' + PERFIL])).trim())}; await nap(3000); await muestra('nucleos'); }
    // --cpu: perfil de CPU de todos los hilos durante el tramo medido (cpu-*.cpuprofile en la carpeta de salida).
    if (opt('cpu', false)) { cpuProf = await startCpuProfile(CDP); res.cpuPerfil = {objetivos: cpuProf.count, desdeMs: t()}; }
    // --espia (viabilidad 2026-10-16): con un build espía (artifacts/viabilidad/espia/demo) cuenta llamadas por función cada 1 s → espia.json.
    if (opt('espia', false)) { await g.page.evaluate(fs.readFileSync('tools/re/re-page.js', 'utf8')); res.espia = await g.page.evaluate(() => window.reStart({everyMs: 1000})); write(); }
    if (manual) { clearTimeout(duro); duro = null; console.log('Listo: jugá. Cerrá la ventana de Edge para terminar y liberar el turno.');
      let abierto = true; g.browser.on('close', () => { abierto = false; });
      // Mientras juega Santi: muestra cada 2 s (reloj, puntaje no, pero sí qué botones manda la página y el mando) + captura cada 10 s.
      for (let k = 0; abierto; k++) { await nap(2000); if (!abierto) break; const s = await muestra('manual'); if (s.error) break; if (k % 5 === 4) await g.page.screenshot({path: path.join(out, 'manual-' + Math.round((s.clock ?? 0) / 1000) + 's.png')}).catch(() => {}); } res.pasos.push({ms: t(), paso: 'Santi cerró la ventana'}); }
    else {
      const desde = res.muestras.at(-1).clock; let quieto = 0, k = 0;
      while (Date.now() < deadline - 4000) {
        await nap(2000); const s = await muestra('cancion'), p = res.muestras.at(-2);
        if (++k % (opt('pagina', false) ? 1 : 4) === 0) await shot('c-' + Math.round(s.clock / 1000) + 's');
        quieto = p && s.clock === p.clock ? quieto + 1 : 0;
        if (quieto >= 2) { res.relojDetenido = Math.round(s.clock); res.pasos.push({ms: t(), paso: 'reloj detenido en ' + Math.round(s.clock) + ' ms (derrota o pausa)'}); await nap(1500); await shot('reloj-detenido'); break; }
        // --rafaga S: a los S s de canción, 8 capturas seguidas (con --pagina incluyen la capa autopista).
        if (opt('rafaga', false) && !res.rafaga && s.clock - desde >= Number(opt('rafaga')) * 1000) {
          res.rafaga = [];
          for (let i = 0; i < 8; i++) { const c = await g.page.evaluate(() => ({clock: window.gh3Song?.clock?.(), dt: window.hw60?.dtMs, vis: window.hw60?.visualTimeMs})); res.rafaga.push(c); await shot('r' + i + '-' + Math.round(c.clock)); }
          write();
        }
        // --pausa S: a los S s de canción aprieta Start, mira la capa autopista y reanuda.
        if (opt('pausa', false) && !res.pausa && s.clock - desde >= Number(opt('pausa')) * 1000) {
          const capa = () => g.page.evaluate(() => ({paused: window.hw60?.paused, display: document.querySelector('canvas[style*="z-index"]:not(#r5Canvas)')?.style.display ?? null, clock: window.gh3Song?.clock?.()}));
          await g.tap('start', 2000); res.pausa = {enPausa: await capa()}; await shot('pausa');
          await g.tap('start', 2500); res.pausa.reanudado = await capa(); await shot('reanudado'); write(); break;
        }
        if (escenario !== 'derrota' && s.clock - desde >= SEG) break;
      }
      if (opt('espia', false)) { const d = await g.page.evaluate(() => window.reDrain()).catch(e => ({error: e.message})); fs.writeFileSync(path.join(out, 'espia.json'), JSON.stringify(d)); res.espia = {...res.espia, muestras: d.samples?.length, error: d.error}; }
      res.sinVisual = await g.page.evaluate(() => window.gh3SinVisual || null).catch(() => null);
      if (cpuProf) { res.cpuPerfil.hastaMs = t(); res.cpuPerfil.archivos = (await cpuProf.stop(out)).length; cpuProf = null; }
      if (escenario === 'derrota' && res.relojDetenido == null) throw Error('No se vio la derrota dentro del plazo.');
    }
  }
  // --volcado: desglose interno de memoria de Edge por proceso (memory-infra), al final del tramo.
  if (opt('volcado', false)) { try { res.volcado = await volcadoMemoria(CDP, path.join(out, 'volcado-memoria.json')); } catch (e) { res.errores.push('volcado: ' + e.message); } write(); }
  // --js: memoria JavaScript (montículo + buffers) de cada hilo, por CDP.
  if (opt('js', false)) { try { res.memJs = await memoriaJs(CDP); } catch (e) { res.errores.push('js: ' + e.message); } write(); }
  // --regiones: mapa de memoria del renderer más grande leído desde Windows (código compilado / wasm / resto).
  if (opt('regiones', false)) { try { const ps = JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/accesos/mem-procesos.ps1', 'perfil-pruebas?' + PERFIL]))); const r = ps.filter(p => p.tipo === 'renderer').sort((a, b) => b.privadaMB - a.privadaMB)[0];
    res.regiones = {proceso: r, mapa: JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/accesos/mem-regiones.ps1', String(r.pid)])))}; } catch (e) { res.errores.push('regiones: ' + e.message.slice(0, 200)); } write(); }
  await memMapa('final (después de la última muestra: leer toda la memoria la toca)');
  if (visual) { const vb = await g.page.evaluate(() => window.visBot).catch(() => null);
    if (vb) { vb.tiras.forEach((x, i) => fs.writeFileSync(path.join(out, 'tira-' + i + '.json'), JSON.stringify(x))); res.visual = {...res.visual, ...vb, tiras: vb.tiras.length, strums: vb.strums?.length ?? null, atraso: vb.strums ? atrasos(vb.strums, tema) : null, cruce560: cruces(vb.cruces, tema), cruces: vb.cruces.length, costoMsProm: +(vb.costoMs / Math.max(1, vb.cuadros)).toFixed(2)};
      if (vb.strums) fs.writeFileSync(path.join(out, 'rasgueos-mira.json'), JSON.stringify(vb.strums)); write(); } }
  res.senales = resumen(); res.erroresPagina = g.errors; res.ok = !g.errors.length;
} catch (e) { res.ok = false; res.error = e.message; try { await shot('ultimo'); } catch {} res.senales = resumen(); }
finally { try { if(g) {const probe=await g.page.evaluate(()=>({...window.syncProbe,judgements:window.syncJudgements})); fs.writeFileSync(path.join(out,'sync-probe.json'),JSON.stringify(probe));} }catch(e){res.errores.push('probe: '+e.message);} if (duro) clearTimeout(duro); if (opt('calidad', false) && g) res.registroFinal = await g.page.evaluate(() => (window.d4?.log || []).slice(-60)).catch(e => ['error: ' + e.message]); await cerrar(res.ok ? 'terminado' : 'error');
  console.log(JSON.stringify({ok: res.ok, error: res.error, ms: t(), pasos: res.pasos.map(p => p.paso + '@' + Math.round(p.ms / 1000) + 's'), senales: res.senales, out}));
  if (!res.ok) process.exitCode = 1; process.exit(); }
