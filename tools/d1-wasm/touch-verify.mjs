// Prueba de los controles táctiles SIN juego (Claude): Edge emulando un iPhone 11 horizontal (896x414, táctil) sobre
// artifacts/d1-wasm/touch/touch-test.html, con toques multi-dedo reales por CDP (Input.dispatchTouchEvent). La
// página simula la memoria compartida del mando y la consulta como el GH3 (g1e_input.cpp).
// Uso: node tools/d1-wasm/touch-verify.mjs [etiqueta=touch-1] [puerto=5450]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { chromium } from 'playwright';
const [label = 'touch-1', port = 5450] = process.argv.slice(2);
const out = path.resolve('artifacts/d1-wasm/touch/runs', label); fs.mkdirSync(out, { recursive: true });
// Servidor local propio (127.0.0.1, COOP/COEP para SharedArrayBuffer) que sirve solo los 3 archivos de la prueba.
const ROOT = path.resolve('artifacts/d1-wasm/touch'), FILES = ['touch-test.html', 'gh3-input.js', 'gh3-touch.js'];
const server = http.createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname.slice(1);
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  if (!FILES.includes(name)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': name.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' }); res.end(fs.readFileSync(path.join(ROOT, name)));
}).listen(+port, '127.0.0.1');
const report = { label, checks: [], pageErrors: [] };
const check = (name, ok, got) => { report.checks.push({ name, ok: !!ok, got }); console.log((ok ? 'OK   ' : 'FALLA') + ' ' + name + (ok ? '' : ' ' + JSON.stringify(got))); };
let browser;
try {
  for (let t = Date.now(); ;) { try { if ((await fetch(`http://127.0.0.1:${port}/touch-test.html`)).ok) break; } catch {} if (Date.now() - t > 10000) throw Error('server'); await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 896, height: 414 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.on('pageerror', (e) => report.pageErrors.push(e.message));
  await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
  await page.goto(`http://127.0.0.1:${port}/touch-test.html`);
  await page.waitForFunction(() => window.gh3Touch?.enabled() && window.fakeGame?.polls > 5);
  const cdp = await ctx.newCDPSession(page);
  const Z = await page.evaluate(() => { const c = (s) => { const r = document.querySelector('#gh3Touch ' + s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; };
    return { f: [0, 1, 2, 3, 4].map((i) => c('.f' + i)), strum: c('.strum'), star: c('.star'), pause: c('.pause') }; });
  report.zones = Z;
  let active = new Map();  // id -> {x,y}
  const send = async (pts) => {
    const ids = new Set(pts.map((p) => p.id)), adds = pts.some((p) => !active.has(p.id)), removes = [...active.keys()].some((id) => !ids.has(id));
    if (adds && removes) throw Error('add+remove in one step');
    if (!pts.length && !active.size) return;
    const type = !pts.length ? 'touchEnd' : adds ? 'touchStart' : 'touchMove';
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 8, radiusY: 8, force: 1 })) });
    active = new Map(pts.map((p) => [p.id, p]));
  };
  const state = () => page.evaluate(() => JSON.parse(JSON.stringify({ now: fakeGame.now, taps: fakeGame.taps, strums: fakeGame.strumTaps, maxGap: fakeGame.maxGap, touch: gh3Touch.stats })));
  const wait = (ms) => page.waitForTimeout(ms);
  const reset = async () => { await send([]); await wait(30); await page.evaluate(() => { fakeGame.taps = {}; fakeGame.strumTaps = 0; fakeGame.maxGap = 0; }); };
  const F = (i, id = 10 + i, dx = 0) => ({ id, x: Z.f[i].x + dx, y: Z.f[i].y });
  let s;

  // 1. Cada traste en modo canción = esquema GH3 con mando común (LT, LB, RB, RT, A).
  const want = [[0, 255, 0], [0x100, 0, 0], [0x200, 0, 0], [0, 0, 255], [0x1000, 0, 0]];
  for (let i = 0; i < 5; i++) { await send([F(i)]); await wait(30); s = await state();
    check(`traste ${i + 1} canción`, s.now.buttons === want[i][0] && s.now.lt === want[i][1] && s.now.rt === want[i][2] && s.now.source === 4, s.now); await send([]); await wait(20); }
  s = await state(); check('soltar = nada apretado', s.now.buttons === 0 && s.now.lt === 0 && s.now.rt === 0, s.now);

  // 2. Acorde de tres dedos apoyados a la vez y acorde de cinco + rasgueo (6 dedos).
  await reset(); await send([F(0), F(1), F(2)]); await wait(30); s = await state();
  check('acorde verde+rojo+amarillo', s.now.lt === 255 && s.now.buttons === 0x300, s.now);
  await send([F(0), F(1), F(2), F(3), F(4)]); await wait(20);
  await send([F(0), F(1), F(2), F(3), F(4), { id: 30, x: Z.strum.x, y: Z.strum.y }]); await wait(20); s = await state();
  check('5 trastes + rasgueo (6 dedos)', s.now.lt === 255 && s.now.rt === 255 && (s.now.buttons & 0x1300) === 0x1300 && s.strums === 1 && s.touch.maxPointers >= 6, { now: s.now, strums: s.strums, max: s.touch.maxPointers });

  // 3. Nota sostenida: traste apoyado 1,5 s mientras se rasguea 3 veces con otro dedo; el traste no se suelta.
  await reset(); await send([F(1)]); let held = true;
  for (let k = 0; k < 3; k++) { await wait(400); await send([F(1), { id: 31 + k, x: Z.strum.x, y: Z.strum.y }]); await wait(60); await send([F(1)]); s = await state(); held &&= (s.now.buttons & 0x100) !== 0; }
  await wait(300); s = await state();
  check('sostenida 1,5 s con 3 rasgueos', held && (s.now.buttons & 0x100) && s.strums === 3, { now: s.now, strums: s.strums });

  // 4. Deslizar el dedo de verde a rojo sin levantarlo; correrse un poco dentro del traste no suelta.
  await reset(); await send([F(0, 40)]); await wait(20); await send([F(0, 40, Z.f[0].w * 0.3)]); await wait(20); s = await state(); const keep = s.now.lt === 255;
  await send([F(1, 40)]); await wait(30); s = await state();
  check('deslizar verde→rojo', keep && s.now.lt === 0 && s.now.buttons === 0x100, s.now);

  // 5. Rasgueos rápidos: 10 toques separados 40 ms + deslizar arriba/abajo (4 cambios de dirección).
  await reset();
  for (let k = 0; k < 10; k++) { await send([{ id: 50 + k, x: Z.strum.x, y: Z.strum.y }]); await wait(15); await send([]); await wait(25); }
  await wait(80); s = await state(); check('10 rasgueos rápidos = 10 toques', s.strums === 10, s.strums);
  await reset(); const y0 = Z.strum.y; await send([{ id: 60, x: Z.strum.x, y: y0 }]);
  for (const y of [y0 - 40, y0 + 10, y0 - 40, y0 + 10]) { await wait(60); await send([{ id: 60, x: Z.strum.x, y }]); }
  await wait(80); s = await state(); check('rasgueo por deslizamiento (1 + 4)', s.strums === 5 && s.taps.up >= 2, { strums: s.strums, taps: s.taps });

  // 6. Poder estelar (BACK) y pausa (START), también junto a un acorde.
  await reset(); await send([F(0), F(2), { id: 70, x: Z.star.x, y: Z.star.y }]); await wait(30); s = await state();
  check('estrella + acorde', (s.now.buttons & 0x20) && (s.now.buttons & 0x200) && s.now.lt === 255, s.now);
  await reset(); await send([{ id: 71, x: Z.pause.x, y: Z.pause.y }]); await wait(30); s = await state(); check('pausa = START', s.now.buttons === 0x10, s.now);

  // 7. Soltar todo: toque cancelado por el sistema, perder foco, app en segundo plano, girar a vertical.
  const heldAll = async () => { await reset(); await send([F(0), F(1), F(4), { id: 80, x: Z.star.x, y: Z.star.y }]); await wait(30); return (await state()).now; };
  let before = await heldAll();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); active = new Map(); await wait(30); s = await state();
  check('touchcancel suelta todo', before.lt === 255 && s.now.buttons === 0 && s.now.lt === 0, { before, after: s.now, cancels: s.touch.cancels });
  before = await heldAll(); await page.evaluate(() => dispatchEvent(new Event('blur'))); await wait(30); s = await state();
  check('perder foco suelta todo', before.buttons && s.now.buttons === 0 && s.now.lt === 0, s.now);
  before = await heldAll();
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); dispatchEvent(new Event('pagehide')); });
  await wait(30); s = await state(); check('cambiar de app (hidden/pagehide) suelta todo', before.buttons && s.now.buttons === 0 && s.now.lt === 0, s.now);
  await page.evaluate(() => { delete document.visibilityState; });
  await send([]);  // el sistema ya no tiene esos dedos
  before = await heldAll(); await page.setViewportSize({ width: 414, height: 896 }); await wait(80); s = await state();
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('#gh3Touch .strum')).display === 'none' && getComputedStyle(document.querySelector('#gh3Touch .rot')).display !== 'none');
  check('vertical: suelta todo y pide girar', before.buttons && s.now.buttons === 0 && s.now.lt === 0 && hidden, { now: s.now, hidden });
  await page.screenshot({ path: out + '/vertical.png' });
  await send([]); await page.setViewportSize({ width: 896, height: 414 }); await wait(80);

  // 8. Menús: trastes = A/B/Y/X/LB (como el teclado); rasgueo respeta la dirección.
  await page.evaluate(() => { document.getElementById('song').checked = false; });
  await reset(); await send([F(0)]); await wait(30); const g = (await state()).now.buttons; await send([]); await wait(20);
  await send([F(1)]); await wait(30); const r = (await state()).now.buttons; await send([]); await wait(20);
  check('menú: verde=A, rojo=B', g === 0x1000 && r === 0x2000, { g, r });
  await reset(); await send([{ id: 90, x: Z.strum.x, y: Z.strum.y }]); await wait(10); await send([]); await wait(10); await send([{ id: 91, x: Z.strum.x, y: Z.strum.y }]); await wait(10); await send([]); await wait(250);
  s = await state(); check('menú: dos rasgueos seguidos = abajo, abajo', s.taps.down === 2 && !s.taps.up, { taps: s.taps, strums: s.touch.strums, maxGap: s.maxGap, rel: s.touch.releases, downs: s.touch.downs });

  // 9. La página no hace zoom ni se desplaza con los toques.
  await send([F(2)]); await send([F(2), F(3)]); await send([]);
  const vv = await page.evaluate(() => ({ scale: visualViewport.scale, scrollY, scrollX }));
  check('sin zoom ni desplazamiento', vv.scale === 1 && vv.scrollX === 0 && vv.scrollY === 0, vv);
  await send([F(0), F(2), { id: 99, x: Z.strum.x, y: Z.strum.y }]); await wait(20);
  await page.screenshot({ path: out + '/horizontal.png' }); await send([]);
  report.final = await state();
} catch (e) { report.error = e.stack; console.log(e.stack); }
finally { await browser?.close(); server.close(); }
report.ok = !report.error && !report.pageErrors.length && report.checks.every((c) => c.ok);
fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ label, ok: report.ok, checks: report.checks.length, failed: report.checks.filter((c) => !c.ok).map((c) => c.name), pageErrors: report.pageErrors }));
if (!report.ok) process.exitCode = 1;
