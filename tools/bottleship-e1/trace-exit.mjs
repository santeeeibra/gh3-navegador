// E1c: arranca gh3.exe SIN MODIFICAR, frena (sin pausar) en GetProcAddress("FT_Thunk") y en ExitProcess,
// captura pila/registros en el instante y vuelca el código desempaquetado de `ars`/`est` para desensamblarlo.
// Solo lectura del guest: no escribe memoria ni altera el flujo del juego.
// Uso: node tools/bottleship-e1/trace-exit.mjs [etiqueta=trace1] [segundos=90]
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';

const tag = process.argv[2] ?? 'trace1', seconds = Number(process.argv[3] ?? 90);
const OUT = `artifacts/research/bottleship-e1/${tag}`;
const WGB = 'D:\\guitar hero\\original-data\\wgb\\gh3-pc.wgb';
const BASE = 'http://127.0.0.1:5177';
const DUMPS = [['ars', 0xDFA000, 0x58B930], ['est', 0x1386000, 0x76D0]];
await mkdir(OUT, {recursive: true});
const ev = {tag, at: new Date().toISOString(), externalRequests: [], pageErrors: []};
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
const rpc = (name, args) => page.evaluate(([n, a]) => window.__BS__.harness.rpc(n, a), [name, args]);
try {
    await page.goto(`${BASE}/?game=dev`);
    await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
    // Lecturas en el instante del hit: 4 KB de pila y los dos argumentos de GetProcAddress.
    const stackReads = [{reg: 'esp', size: 4096}];
    await page.evaluate(([reads]) => {
        const h = window.__BS__.harness; window.__e1c = {gpa: [], exit: null};
        const armGpa = () => h.rpc('breakOnApi', ['kernel32:GetProcAddress', {capture: {reads: [...reads, {reg: 'esp', offset: 8, deref: true, size: 32}]}}], {timeoutMs: 0})
            .then(r => { const hit = r?.hit; window.__e1c.gpa.push(hit); const s = JSON.stringify(hit); if (!/46545f5468756e6b/.test(s) && window.__e1c.gpa.length < 400) armGpa(); else window.__e1c.ftHit = true; });
        armGpa();
        h.rpc('breakOnApi', ['kernel32:ExitProcess', {capture: {reads}}], {timeoutMs: 0}).then(r => { window.__e1c.exit = r?.hit ?? r; });
        const url = `http://127.0.0.1:3001/wgb?path=${encodeURIComponent('D:\\guitar hero\\original-data\\wgb\\gh3-pc.wgb')}`;
        h.openWgb(url, {io: {mode: 'stream'}}).catch(e => { window.__e1c.openError = String(e); });
    }, [stackReads]);
    const t0 = Date.now();
    while (Date.now() - t0 < seconds * 1000) {
        await page.waitForTimeout(2000);
        if (await page.evaluate(() => !!window.__e1c.exit)) break;
    }
    const st = await page.evaluate(() => window.__e1c);
    ev.ftThunkHit = st.gpa.find(h => /46545f5468756e6b/.test(JSON.stringify(h))) ?? null;
    ev.gpaHits = st.gpa.length; ev.exit = st.exit; ev.openError = st.openError;
    await save();
    if (!st.exit) { console.log('sin ExitProcess en', seconds, 's'); }
    // Volcado del código ya desempaquetado (después de la salida la imagen sigue en memoria).
    for (const [name, base, size] of DUMPS) {
        const parts = [];
        for (let off = 0; off < size; off += 0x10000) {
            const r = await rpc('readBytes', [base + off, Math.min(0x10000, size - off)]);
            parts.push(Buffer.from(r.hex, 'hex'));
        }
        await writeFile(`${OUT}/${name}-${base.toString(16)}.bin`, Buffer.concat(parts));
    }
    ev.dumps = DUMPS.map(([n, b, s]) => ({n, base: '0x' + b.toString(16), size: s}));
    console.log('ok exit=', !!st.exit, 'ft=', !!ev.ftThunkHit, 'gpaHits=', st.gpa.length);
} catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
finally { await save(); await ctx.close(); }
