// Claude 2026-10-18 (precalentar): vuelca la lista de pipelines native60 guardada en IndexedDB (copia chica, no toca el perfil).
import {chromium} from 'playwright'; import fs from 'node:fs';
const [prof, out, port = '5491'] = process.argv.slice(2);
const ctx = await chromium.launchPersistentContext(prof, {channel: 'msedge', headless: true});
const p = ctx.pages()[0] || await ctx.newPage();
await p.route('**/*', r => r.fulfill({contentType: 'text/html', body: '<!doctype html>'}));
await p.goto(`http://127.0.0.1:${port}/vacio.html`);
const v = await p.evaluate(() => new Promise(ok => { const q = indexedDB.open('gh3-native60', 1); q.onupgradeneeded = () => q.result.createObjectStore('kv');
  q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('pipelines'); g.onsuccess = () => ok(g.result || []); g.onerror = () => ok([]); }; q.onerror = () => ok([]); }));
fs.writeFileSync(out, JSON.stringify(v)); console.log(prof, 'pipelines', v.length, 'en canción', v.filter(x => x.s).length); await ctx.close();
