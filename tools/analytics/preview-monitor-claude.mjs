// Claude 2026-10-16: vista previa del monitor con DATOS DE EJEMPLO (no reales).
// Sirve tools/analytics/dashboard en 127.0.0.1:5460, intercepta la API y saca capturas PC/celular.
// Uso: node tools/analytics/preview-monitor-claude.mjs [carpeta-salida] [--ver]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {buildDashboard} from './supabase/gh3-analytics-dashboard/aggregate.js';
import {buildActivity, localDay} from './supabase/gh3-analytics-dashboard/activity.js';

const out = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'artifacts/monitor-claude';
const ver = process.argv.includes('--ver');
fs.mkdirSync(out, {recursive: true});
const dir = 'tools/analytics/dashboard';
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'};
const server = http.createServer((req, res) => {
  const f = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html');
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': types[path.extname(f)] || 'application/octet-stream'}); fs.createReadStream(f).pipe(res);
}).listen(5460, '127.0.0.1');

// Visitas de ejemplo de hoy: [autor, minutos atrás, dispositivo, navegador, ciudad, pasos]
const now = Date.now(), rows = [];
const plan = [
  ['claude', 4, 'desktop', 'Edge', 'Bahía Blanca', ['page_view', 'play_clicked', 'assets_ready', 'game_started', ['song_started', 'Slow_Ride'], 'performance_sample']],
  ['unknown', 18, 'phone', 'Safari', 'Córdoba', ['page_view', 'play_clicked', 'assets_ready', 'game_started', ['song_started', 'Talk_Dirty_To_Me'], 'session_ended']],
  ['codex', 55, 'desktop', 'Edge', 'Bahía Blanca', ['page_view', 'play_clicked', 'assets_ready', 'game_started', 'session_ended']],
  ['santi', 130, 'phone', 'Chrome', 'Bahía Blanca', ['page_view', 'play_clicked', 'assets_ready', 'game_started', ['song_started', 'Hit_Me_With_Your_Best_Shot'], ['song_started', 'Story_Of_My_Life'], 'session_ended']],
  ['unknown', 210, 'desktop', 'Chrome', 'Rosario', ['page_view', 'session_ended']],
  ['unknown', 300, 'phone', 'Safari', 'Montevideo', ['page_view', 'play_clicked', 'load_error']],
  ['claude', 420, 'desktop', 'Edge', 'Bahía Blanca', ['page_view', 'play_clicked', 'assets_ready', 'game_started', ['song_started', 'Slow_Ride'], 'session_ended']],
  ['automation', 500, 'desktop', 'Edge', '', ['page_view', 'play_clicked', 'load_cancelled']],
];
plan.forEach(([tester, ago, device, browser, city, steps], v) => {
  const session = `00000000-0000-4000-8000-${String(v).padStart(12, '0')}`;
  steps.forEach((step, i) => {
    const [ev, song] = Array.isArray(step) ? step : [step];
    const m = {tester, browser, version: 'ejemplo', attempt_id: session};
    if (city) Object.assign(m, {geo_country: city === 'Montevideo' ? 'UY' : 'AR', geo_city: city});
    if (song) m.song = song;
    if (ev === 'session_ended') Object.assign(m, {seconds: 60 + i * 50, played: true});
    if (ev === 'load_error') Object.assign(m, {phase: 'chunks', error_name: 'TypeError', message: 'Failed to fetch'});
    if (ev === 'performance_sample') Object.assign(m, {game_pct: 88, fps: 59, interval_seconds: 30});
    rows.push({occurred_at: new Date(now - (ago - i * 1.2) * 60000).toISOString(), event_name: ev, session_id: session, source: v % 3 ? 'direct' : 'x', device, metadata: m});
  });
});
// Historia de días anteriores para el gráfico por autor.
for (let d = 1; d < 30; d++) for (const [t, n] of [['unknown', (d * 7) % 5 + 1], ['santi', d % 3], ['claude', d % 4 === 0 ? 2 : d % 2], ['codex', d % 5 === 0 ? 1 : 0]])
  for (let k = 0; k < n; k++) rows.push({occurred_at: new Date(now - d * 86400000 - k * 600000).toISOString(), event_name: 'page_view', session_id: `00000000-0000-4000-8000-${String(d * 100 + k + (t.length * 10000)).padStart(12, '0')}`, source: 'direct', device: 'desktop', metadata: {tester: t}});

const today = rows.filter(r => localDay(r.occurred_at) === localDay(now)).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
const visits = new Map(today.map(r => [r, r.session_id.slice(-8)]));
const aliases = new Map(today.map(r => [r, `Registro ${r.session_id.slice(-6)}`]));

const browser = await chromium.launch({channel: 'msedge', headless: !ver});
const errors = [];
try {
  for (const [name, viewport] of [['pc', {width: 1440, height: 900}], ['celular', {width: 390, height: 844}]]) {
    const ctx = await browser.newContext({viewport, deviceScaleFactor: name === 'pc' ? 1 : 2});
    await ctx.route('**/functions/v1/gh3-analytics-dashboard**', route => {
      const u = new URL(route.request().url());
      const body = u.searchParams.get('view') === 'activity'
        ? {activity: {...buildActivity(today, {day: localDay(now), aliases, visits}), until: new Date().toISOString()}}
        : {...buildDashboard(rows, Number(u.searchParams.get('days') || 30), now, u.searchParams.get('audience') || 'all'), feedback: null};
      route.fulfill({status: 200, contentType: 'application/json', headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(body)});
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto('http://127.0.0.1:5460/index.html');
    await page.fill('#password', 'x'.repeat(40));
    await page.click('#loginForm button');
    await page.waitForSelector('.visit-card', {timeout: 15000});
    await page.waitForTimeout(800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (over > 0) errors.push(`${name}: desborde horizontal ${over}px ` + await page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map(e => e.tagName + '.' + e.className + '#' + e.id).join(' | ')));
    await page.screenshot({path: path.join(out, `monitor-${name}-arriba.png`)});
    await page.locator('#whoSection').screenshot({path: path.join(out, `monitor-${name}-quien.png`)});
    await page.locator('#visitsSection').screenshot({path: path.join(out, `monitor-${name}-visitas.png`)});
    await ctx.close();
  }
} finally { await browser.close(); server.close(); }
console.log(JSON.stringify({salida: out, errores: errors}, null, 1));
