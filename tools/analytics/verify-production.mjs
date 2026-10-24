import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chromium } from 'playwright';

const base = 'https://lasvegasherogame.com';
const access = fs.readFileSync('artifacts/analytics/PANEL-ACCESS-LOCAL.md', 'utf8');
const token = access.match(/Contraseña: `([^`]+)`/)?.[1] || '';
assert.ok(token.length >= 32, 'Falta la contraseña local');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

const expected = {
  '/gh3/': 'fa2b087dd7b24d7ff8b51bc450d1fbe53662290d22549d7e9a170b821576c386',
  '/gh3/gh3-web.js': 'fc127215701d90fd40d44706c62ff8bf9126e2f81a39feca5082b28c9f2878fc',
  '/gh3/manifest.json': 'a3a170755352a332ae28a83843927e7c8e1503e2183b36eac9f624027a02fd17',
};
for (const [pathname, hash] of Object.entries(expected)) {
  const response = await fetch(base + pathname, {cache:'no-store'});
  assert.equal(response.status, 200, pathname);
  assert.equal(sha256(Buffer.from(await response.arrayBuffer())), hash, `${pathname} cambió`);
}
const wasm = await fetch(base + '/gh3/gh3-web.wasm', {method:'HEAD',cache:'no-store'});
assert.equal(wasm.status, 200);
assert.equal(wasm.headers.get('etag'), 'W/"736585b2c75e47307aa854594192cd55"');

const panel = await fetch(base + '/estadisticas/', {cache:'no-store'});
assert.equal(panel.status, 200);
assert.match(panel.headers.get('cache-control') || '', /no-store/);
assert.match(panel.headers.get('x-robots-tag') || '', /noindex/);
assert.match(panel.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);

const browser = await chromium.launch({channel:'msedge',headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const pageErrors = [], apiStatuses = [];
page.on('pageerror', error => pageErrors.push(error.message));
page.on('response', response => {
  if (response.url().includes('/functions/v1/gh3-analytics-dashboard')) apiStatuses.push(response.status());
});
try {
  await page.goto(base + '/estadisticas/', {waitUntil:'networkidle',timeout:60_000});
  assert.equal(await page.locator('#login').isVisible(), true);
  await page.locator('#password').fill('incorrect-password-that-is-long-enough');
  await page.locator('#loginForm button').click();
  await page.waitForFunction(() => document.querySelector('#loginError')?.textContent.includes('no es válida'));
  await page.locator('#password').fill(token);
  await page.locator('#loginForm button').click();
  await page.locator('#dashboard').waitFor({state:'visible',timeout:30_000});
  const visits = await page.locator('#kpis .kpi').first().locator('strong').textContent();
  const active = await page.locator('#activeNow').textContent();
  assert.match(visits || '', /^\d+$/);
  assert.match(active || '', /^\d+$/);
  assert.deepEqual(apiStatuses.slice(-2), [401, 200]);
  assert.deepEqual(pageErrors, []);
  assert.equal((await page.content()).includes(token), false);
  await page.screenshot({path:'artifacts/analytics/panel-production-mobile.png',fullPage:true});
  console.log(JSON.stringify({url:base+'/estadisticas/',visits:Number(visits),active5m:Number(active),apiStatuses,pageErrors,gh3Unchanged:true,wasmBytes:71_712_764},null,2));
} finally {
  await browser.close();
}
