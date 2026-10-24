// Claude 2026-10-16: dibuja los controles táctiles (clásica / joystick) + botón Compartir sobre una captura del juego,
// en WebKit iPhone horizontal, con sólo los scripts de controles (WebKit en Windows no corre el motor).
// Uso: node tools/accesos/captura-controles.mjs [carpeta-demo] [salida] [fondo.png]
import {webkit, devices} from 'playwright';
import fs from 'node:fs';
const demo = process.argv[2] || 'artifacts/d1-wasm/recorte2/demo', out = process.argv[3] || 'artifacts/ui-movil-claude';
const fondo = 'data:image/png;base64,' + fs.readFileSync(process.argv[4] || 'artifacts/ui-movil-claude/fondo-santi.png').toString('base64');
const js = n => fs.readFileSync(`${demo}/${n}`, 'utf8');
const b = await webkit.launch(), errs = [];
for (const modo of ['clasica', 'joystick']) {
  const ctx = await b.newContext({...devices['iPhone 13 landscape'], locale: 'es-AR'});
  await ctx.addInitScript(m => { try { localStorage.setItem('gh3pad', m); } catch {} }, modo);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(modo + ': ' + e.message));
  await p.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head>
  <body class="loaderStarted" style="margin:0;background:#000"><div id="r5Box" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center">
  <canvas id="r5Canvas" width="1280" height="720" style="width:100%;height:100%;object-fit:contain;background:url(${fondo}) center/contain no-repeat"></canvas></div></body></html>`);
  await p.evaluate(() => { window.gh3Input = {setTouch() {}}; });
  for (const n of ['gh3-touch.js', 'gh3-joypad.js', 'gh3-share.js', 'gh3-movil-ctl.js'].filter(n => fs.existsSync(`${demo}/${n}`))) await p.addScriptTag({content: js(n)}).catch(e => errs.push(n + ': ' + e.message));
  await p.evaluate(() => { window.gh3Touch?.enable?.(); window.gh3Joypad?.setMode?.(localStorage.getItem('gh3pad')); document.body.classList.add('gh3ShareOn'); dispatchEvent(new CustomEvent('gh3stage', {detail: {stage: 'songPlaying'}})); });
  await p.waitForTimeout(800); await p.evaluate(m => window.gh3Joypad?.setMode?.(m), modo); await p.waitForTimeout(800); errs.push(modo + ' body=' + await p.evaluate(() => document.body.className + ' joy=' + getComputedStyle(document.getElementById('gh3Joy') || document.body).display));
  await p.screenshot({path: `${out}/controles-${modo}${process.env.SUF || ''}.png`});
  if (modo === 'joystick') { await p.evaluate(() => window.gh3Touch.setSettings({auto: 0})); await p.waitForTimeout(500); await p.screenshot({path: `${out}/controles-joystick-manual${process.env.SUF || ''}.png`}); }
  await ctx.close();
}
await b.close();
console.log(JSON.stringify({errs}));
