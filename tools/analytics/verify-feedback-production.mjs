import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const base = 'https://lasvegasherogame.com';
const prepared = JSON.parse(await fs.readFile('artifacts/feedback/deploy-prepared.json'));
const staging = path.join(prepared.output, 'static');
const report = { passed: false, request_ids: [], checks: {}, browser: {}, generated_at: new Date().toISOString() };
const evidence = 'artifacts/feedback/production-verification.json';
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const request = url => fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(60000) });
for (const file of ['gh3/index.html', 'gh3/gh3-feedback.js', 'gh3/gh3-web.js', 'gh3/manifest.json', 'estadisticas/index.html', 'estadisticas/dashboard.js', 'estadisticas/dashboard.css']) {
  const url = file.endsWith('/index.html') ? base + '/' + file.replace('index.html', '') : base + '/' + file;
  const response = await request(url);assert.equal(response.status, 200, file);
  assert.equal(sha(Buffer.from(await response.arrayBuffer())), sha(await fs.readFile(path.join(staging, file))), file);
  if (file === 'gh3/index.html') { assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin'); assert.equal(response.headers.get('cross-origin-embedder-policy'), 'require-corp'); }
  if (file === 'estadisticas/index.html') { assert.match(response.headers.get('cache-control'), /no-store/); assert.match(response.headers.get('x-robots-tag'), /noindex/); }
  report.checks[file] = '200/hash exact';
}
const wasm = await request(base + '/gh3/gh3-web.wasm');assert.equal(wasm.status, 200);const wasmHash = crypto.createHash('sha256');for await (const chunk of wasm.body) wasmHash.update(chunk);assert.equal(wasmHash.digest('hex'), prepared.wasm_sha256);report.checks.wasm = '200/full SHA256 exact';
const manifest = JSON.parse(await fs.readFile(path.join(staging, 'gh3/manifest.json')));
const hash = manifest.files.flatMap(file => file.chunks)[0].hash;
const chunk = await request(base + '/gh3/chunks/' + hash);assert.equal(chunk.status, 200);assert.equal(sha(Buffer.from(await chunk.arrayBuffer())), hash);report.checks.chunk = '200/hash exact';
await fs.writeFile(evidence, JSON.stringify(report, null, 2));

const access = await fs.readFile('artifacts/analytics/PANEL-ACCESS-LOCAL.md', 'utf8');
const admin = access.match(/Contraseña: `([^`]+)`/)?.[1];assert.ok(admin?.length >= 32);
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/gh3/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.locator('#loaderPanel .gh3FeedbackOpen').click();
  await page.locator('#gh3FeedbackRating').selectOption('5'); await page.locator('#gh3FeedbackCategory').selectOption('general');
  const message = 'Prueba técnica de formulario en producción Codex — borrar esta respuesta al terminar.';
  await page.locator('#gh3FeedbackMessage').fill(message); await page.locator('#gh3FeedbackNickname').fill('Codex e2e');
  const posted = page.waitForRequest(req => req.url().includes('/functions/v1/gh3-feedback') && req.method() === 'POST');
  await page.locator('#gh3FeedbackForm [type=submit]').click();
  report.request_ids.push(JSON.parse((await posted).postData()).request_id);await fs.writeFile(evidence, JSON.stringify(report, null, 2));
  await page.waitForFunction(() => document.querySelector('#gh3FeedbackStatus').textContent.includes('recibió'), null, { timeout: 30000 });
  report.browser.submit = 'success';await page.screenshot({ path: 'artifacts/feedback/production-form-mobile.png' });
  const panel = await context.newPage();panel.on('pageerror', error => errors.push(error.message));
  await panel.goto(base + '/estadisticas/', { waitUntil: 'networkidle', timeout: 60000 });
  await panel.locator('#password').fill('incorrect-password-long-enough-123456'); await panel.locator('#loginForm button').click();
  await panel.waitForFunction(() => document.querySelector('#loginError').textContent.includes('no es válida'));
  await panel.locator('#password').fill(admin);await panel.locator('#loginForm button').click();await panel.locator('#dashboard').waitFor({ state: 'visible', timeout: 30000 });
  assert.ok((await panel.locator('#feedbackList').textContent()).includes(message));
  await panel.locator('#feedbackRating').selectOption('5');assert.ok((await panel.locator('#feedbackList').textContent()).includes(message));
  await panel.locator('.feedback-shell').screenshot({ path: 'artifacts/feedback/production-monitor-mobile.png' });
  assert.deepEqual(errors, []);report.browser.privateRead = 'wrong password rejected / correct password shows submitted opinion';report.browser.errors = errors;
  report.passed = true;console.log(JSON.stringify(report, null, 2));
} finally { await browser.close();await fs.writeFile(evidence, JSON.stringify(report, null, 2)); }
