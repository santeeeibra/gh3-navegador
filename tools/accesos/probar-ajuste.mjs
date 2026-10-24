// Claude 2026-10-15: prueba el ajuste «Notas y sonido» del panel ☰ en modo celular (sin canción). Uso: node tools/accesos/probar-ajuste.mjs
import {startGame} from '../d1-wasm/fast-start.mjs';
const g = await startGame({nombre: 'medir', root: 'artifacts/d1-wasm/recorte-pub/demo', query: 'manual=1', owner: 'Claude (ajuste notas)', deadline: Date.now() + 85000, esperarTurno: false,
  viewport: {width: 844, height: 390}, ctx: {isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'}});
const r = {};
try {
  const p = g.page; r.antes = await p.evaluate(() => [window.hw60?.offsetMs, !!document.getElementById('a60Sync')]);
  await p.click('#gh3MenuBtn'); await new Promise(z => setTimeout(z, 800));
  await p.locator('#a60Sync button[data-d="10"]').click(); await p.locator('#a60Sync button[data-d="10"]').click();
  r.tras2mas = await p.evaluate(() => [hw60.offsetMs, document.getElementById('a60SyncVal').textContent, localStorage.getItem('gh3-a60-offset')]);
  await p.locator('#a60Sync').scrollIntoViewIfNeeded(); await p.screenshot({path: 'artifacts/gh3-liviano/ajuste-notas-celular.png'});
  await p.locator('#a60Sync button[data-d="0"]').click(); r.normal = await p.evaluate(() => hw60.offsetMs); r.errores = g.errors;
} catch (e) { r.error = e.message; } finally { await g.close(); console.log(JSON.stringify(r)); }
