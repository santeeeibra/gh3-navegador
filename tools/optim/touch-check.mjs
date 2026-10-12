// Chequeo sin juego: detección celular/PC y botones Volver/Start de gh3-touch.js.
// Uso: node tools/optim/touch-check.mjs <demo_dir>
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path'; import assert from 'node:assert';
const dir = path.resolve(process.argv[2]);
const html = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><body><canvas id=r5Canvas width=1280 height=720 style="width:100vw"></canvas>
<script>window.taps=[];window.gh3Input={tap:n=>taps.push(n),setTouch:()=>{},songMode:()=>false};</script><script src="gh3-touch.js"></script>`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const out = {};
const cases = {
  iphone: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  pcTactil: { viewport: { width: 1280, height: 800 }, touchPoints: 10 },
  pc: { viewport: { width: 1280, height: 800 } },
};
for (const [name, opt] of Object.entries(cases)) {
  const { touchPoints, ...o } = opt, ctx = await browser.newContext(o), page = await ctx.newPage();
  if (touchPoints) await page.addInitScript(n => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => n }), touchPoints);
  await page.route('http://t.test/**', r => { const u = new URL(r.request().url()).pathname; r.fulfill(u === '/' ? { body: html, contentType: 'text/html' } : { body: fs.readFileSync(dir + u), contentType: 'text/javascript' }); });
  await page.goto('http://t.test/');
  const info = await page.evaluate(() => {
    const r = document.getElementById('gh3Touch'), z = r?.querySelector('.frets .z');
    return { mobile: window.gh3IsMobile, cls: document.documentElement.className, overlay: !!r && !r.hidden,
      fretBg: z && getComputedStyle(z).backgroundColor, fretBorder: z && getComputedStyle(z).borderTopWidth,
      nav: r ? [...r.querySelectorAll('.nav')].map(b => b.textContent) : [] };
  });
  if (info.overlay) { await page.locator('.nav.back').tap(); await page.locator('.nav.start').tap(); info.taps = await page.evaluate(() => taps); }
  out[name] = info; await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out));
assert.equal(out.iphone.overlay, true); assert.deepEqual(out.iphone.taps, ['b', 'start']);
assert.equal(out.iphone.fretBg, 'rgba(0, 0, 0, 0)'); assert.equal(out.pc.overlay, false); assert.equal(out.pcTactil.overlay, false);
console.log('TOUCH_CHECK_OK');
