// Visor iPhone (Claude 2026-10-15, pedido de Santi): abre la página en WebKit (motor de Safari) con pantalla, toque y
// navegador de iPhone, y deja capturas + errores de UI para revisar. NO es el Safari real: no imita el límite de memoria
// ni la velocidad del iPhone, y la versión de Windows no trae WebGPU ni AudioContext (el iPhone sí); sirve para ver cómo se ve y qué se rompe en la interfaz.
//
// Uso:  node tools/visor-ios/visor.mjs [url] [opciones]
//   url por defecto: https://lasvegasherogame.com/gh3/
//   --equipo "iPhone 11"   (cualquiera de la lista de Playwright: "iPhone 15 Pro", "iPhone SE", "iPad Mini"...)
//   --vertical             (por defecto horizontal, como se juega)
//   --tocar "#play,#menu"  (toca esos elementos en orden, con captura después de cada uno)
//   --segundos 15          (espera total antes de la captura final)
//   --ver                  (ventana visible: Santi puede mirar y tocar con el mouse)
// Resultado: artifacts/visor-ios/<hora>/informe.json + capturas .png (resumen corto por consola).
import fs from 'node:fs';
import path from 'node:path';
import {webkit, devices} from 'playwright';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const url = args[0] && !args[0].startsWith('--') ? args[0] : 'https://lasvegasherogame.com/gh3/';
const equipo = String(opt('equipo', 'iPhone 11')), horizontal = opt('vertical', false) !== true;
const nombreEquipo = horizontal && devices[equipo + ' landscape'] ? equipo + ' landscape' : equipo;
if (!devices[nombreEquipo]) { console.log('Equipo desconocido. Ejemplos: ' + Object.keys(devices).filter(k => /iPhone|iPad/.test(k) && !/landscape/.test(k)).join(', ')); process.exit(1); }
const out = path.resolve('artifacts/visor-ios', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19));
fs.mkdirSync(out, {recursive: true});
const inf = {url, equipo: nombreEquipo, inicio: new Date().toISOString(), consola: [], erroresPagina: [], pedidosFallidos: [], capturas: [], revisiones: []};
const write = () => fs.writeFileSync(path.join(out, 'informe.json'), JSON.stringify(inf, null, 1));
const nap = ms => new Promise(r => setTimeout(r, ms));

// Revisión de UI en la página: cosas fuera de pantalla, botones chicos para el dedo, botones tapados, texto cortado, scroll de costado.
const revisar = () => {
  const vw = innerWidth, vh = innerHeight, res = {pantalla: [vw, vh], scrollDeCostado: document.documentElement.scrollWidth > vw + 1, fueraDePantalla: [], chicosParaDedo: [], tapados: [], textoCortado: []};
  const nombre = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/)[0] : '') + (e.textContent?.trim() ? ' «' + e.textContent.trim().slice(0, 30) + '»' : '');
  const visible = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
  for (const e of document.querySelectorAll('button, a, input, select, [role=button], [onclick]')) {
    if (!visible(e)) continue; const r = e.getBoundingClientRect();
    if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) res.fueraDePantalla.push(nombre(e) + ' ' + [r.left, r.top, r.width, r.height].map(Math.round).join(','));
    if (r.width < 40 || r.height < 40) res.chicosParaDedo.push(nombre(e) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < 0 || cy < 0 || cx >= vw || cy >= vh) continue;  // abajo de la pantalla: se ve al bajar, no está tapado
    const arriba = document.elementFromPoint(cx, cy);
    if (arriba && arriba !== e && !e.contains(arriba) && !arriba.contains(e)) res.tapados.push(nombre(e) + ' tapado por ' + nombre(arriba));
  }
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || e.children.length) continue; const s = getComputedStyle(e);
    if ((s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 2 || e.scrollHeight > e.clientHeight + 2) && e.textContent.trim()) res.textoCortado.push(nombre(e));
  }
  for (const k of ['fueraDePantalla', 'chicosParaDedo', 'tapados', 'textoCortado']) res[k] = res[k].slice(0, 25);
  return res;
};

const browser = await webkit.launch({headless: opt('ver', false) !== true});
try {
  // El descriptor de Playwright trae un iOS viejo (12.2): se presenta como iOS 18 para que la página tome el camino actual.
  const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
  const ctx = await browser.newContext({...devices[nombreEquipo], userAgent: ua, locale: 'es-AR'});
  // Marca de prueba para el monitor: estas visitas son de Claude.
  await ctx.addInitScript(() => { try { localStorage.setItem('gh3-test-profile', 'claude'); } catch {} });
  const page = await ctx.newPage();
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) inf.consola.push(m.type() + ': ' + m.text().slice(0, 300)); });
  page.on('pageerror', e => inf.erroresPagina.push(String(e.message).slice(0, 300)));
  page.on('requestfailed', r => inf.pedidosFallidos.push(r.url().slice(0, 150) + ' → ' + (r.failure()?.errorText || '?')));
  page.on('response', r => { if (r.status() >= 400) inf.pedidosFallidos.push(r.url().slice(0, 150) + ' → ' + r.status()); });
  const captura = async n => { const f = String(inf.capturas.length + 1).padStart(2, '0') + '-' + n.replace(/[^\w-]+/g, '_').slice(0, 40) + '.png'; await page.screenshot({path: path.join(out, f)}).catch(() => {}); inf.capturas.push(f); inf.revisiones.push({en: n, ...await page.evaluate(revisar).catch(e => ({error: e.message}))}); write(); };
  await page.goto(url, {waitUntil: 'load', timeout: 60000});
  inf.soporte = await page.evaluate(() => ({webgpu: !!navigator.gpu, webgl2: !!document.createElement('canvas').getContext('webgl2'), sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined', aisladoCOOP: self.crossOriginIsolated, audioWorklet: typeof AudioWorkletNode !== 'undefined', navegador: navigator.userAgent}));
  await nap(3000);
  // WebKit de Windows no tiene WebGPU (el Safari de iOS 26 sí): el aviso de la página es del visor, se anota y se cierra.
  if (await page.locator('#gh3GpuCard').isVisible().catch(() => false)) { inf.avisoGpuCerrado = true; await page.locator('#gh3GpuCard button').first().tap({timeout: 3000}).catch(() => {}); await nap(500); }
  await captura('inicio');
  for (const sel of String(opt('tocar', '')).split(',').filter(Boolean)) {
    try { await page.locator(sel).first().tap({timeout: 5000}); } catch (e) { inf.erroresPagina.push('no pude tocar ' + sel + ': ' + e.message.split('\n')[0]); }
    await nap(2500); await captura('tras-' + sel);
  }
  const resto = Number(opt('segundos', 15)) * 1000 - 3000; if (resto > 0) await nap(resto);
  await captura('final');
  if (opt('ver', false) === true) { console.log('Ventana abierta: cerrala para terminar.'); await new Promise(r => page.on('close', r)); }
} catch (e) { inf.error = e.message; write(); }
finally { await browser.close().catch(() => {}); write();
  const r = inf.revisiones.at(-1) || {};
  console.log(JSON.stringify({out, soporte: inf.soporte, errores: inf.erroresPagina.length + inf.consola.filter(x => x.startsWith('error')).length, pedidosFallidos: inf.pedidosFallidos.length,
    final: {scrollDeCostado: r.scrollDeCostado, fueraDePantalla: r.fueraDePantalla?.length, chicosParaDedo: r.chicosParaDedo?.length, tapados: r.tapados?.length, textoCortado: r.textoCortado?.length}, error: inf.error})); }
