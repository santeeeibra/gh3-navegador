// Captura de la prueba sin juego (Edge oculto): con y sin la capa hw60, y la diferencia.
import { createServer } from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { chromium } from 'playwright';
const root = 'artifacts/hw60/offline', out = process.argv[2] || root;
const srv = createServer((req, res) => { const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/$/, '/index.html')); if (!fs.existsSync(f)) { res.writeHead(404).end(); return; } res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.png') ? 'image/png' : 'application/json'); fs.createReadStream(f).pipe(res); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=d3d11', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } }); const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
for (const adv of (process.argv[3] || '0').split(',')) {
  await page.goto(`http://127.0.0.1:${srv.address().port}/?advance=${adv}`); await page.waitForFunction(() => window.hw60ready, null, { timeout: 30000 }); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/shot-${adv}.png`, clip: { x: 0, y: 0, width: 1280, height: 720 } });
  console.log(adv, JSON.stringify(await page.evaluate(() => window.hw60)));
}
await page.evaluate(() => window.hw60.setEnabled(false)); await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/shot-off.png`, clip: { x: 0, y: 0, width: 1280, height: 720 } });
console.log('errores', errs); await browser.close(); srv.close();
