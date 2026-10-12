// E1d: arranca gh3.exe SIN MODIFICAR y captura cada llamada a las APIs indicadas (sin pausar ni escribir):
// argumentos, 512 B de pila y 64 B apuntados por cada argumento, en el instante de la llamada.
// Al terminar guarda report/logs/census y vuelca `ars` y `est`.
// Uso: node tools/bottleship-e1/trace-apis.mjs <etiqueta> <segundos> <api1,api2,...>
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';

const tag = process.argv[2] ?? 'trace-apis', seconds = Number(process.argv[3] ?? 120);
const apis = (process.argv[4] ?? 'ntdll:NtQueryInformationProcess,ntdll:NtQuerySystemInformation,kernel32:FreeLibrary').split(',');
const OUT = `artifacts/research/bottleship-e1/${tag}`;
const WGB = 'D:\\guitar hero\\original-data\\wgb\\gh3-pc.wgb';
const DUMPS = [['ars', 0xDFA000, 0x58B930], ['est', 0x1386000, 0x76D0]];
await mkdir(OUT, {recursive: true});
const ev = {tag, apis, at: new Date().toISOString(), externalRequests: [], pageErrors: []};
const ctx = await chromium.launchPersistentContext('D:\\guitar hero\\original-data\\edge-profile', {
    channel: 'msedge', headless: true, viewport: {width: 1280, height: 860},
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'],
});
await ctx.route('**/*', route => {
    const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return route.continue();
    ev.externalRequests.push(route.request().url()); return route.abort();
});
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('pageerror', e => ev.pageErrors.push(String(e.message).slice(0, 500)));
const save = () => writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 1));
const rpc = (name, args) => page.evaluate(([n, a]) => window.__BS__.harness.rpc(n, a, {timeoutMs: 30000}), [name, args]);
try {
    await page.goto('http://127.0.0.1:5177/?game=dev');
    await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
    ev.logRing = await rpc('logRing', [200000]).catch(e => String(e));
    await page.evaluate(([apis, wgb]) => {
        const h = window.__BS__.harness; window.__tr = {hits: [], openError: null};
        const reads = [{reg: 'esp', size: 512}];
        for (let a = 1; a <= 5; a++) reads.push({reg: 'esp', offset: 4 * a, deref: true, size: 64});
        // Continuo: cada captura queda en el anillo de breakEvents del worker (no se pierde entre re-armados).
        for (const api of apis) h.rpc('breakOnApi', [api, {continuous: true, capture: {reads}}], {timeoutMs: 30000});
        h.openWgb(`http://127.0.0.1:3001/wgb?path=${encodeURIComponent(wgb)}`, {io: {mode: 'stream'}}).catch(e => { window.__tr.openError = String(e); });
    }, [apis, WGB]);
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
        await page.waitForTimeout(3000);
        const crashed = await rpc('logs', [400]).then(l => l.some(x => /Process crash|ExitProcess\(|MessageBoxA:/.test(x.message))).catch(() => false);
        if (crashed) { await page.waitForTimeout(3000); break; }
    }
    const tr = await page.evaluate(() => window.__tr);
    const be = await rpc('breakEvents', [{since: 0, limit: 4096}]);
    tr.hits = (be.events ?? be.records ?? be).map(r => ({api: r.at, seq: r.seq, hit: r.data}));
    ev.breakEventsMeta = {...be, events: undefined, records: undefined};
    ev.hits = tr.hits; ev.openError = tr.openError; ev.elapsed = Date.now() - t0;
    await save();
    for (const [name, fn] of [['report', () => page.evaluate(() => window.__BS__.harness.report())], ['logs', () => rpc('logs', [200000])], ['census', () => rpc('apiCensus', [])]]) {
        try { await writeFile(`${OUT}/${name}.json`, JSON.stringify(await fn())); } catch (e) { ev[name + 'Error'] = String(e); }
    }
    for (const [name, base, size] of DUMPS) {
        const parts = [];
        for (let off = 0; off < size; off += 0x10000) parts.push(Buffer.from((await rpc('readBytes', [base + off, Math.min(0x10000, size - off)])).hex, 'hex'));
        await writeFile(`${OUT}/${name}-${base.toString(16)}.bin`, Buffer.concat(parts));
    }
    console.log('hits', tr.hits.length, Object.entries(tr.hits.reduce((m, h) => (m[h.api] = (m[h.api] ?? 0) + 1, m), {})));
} catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
finally { await save(); await ctx.close(); }
