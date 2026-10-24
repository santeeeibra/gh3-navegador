// E1: arranca gh3.exe SIN MODIFICAR dentro de BottleShip local (Edge, perfil en D:) y registra diagnóstico.
// Red: solo 127.0.0.1/blob/data; todo lo demás se aborta y se inventaría (incluye workers vía context.route).
// Uso: node tools/bottleship-e1/run-gh3.mjs [segundos=240] [etiqueta=run1]
import {chromium} from 'playwright';
import {mkdir, writeFile, statfs} from 'node:fs/promises';
const RING = Number(process.env.E1_RING ?? 200000);
const MIN_FREE_GB = Number(process.env.E1_MIN_FREE_GB ?? 1.5);
const freeGB = async () => { const f = await statfs('D:/'); return f.bavail * f.bsize / 2 ** 30; };

const seconds = Number(process.argv[2] ?? 240), tag = process.argv[3] ?? 'run1';
const OUT = `artifacts/research/bottleship-e1/${tag}`;
const WGB = 'D:\\guitar hero\\original-data\\wgb\\gh3-pc.wgb';
const BASE = 'http://127.0.0.1:5177';
await mkdir(OUT, {recursive: true});
const ev = {tag, at: new Date().toISOString(), wgb: WGB, externalRequests: [], pageErrors: [], console: [], samples: [], openWgb: null};
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
page.on('console', m => { if (ev.console.length < 4000) ev.console.push(`[${m.type()}] ${m.text().slice(0, 400)}`); });
ev.browser = ctx.browser()?.version();
const save = () => writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 2));
try {
    const url = process.env.E1_SIDECAR === "0" ? `/__wgb/?path=${encodeURIComponent(WGB)}` : `http://127.0.0.1:3001/wgb?path=${encodeURIComponent(WGB)}`;
    ev.bundleUrl = url;
    // E1_BOOT_URL=1: el bundle queda pendiente antes de iniciar v86, así se aplica el RAM del manifiesto.
    ev.bootMode = process.env.E1_BOOT_URL ? 'load-param' : 'openWgb';
    await page.goto(process.env.E1_BOOT_URL ? `${BASE}/?game=dev&load=${encodeURIComponent(url)}` : `${BASE}/?game=dev`);
    await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
    ev.environment = await page.evaluate(async () => {
        const a = await navigator.gpu?.requestAdapter();
        return {isolated: crossOriginIsolated, sab: typeof SharedArrayBuffer, gpu: a ? {vendor: a.info.vendor, arch: a.info.architecture, fallback: a.info.isFallbackAdapter} : null};
    });
    if (process.env.E1_K32_VERBOSE) ev.logLevel = await page.evaluate(() => window.__BS__.harness.rpc('logLevel', ['KERNEL32', 'VERBOSE'])).catch(e => String(e));
    ev.logRing = await page.evaluate(n => window.__BS__.harness.rpc('logRing', [n]), RING).catch(e => String(e));
    // openWgb resuelve al terminar la carga; se lanza sin bloquear y se muestrea el estado mientras arranca.
    if (!process.env.E1_BOOT_URL) await page.evaluate(u => {
        window.__e1 = {state: 'pending'};
        window.__BS__.harness.openWgb(u, {io: {mode: 'stream'}})
            .then(r => { window.__e1 = {state: 'resolved', r: JSON.parse(JSON.stringify(r ?? null))}; })
            .catch(e => { window.__e1 = {state: 'rejected', error: String(e?.stack ?? e)}; });
    }, url);
    const t0 = Date.now(); let i = 0;
    while (Date.now() - t0 < seconds * 1000) {
        await page.waitForTimeout(i === 0 ? 10000 : Number(process.env.E1_INTERVAL_MS ?? 20000)); i++;
        const s = {t: Math.round((Date.now() - t0) / 1000), freeGB: +(await freeGB()).toFixed(2)};
        if (s.freeGB < MIN_FREE_GB) { ev.abortedLowDisk = s; ev.samples.push(s); console.log('ABORT: poco espacio en D:', s.freeGB); break; }
        s.open = await page.evaluate(() => window.__e1);
        try {
            const rep = await page.evaluate(() => Promise.race([window.__BS__.harness.report(), new Promise((_, r) => setTimeout(() => r(new Error('report timeout')), 15000))]));
            await writeFile(`${OUT}/report-${String(s.t).padStart(4, '0')}.json`, JSON.stringify(rep, null, 1));
            s.reportKeys = Object.keys(rep ?? {});
        } catch (e) { s.reportError = String(e); }
        try {
            const shot = await page.evaluate(() => Promise.race([window.__BS__.harness.rpc('shot', [{source: 'screen'}]), new Promise((_, r) => setTimeout(() => r(new Error('shot timeout')), 15000))]));
            if (shot?.base64) { await writeFile(`${OUT}/screen-${String(s.t).padStart(4, '0')}.png`, Buffer.from(shot.base64, 'base64')); s.shot = true; }
            else s.shotResult = JSON.stringify(shot).slice(0, 300);
        } catch (e) { s.shotError = String(e); }
        try {
            const logs = await page.evaluate(n => window.__BS__.harness.rpc('logs', [n]), RING);
            await writeFile(`${OUT}/logs-${String(s.t).padStart(4, '0')}.json`, JSON.stringify(logs));
            s.logCount = logs.length; s.wgbLogs = logs.filter(l => /WGB|io-worker|SAB I\/O|Unimplemented|exception|fault/i.test(l.message)).slice(-8).map(l => l.message.slice(0, 300));
        } catch (e) { s.logsError = String(e); }
        try { const c = await page.evaluate(() => window.__BS__.harness.rpc('apiCensus', [])); await writeFile(`${OUT}/census-${String(s.t).padStart(4, '0')}.json`, JSON.stringify(c)); } catch (e) { s.censusError = String(e); }
        await page.screenshot({path: `${OUT}/page-${String(s.t).padStart(4, '0')}.png`}).catch(() => {});
        ev.samples.push(s); await save();
        console.log(JSON.stringify(s).slice(0, 400));
    }
    if (process.env.E1_READ) { ev.reads = {}; for (const spec of process.env.E1_READ.split(',')) { const [a, n] = spec.split(':'); ev.reads[a] = await page.evaluate(([x, k]) => window.__BS__.harness.rpc('readBytes', [x, k]), [parseInt(a, 16), Number(n)]).catch(e => String(e)); } }
    ev.openWgb = await page.evaluate(() => window.__e1);
} catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
finally { await save(); await ctx.close(); }
