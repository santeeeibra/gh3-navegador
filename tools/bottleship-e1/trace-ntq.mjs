// E1d: corrida de GH3 SIN MODIFICAR con captura antes/después de las consultas a ntdll,
// traza de las primeras lecturas del buffer de salida, texto de diálogos y carga/descarga de módulos.
// Uso: node tools/bottleship-e1/trace-ntq.mjs <etiqueta> [segundos=150]
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
const tag = process.argv[2] ?? 'ntq', seconds = Number(process.argv[3] ?? 150);
const OUT = `artifacts/research/bottleship-e1/${tag}`;
const WGB = 'D:/guitar hero/original-data/wgb/gh3-pc.wgb'.replaceAll('/', String.fromCharCode(92));
await mkdir(OUT, {recursive: true});
const ev = {tag, at: new Date().toISOString(), externalRequests: [], pageErrors: []};
const ctx = await chromium.launchPersistentContext('D:\guitar hero\original-data\edge-profile', {
    channel: 'msedge', headless: true, viewport: {width: 1280, height: 860},
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'],
});
await ctx.route('**/*', route => { const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return route.continue();
    ev.externalRequests.push(u.href); return route.abort(); });
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('pageerror', e => ev.pageErrors.push(String(e.message).slice(0, 500)));
const rpc = (n, a, t = 30000) => page.evaluate(([n, a, t]) => window.__BS__.harness.rpc(n, a, {timeoutMs: t}), [n, a, t]);
const save = () => writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 1));
const argReads = (n, size) => Array.from({length: n}, (_, i) => ({reg: 'esp', offset: 4 * (i + 1), deref: true, size}));
const ARMS = [
    // NtQueryInformationProcess(h, class, buf, len, &retlen)
    ['ntdll:NtQueryInformationProcess', {reads: [{reg: 'esp', size: 64}], after: {args: [{index: 2, size: 64}, {index: 4, size: 4}]}}],
    // NtQuerySystemInformation(class, buf, len, &retlen)
    ['ntdll:NtQuerySystemInformation', {reads: [{reg: 'esp', size: 64}], after: {args: [{index: 1, size: 0x100}, {index: 3, size: 4}], trace: {index: 1, len: 0x100, hits: 24}}}],
    ['/user32:(DialogBox|CreateDialog)/', {reads: [{reg: 'esp', size: 32}, {reg: 'esp', offset: 8, deref: true, size: 2048}]}],
    ['/user32:(MessageBox|SetDlgItemText|SetWindowText)/', {reads: [{reg: 'esp', size: 32}, ...argReads(3, 256)]}],
    ['/kernel32:(FreeLibrary|LoadLibrary|GetModuleHandle)/', {reads: [{reg: 'esp', size: 16}, {reg: 'esp', offset: 4, deref: true, size: 128}]}],
];
try {
    await page.goto('http://127.0.0.1:5177/?game=dev');
    await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
    ev.logRing = await rpc('logRing', [200000]).catch(e => String(e));
    ev.ring = await rpc('breakEvents', [{capacity: 20000, limit: 1}]).then(r => ({capacity: r.capacity})).catch(e => String(e));
    ev.armed = [];
    for (const [api, capture] of ARMS) ev.armed.push(await rpc('breakOnApi', [api, {continuous: true, capture}]));
    await page.evaluate(wgb => { window.__openErr = null; window.__BS__.harness.openWgb(`http://127.0.0.1:3001/wgb?path=${encodeURIComponent(wgb)}`, {io: {mode: 'stream'}}).catch(e => { window.__openErr = String(e); }); }, WGB);
    // Traza de instrucciones desde las direcciones de retorno (la pila no se puede proteger: el #PF recursa).
    const STEP_AT = (process.env.STEP_AT ?? '').split(',').filter(Boolean), STEPS = Number(process.env.STEPS ?? 300);
    const t0 = Date.now(); let lastSeq = 0, quiet = 0, stepArmed = !STEP_AT.length;
    while (Date.now() - t0 < seconds * 1000) {
        await page.waitForTimeout(stepArmed ? 3000 : 500);
        if (!stepArmed && (await rpc('breakEvents', [{limit: 1}]).catch(() => null))?.total > 0) {
            // Orden: breakOn instala su interceptor de console.error; stepOnBp después, para que el
            // anillo de guestTrace quede último en la cadena (si no, descarta las líneas).
            ev.stepArm = [];
            for (const a of STEP_AT) ev.stepArm.push(await rpc('breakOn', [parseInt(a, 16), {fast: true, pause: false, continuous: true}]).catch(e => String(e)));
            ev.stepArm.push(await rpc('stepOnBp', [STEPS]).catch(e => String(e)));
            stepArmed = true;
        }
        const logs = await rpc('logs', [300]).catch(() => []);
        if (logs.some(x => /Process crash|ExitProcess\(|EIP=0x/i.test(x.message))) { ev.stop = 'crash/exit'; await page.waitForTimeout(3000); break; }
        const be = await rpc('breakEvents', [{since: lastSeq, limit: 1}]).catch(() => null);
        const seq = be?.total ?? lastSeq;
        if (seq > 0 && seq === lastSeq) { if (++quiet >= 10) { ev.stop = 'sin eventos 30 s'; break; } } else quiet = 0;
        lastSeq = seq;
    }
    ev.elapsed = Date.now() - t0;
    ev.openError = await page.evaluate(() => window.__openErr);
    ev.events = []; let since = 0;
    for (;;) { const be = await rpc('breakEvents', [{since, limit: 5000}]); ev.breakEventsMeta = {...be, events: undefined};
        const evs = (be.events ?? []).filter(r => r.seq > since); if (!evs.length) break; ev.events.push(...evs); since = evs.at(-1).seq;
        if (evs.length < 5000) break; }
    await save();
    for (const [name, fn] of [['report', () => page.evaluate(() => window.__BS__.harness.report())], ['logs', () => rpc('logs', [200000])], ['census', () => rpc('apiCensus', [])], ['memtrap', () => rpc('memTrapReport', [])], ['guesttrace', () => rpc('guestTrace', [{limit: 20000}])]]) {
        try { await writeFile(`${OUT}/${name}.json`, JSON.stringify(await fn())); } catch (e) { ev[name + 'Error'] = String(e); }
    }
    const kinds = ev.events.reduce((m, r) => (m[`${r.kind}:${r.at}`] = (m[`${r.kind}:${r.at}`] ?? 0) + 1, m), {});
    console.log('stop', ev.stop, 'elapsed', ev.elapsed, kinds);
} catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
finally { await save(); await ctx.close(); }
