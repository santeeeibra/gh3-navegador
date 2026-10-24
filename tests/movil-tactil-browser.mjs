// Controles táctiles (Claude 2026-10-13): prueba de navegador SIN el juego, con emulación de iPhone 11 en Chromium.
// A) canción simulada (página mínima con gh3-input.js + gh3-touch.js + gh3-landscape.js y un mando en memoria compartida):
//    zonas sobre los aros, bordes visibles, respuesta en el mismo evento, acordes, sostenidas, repetidas, deslizar,
//    cancelación, pérdida de foco, orientación, ajustes guardados y migrados, vista previa, botones y estrella.
// B) página real (index.html) antes de Jugar: aviso, prueba de 5 colores sin pedidos de red ni entradas al mando, ajustes,
//    rasgueo manual/automático y «Jugar» como acción directa.
// C) PC: sin táctil salvo ?touch=1; ?touch=0 lo apaga en celular.
// Uso: node tests/movil-tactil-browser.mjs   (resultado en artifacts/movil-tactil/verification.json)
// Es emulación: NO reemplaza la prueba física en el iPhone 11.
import fs from 'node:fs';
import {serveWeb, launch, IPHONE11_LANDSCAPE, checker} from './lib/movil-server.mjs';

const out = 'artifacts/movil-tactil'; fs.mkdirSync(out, {recursive: true});
const report = {checks: [], errors: [], emulation: 'Chromium + iPhone 11 (896x414, dpr 2, táctil). No es el dispositivo físico.'};
const check = checker(report);
const fixture = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>body{margin:0;background:#000}#r5Canvas{position:fixed;inset:0;width:100vw;height:100vh;object-fit:contain}</style>
<canvas id="r5Canvas" width="1280" height="720"></canvas>
<script src="/gh3-input.js"></script>
<script>window.song=true;gh3Input.songMode=()=>window.song;const memory=new SharedArrayBuffer(64);gh3Input.attach(memory,0);
window.i32=new Int32Array(memory,0,11);window.state=()=>({frets:gh3Input.stats.frets,buttons:gh3Input.stats.buttons});
window.setTouchCalls=0;const o=gh3Input.setTouch;gh3Input.setTouch=(...a)=>{window.setTouchCalls++;return o(...a);};
window.taps=[];const ot=gh3Input.tap;gh3Input.tap=(n)=>{taps.push(n);return ot(n);};</script>
<script src="/gh3-touch.js"></script><script src="/gh3-landscape.js"></script>`;
// Lista de archivos FALSA (sin datos del juego): sólo para que el cargador habilite «Jugar».
const fakeManifest = JSON.stringify({format: 1, chunkSize: 1048576, version: 'a'.repeat(64), files: [{id: 0, path: 'default.xex', size: 4, chunks: [{offset: 0, size: 4, hash: 'b'.repeat(64)}]}, {id: 1, path: 'data/songs/x.pak.xen', size: 4, chunks: [{offset: 0, size: 4, hash: 'c'.repeat(64)}]}], packages: {base: {files: [0]}, slowride: {title: 'Prueba', files: [1]}}});
const web = await serveWeb({routes: {'/fixture': {body: fixture}, '/gh3/manifest.json': {body: fakeManifest, type: 'application/json'}}});
const browser = await launch();
const page404 = (p) => p.on('pageerror', (e) => report.errors.push(e.message));

async function touchTools(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  const send = async (type, pts, wait = 20) => { await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts}); if (wait) await page.waitForTimeout(wait); };
  return {send, end: () => send('touchEnd', [])};
}

try {
  // ---------------- A) canción simulada ----------------
  {
    const ctx = await browser.newContext(IPHONE11_LANDSCAPE), page = await ctx.newPage(); page404(page);
    await page.goto(web.url + '/fixture'); await page.waitForFunction(() => window.gh3Touch?.enabled());
    const {send, end} = await touchTools(ctx, page);
    const rects = () => page.evaluate(() => [...document.querySelectorAll('#gh3Touch [data-fret]')].map((z) => { const r = z.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, top: r.top, bottom: r.bottom}; }));
    let zones = await rects();
    const fret = (i, id = i + 1, z = zones) => ({x: z[i].x, y: z[i].y, id});
    const frets = () => page.evaluate(() => state().frets);
    for (let i = 0; i < 5; i++) { await send('touchStart', [fret(i)]); check(`A canción: zona ${i} = traste ${i}`, (await frets()) === (1 << i)); await end(); }
    // 896x414 con 16:9 contain: imagen 736x414 desde x=80. Aro i en x = 80 + 736·(.34+i·.08), y = 414·.885.
    check('A alineación con la imagen visible (contain y bandas negras)', zones.every((z, i) => Math.abs(z.x - (80 + 736 * (.34 + i * .08))) < 1) && Math.abs(zones[0].top + zones[0].h / 2 - 414 * .885) < 1, zones.map((z) => [Math.round(z.x), Math.round(z.y)]));
    const look = await page.evaluate(() => [...document.querySelectorAll('#gh3Touch [data-fret]')].map((z) => { const s = getComputedStyle(z); return {border: s.borderTopColor, width: s.borderTopWidth, bg: s.backgroundColor}; }));
    const alpha = (c) => { const m = /rgba?\(([^)]+)\)/.exec(c) || /color\(srgb ([^)]+)\)/.exec(c); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return p.length > 3 ? p[3] : 1; };
    check('A bordes tenues visibles sin apretar y sin relleno', look.every((l) => alpha(l.border) > .2 && alpha(l.border) < .8 && l.width === '2px' && (alpha(l.bg) === 0 || l.bg === 'rgba(0, 0, 0, 0)')), look[0]);
    // Respuesta en el mismo evento: un oyente de pointerdown en window (corre después del de las zonas) ya ve la clase .on.
    await page.evaluate(() => { window.sameEvent = null; addEventListener('pointerdown', (e) => { window.sameEvent = e.target.closest('[data-fret]')?.classList.contains('on') ?? null; }, {once: true}); });
    await send('touchStart', [fret(2)]);
    check('A respuesta inmediata: la zona se ilumina dentro del mismo evento de toque', await page.evaluate(() => window.sameEvent === true));
    check('A al apretar hay relleno y borde pleno', await page.evaluate(() => { const s = getComputedStyle(document.querySelector('#gh3Touch .f2')); return s.backgroundColor !== 'rgba(0, 0, 0, 0)'; }));
    check('A el toque llega al mando compartido (SAB)', await page.evaluate(() => (Atomics.load(i32, 1) & 0x0200) !== 0));  // amarillo en canción = RB
    await end();
    check('A demora toque→mando medida', await page.evaluate(() => gh3Touch.stats.evN > 0 && gh3Touch.stats.evMaxMs >= 0), await page.evaluate(() => ({n: gh3Touch.stats.evN, max: +gh3Touch.stats.evMaxMs.toFixed(2)})));
    await send('touchStart', [fret(0), fret(2), fret(4)]); check('A acorde verde+amarillo+naranja', (await frets()) === 21);
    await send('touchStart', [0, 1, 2, 3, 4].map((i) => fret(i))); check('A acorde de cinco', (await frets()) === 31); await end();
    // Sostenida: 600 ms apretado sigue apretado, también en el mando.
    await send('touchStart', [fret(1)], 600);
    check('A nota sostenida se mantiene 600 ms', (await frets()) === 2 && await page.evaluate(() => (Atomics.load(i32, 1) & 0x0100) !== 0)); await end();
    check('A al soltar se libera en el mando', await page.evaluate(() => (Atomics.load(i32, 1) & 0x0100) === 0));
    // Repetidas con rasgueo automático: cada toque nuevo = un rasgueo.
    const s0 = await page.evaluate(() => gh3Touch.stats.strums);
    for (let k = 0; k < 4; k++) { await send('touchStart', [fret(3)], 60); await send('touchEnd', [], 60); }
    check('A notas repetidas: 4 toques = 4 rasgueos automáticos', (await page.evaluate(() => gh3Touch.stats.strums)) - s0 === 4);
    await send('touchStart', [fret(1, 11), fret(1, 12)]); await send('touchEnd', [fret(1, 12)]);
    check('A dos dedos en un color: soltar uno mantiene la nota', (await frets()) === 2); await end();
    await send('touchStart', [fret(0)]); await send('touchMove', [fret(3, 1)]); check('A deslizar de verde a azul', (await frets()) === 8);
    await send('touchCancel', []); check('A cancelación libera todo', (await frets()) === 0);
    await send('touchStart', [fret(0)]); await page.evaluate(() => dispatchEvent(new Event('blur')));
    check('A pérdida de foco libera todo', (await frets()) === 0); await end();
    await send('touchStart', [fret(4)]);
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); delete document.visibilityState; });
    check('A pasar a segundo plano libera todo', (await frets()) === 0); await end();
    // Estrella (BACK) y botones Volver/Start; cruceta sólo fuera de la canción.
    const star = await page.locator('#gh3Touch .star').boundingBox();
    await send('touchStart', [{x: star.x + star.width / 2, y: star.y + star.height / 2, id: 3}]);
    check('A poder estelar = BACK', await page.evaluate(() => (state().buttons & 0x20) !== 0)); await end();
    await page.locator('#gh3Touch .nav.back').tap(); await page.locator('#gh3Touch .nav.start').tap();
    check('A Volver y Start siguen funcionando', JSON.stringify(await page.evaluate(() => taps.slice(-2))) === '["b","start"]');
    await page.waitForTimeout(300);
    check('A cruceta oculta en la canción', await page.evaluate(() => getComputedStyle(document.querySelector('#gh3Touch .dpad')).display === 'none'));
    await page.evaluate(() => { window.song = false; }); await page.waitForTimeout(350);
    check('A cruceta visible en menús/pausa', await page.evaluate(() => getComputedStyle(document.querySelector('#gh3Touch .dpad')).display !== 'none'));
    await page.locator('#gh3Touch .dpad .down').tap();
    check('A cruceta manda Abajo', (await page.evaluate(() => taps.at(-1))) === 'down');
    await page.evaluate(() => { window.song = true; });
    // Rasgueo manual: zona RASGUEO + acorde.
    await page.evaluate(() => gh3Touch.setSettings({auto: 0}));
    const strum = await page.locator('#gh3Touch .strum').boundingBox(); zones = await rects();
    const sm = await page.evaluate(() => gh3Touch.stats.strums);
    await send('touchStart', [fret(0), fret(1), {id: 9, x: strum.x + strum.width / 2, y: strum.y + strum.height / 2}]);
    check('A rasgueo manual con acorde', (await frets()) === 3 && (await page.evaluate(() => gh3Touch.stats.strums)) === sm + 1); await end();
    await page.evaluate(() => gh3Touch.setSettings({auto: 1}));
    // Ajustes: botón «Controles», vista previa, deslizadores (incluida visibilidad), guardado y recarga.
    check('A botón «Controles» visible', (await page.locator('#gh3Touch .settings').textContent()) === 'Controles' && await page.locator('#gh3Touch .settings').isVisible());
    await page.locator('#gh3Touch .settings').tap();
    check('A vista previa al abrir Controles', await page.evaluate(() => document.getElementById('gh3Touch').classList.contains('preview')));
    await page.locator('#gh3Touch [name=offset]').fill('6'); await page.locator('#gh3Touch [name=width]').fill('80');
    await page.locator('#gh3Touch [name=height]').fill('24'); await page.locator('#gh3Touch [name=alpha]').fill('70');
    const cfg = await page.evaluate(() => gh3Touch.getSettings());
    check('A deslizadores cambian altura, ancho, tamaño y visibilidad', cfg.offset === 6 && cfg.width === 80 && cfg.height === 24 && cfg.alpha === 70, cfg);
    const adj = await rects();
    check('A ajustes mueven y redimensionan las zonas', adj[2].y !== zones[2].y && adj[2].w < zones[2].w && adj[2].h > zones[2].h);
    await send('touchStart', [{x: adj[4].x, y: adj[4].y, id: 1}]); check('A en vista previa un toque no aprieta', (await frets()) === 0); await end();
    await page.screenshot({path: out + '/cancion-ajustes.png'});
    await page.reload(); await page.waitForFunction(() => window.gh3Touch?.enabled());
    check('A ajustes conservados al recargar', JSON.stringify(await page.evaluate(() => gh3Touch.getSettings())) === JSON.stringify(cfg));
    check('A visibilidad aplicada al borde', await page.evaluate(() => document.getElementById('gh3Touch').style.getPropertyValue('--gh3-edge') === '70%'));
    // Migración: ajustes guardados antes de este cambio (sin alpha) se conservan.
    await page.evaluate(() => localStorage.setItem('gh3TouchZones.v1', JSON.stringify({offset: 5, width: 90, height: 20, auto: 0})));
    await page.reload(); await page.waitForFunction(() => window.gh3Touch?.enabled());
    check('A migración: ajustes viejos intactos + visibilidad inicial', JSON.stringify(await page.evaluate(() => gh3Touch.getSettings())) === JSON.stringify({offset: 5, width: 90, height: 20, auto: 0, alpha: 45}));
    await page.evaluate(() => localStorage.setItem('gh3TouchZones.v1', '{"offset":999,"width":-10,"height":"x","alpha":400}'));
    await page.reload(); await page.waitForFunction(() => window.gh3Touch?.enabled());
    check('A valores inválidos se acotan', JSON.stringify(await page.evaluate(() => gh3Touch.getSettings())) === JSON.stringify({offset: 20, width: 60, height: 18, auto: 1, alpha: 100}));
    await page.evaluate(() => gh3Touch.resetSettings());
    // Orientación: vertical y vuelta a horizontal.
    await send('touchStart', [fret(0, 1, await rects())]);
    await page.setViewportSize({width: 414, height: 896}); await page.waitForTimeout(150);
    check('A girar libera las notas', (await frets()) === 0); await end();
    zones = await rects();
    check('A vertical: zonas dentro de la pantalla', zones.every((z) => z.x - z.w / 2 >= 0 && z.x + z.w / 2 <= 414 && z.y - z.h / 2 >= 0 && z.y + z.h / 2 <= 896));
    await send('touchStart', [fret(4)]); check('A vertical: traste correcto', (await frets()) === 16); await end();
    await page.setViewportSize({width: 896, height: 414}); await page.waitForTimeout(150); zones = await rects();
    check('A vuelta a horizontal: zonas sobre los aros', Math.abs(zones[2].x - (80 + 736 * .5)) < 1);
    // Márgenes seguros: con 21 px abajo (barra de inicio) la zona sube lo justo, conserva el tamaño y el aro queda adentro.
    const safe = await page.evaluate(() => { const box = {x: 80, y: 0, w: 736, h: 414}, s = {...gh3Touch.DEFAULTS}, view = {w: 896, h: 414};
      const plain = gh3Touch.computeZones(box, s, view), safe = gh3Touch.computeZones(box, s, view, {top: 0, right: 44, bottom: 21, left: 44});
      return {plainBottom: plain[0].y + plain[0].h, safeBottom: safe[0].y + safe[0].h, h: safe[0].h, plainH: plain[0].h, aro: safe[0].cy, top: safe[0].y}; });
    check('A márgenes seguros: la zona no pisa la barra de inicio, mismo tamaño, aro adentro', safe.plainBottom > 393 && safe.safeBottom <= 414 - 21 + .01 && safe.h === safe.plainH && safe.aro > safe.top && safe.aro < safe.safeBottom, safe);
    // Apagado: no escribe en el mando aunque cambien los ajustes.
    await page.evaluate(() => { gh3Touch.disable(); window.setTouchCalls = 0; gh3Touch.setSettings({height: 20}); dispatchEvent(new Event('blur')); });
    check('A apagado: no se escribe nada en el mando', (await page.evaluate(() => window.setTouchCalls)) === 0);
    await page.evaluate(() => { gh3Touch.enable(); gh3Touch.disable(); gh3Touch.enable(); });
    check('A reactivar sin duplicar', (await page.locator('#gh3Touch').count()) === 1);
    check('A gestos bloqueados (sin zoom ni desplazamiento)', await page.evaluate(() => { const z = document.querySelector('#gh3Touch .f0'), e = new Event('touchmove', {bubbles: true, cancelable: true}); z.dispatchEvent(e); return e.defaultPrevented && getComputedStyle(z).touchAction === 'none' && scrollY === 0; }));
    await ctx.close();
  }

  // ---------------- B) página real antes de Jugar ----------------
  {
    const ctx = await browser.newContext(IPHONE11_LANDSCAPE), page = await ctx.newPage(); page404(page);
    await page.goto(web.url + '/'); await page.waitForSelector('#gh3TouchIntro'); await page.waitForFunction(() => !document.getElementById('loaderPlay').disabled);
    const {send, end} = await touchTools(ctx, page);
    const intro = await page.locator('#gh3TouchIntro').innerText();
    check('B aviso «Controles táctiles activados» antes de Jugar', /Controles táctiles activados/.test(intro) && await page.locator('#gh3TouchIntro').isVisible());
    check('B explicación: aro, notas largas, acordes y rasgueo automático', /llega al aro/.test(intro) && /notas largas/.test(intro) && /acordes/.test(intro) && /Rasgueo automático/.test(intro));
    check('B «Jugar» sigue como botón directo y visible', await page.locator('#loaderPlay').isVisible());
    check('B táctiles del juego todavía apagados (no tapan el cargador)', await page.evaluate(() => !gh3Touch.enabled()));
    await page.screenshot({path: out + '/inicio-aviso.png'});
    await page.evaluate(() => { window.setTouchCalls = 0; const o = gh3Input.setTouch; gh3Input.setTouch = (...a) => { window.setTouchCalls++; return o(...a); }; });
    const before = web.requests.length;
    await page.locator('#gh3TouchIntro .try').tap();
    check('B «Probar controles» abre la prueba', await page.locator('#gh3TouchTest').isVisible());
    const tz = await page.evaluate(() => [...document.querySelectorAll('#gh3TouchTest [data-tf]')].map((z) => { const r = z.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height, c: getComputedStyle(z).getPropertyValue('--c').trim()}; }));
    check('B cinco colores en el orden original (verde, rojo, amarillo, azul, naranja)', JSON.stringify(tz.map((z) => z.c)) === JSON.stringify(['#2ecc40', '#ff3b30', '#ffd60a', '#0a84ff', '#ff9500']) && tz.every((z, i) => !i || z.x > tz[i - 1].x));
    check('B mismas zonas que en la canción (imagen 16:9 a pantalla completa)', tz.every((z, i) => Math.abs(z.x - (80 + 736 * (.34 + i * .08))) < 1));
    const ft = (i, id = i + 1) => ({x: tz[i].x, y: tz[i].y, id});
    await page.evaluate(() => { window.sameEventTest = null; addEventListener('pointerdown', (e) => { window.sameEventTest = e.target.closest('[data-tf]')?.classList.contains('on') ?? null; }, {once: true}); });
    await send('touchStart', [ft(0)]);
    check('B el color responde en el mismo evento de toque', await page.evaluate(() => window.sameEventTest === true));
    check('B mensaje con el color tocado', (await page.locator('#gh3TouchTest .msg').innerText()) === 'Verde'); await end();
    await send('touchStart', [ft(0), ft(2), ft(4)]);
    check('B varios dedos: acorde', (await page.locator('#gh3TouchTest .msg').innerText()) === 'Acorde: Verde + Amarillo + Naranja' && (await page.evaluate(() => gh3TouchTest.stats.mask)) === 21);
    await page.screenshot({path: out + '/prueba-acorde.png'});
    await page.evaluate(() => dispatchEvent(new Event('blur')));
    check('B perder foco libera en la prueba', (await page.evaluate(() => document.querySelectorAll('#gh3TouchTest .tz.on').length)) === 0); await end();
    await send('touchStart', [ft(1)], 500); check('B sostenida en la prueba', (await page.evaluate(() => gh3TouchTest.stats.mask)) === 2);
    await send('touchMove', [ft(3, 2)]); check('B deslizar en la prueba', (await page.evaluate(() => gh3TouchTest.stats.mask)) === 8);
    await send('touchCancel', []); check('B cancelar en la prueba', (await page.evaluate(() => gh3TouchTest.stats.mask)) === 0);
    // Ajustes dentro de la prueba: se guardan y valen para la canción; rasgueo manual muestra su zona y su explicación.
    await page.locator('#gh3TouchTest .adj').tap();
    await page.locator('#gh3TouchTest [name=height]').fill('26'); await page.locator('#gh3TouchTest [name=alpha]').fill('60');
    await page.locator('#gh3TouchTest [name=auto]').uncheck();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gh3TouchZones.v1')));
    check('B ajustes de la prueba guardados para la canción', saved.height === 26 && saved.alpha === 60 && saved.auto === 0, saved);
    check('B rasgueo manual: explicación y zona RASGUEO', /Rasgueo manual/.test(await page.locator('#gh3TouchTest .help').textContent()) && /Rasgueo manual/.test(await page.locator('#gh3TouchIntro').innerText()));
    await page.locator('#gh3TouchTest .done').tap();
    check('B zona RASGUEO visible en manual', await page.locator('#gh3TouchTest .tstrum').isVisible());
    const tz2 = await page.evaluate(() => [...document.querySelectorAll('#gh3TouchTest [data-tf]')].map((z) => z.getBoundingClientRect().height));
    check('B las zonas de la prueba toman el nuevo tamaño', Math.abs(tz2[0] - 414 * .26) < 1);
    await page.screenshot({path: out + '/prueba-manual.png'});
    await page.locator('#gh3TouchTest [name=auto]').evaluate(() => {}).catch(() => {});
    await page.evaluate(() => gh3Touch.setSettings({auto: 1}));
    check('B sin pedidos de red durante toda la prueba (ni wasm, ni chunks, ni lista)', web.requests.length === before, web.requests.slice(before).map((r) => r.path));
    check('B la prueba no escribió en el mando ni lo conectó', await page.evaluate(() => window.setTouchCalls === 0 && gh3Input.stats.writes === 0 && !gh3Input.attached && !window.g1worker));
    check('B el juego no arrancó', await page.evaluate(() => !document.body.classList.contains('loaderStarted')));
    // Volver y abrir de nuevo; luego «Jugar» desde la prueba = mismo botón Jugar del cargador (empieza la descarga).
    await page.locator('#gh3TouchTest .back').tap(); check('B «Volver» cierra la prueba', !(await page.locator('#gh3TouchTest').isVisible()));
    await page.locator('#gh3TouchIntro .ctl').tap();
    check('B «Controles» abre los ajustes', await page.locator('#gh3TouchTest .tpanel').isVisible());
    const beforePlay = web.requests.length;
    await page.locator('#gh3TouchTest .play').tap();
    await page.waitForTimeout(400);
    const after = web.requests.slice(beforePlay).map((r) => r.path);
    check('B «Jugar» desde la prueba cierra la prueba y arranca la carga', !(await page.locator('#gh3TouchTest').isVisible()) && after.some((p) => /local-chunk|chunks/.test(p)), after.slice(0, 4));
    await page.evaluate(() => document.body.classList.add('loaderStarted'));
    check('B el aviso desaparece con el juego en marcha', !(await page.locator('#gh3TouchIntro').isVisible()));
    await ctx.close();
  }

  // ---------------- C) PC y forzados ----------------
  {
    const ctx = await browser.newContext({viewport: {width: 1280, height: 800}}), page = await ctx.newPage(); page404(page);
    await page.goto(web.url + '/'); await page.waitForSelector('#loaderPanel'); await page.waitForTimeout(400);
    check('C PC: sin aviso ni prueba táctil', (await page.locator('#gh3TouchIntro').count()) === 0 && await page.evaluate(() => window.gh3IsMobile === false && !window.gh3TouchTest));
    check('C PC: controles táctiles apagados', await page.evaluate(() => !gh3Touch.enabled() && !document.getElementById('gh3Touch')));
    await page.goto(web.url + '/?touch=1'); await page.waitForSelector('#gh3TouchIntro');
    check('C PC con ?touch=1: aviso disponible', await page.locator('#gh3TouchIntro').isVisible());
    await ctx.close();
    const m = await browser.newContext(IPHONE11_LANDSCAPE), mp = await m.newPage(); page404(mp);
    await mp.goto(web.url + '/?touch=0'); await mp.waitForSelector('#loaderPanel'); await mp.waitForTimeout(400);
    check('C celular con ?touch=0: sin aviso', (await mp.locator('#gh3TouchIntro').count()) === 0);
    await m.close();
  }
  // Errores de página esperables sin el juego: ninguno de los módulos táctiles debe fallar.
  const ours = report.errors.filter((e) => !/WebGPU|navigator\.gpu/.test(e));
  check('sin errores de página', ours.length === 0, ours);
} catch (e) {
  report.failed = (report.failed || 0) + 1; report.crash = e.stack; console.error(e);
} finally {
  await browser.close(); await web.close();
  report.ok = !report.failed;
  fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
  console.log(report.ok ? `MOVIL_TACTIL_OK (${report.checks.length} comprobaciones)` : `MOVIL_TACTIL_FALLA (${report.failed})`);
  process.exitCode = report.ok ? 0 : 1;
}
