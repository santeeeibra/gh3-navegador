// E1d: traza de instrucciones del guest a partir de una dirección (breakpoint rápido + stepOnBp), sin pausar.
// Uso: node tools/bottleship-e1/trace-step.mjs <etiqueta> <eip_hex> <n_instr> [segundos=120]
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
const [tag, eipHex, nStr, secStr] = process.argv.slice(2);
const OUT = `artifacts/research/bottleship-e1/${tag}`, n = Number(nStr), seconds = Number(secStr ?? 120);
const WGB = 'D:\guitar hero\original-data\wgb\gh3-pc.wgb';
await mkdir(OUT, {recursive: true});
const ev = {tag, eip: eipHex, n, pageErrors: [], externalRequests: []};
const ctx = await chromium.launchPersistentContext('D:\guitar hero\original-data\edge-profile', {
    channel: 'msedge', headless: true, viewport: {width: 1280, height: 860},
    args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'],
});
await ctx.route('**/*', route => { const u = new URL(route.request().url());
    if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return route.continue();
    ev.externalRequests.push(u.href); return route.abort(); });
const page = ctx.pages()[0] ?? await ctx.newPage();
page.on('pageerror', e => ev.pageErrors.push(String(e.message).slice(0, 300)));
const rpc = (name, args, t = 30000) => page.evaluate(([a, b, c]) => window.__BS__.harness.rpc(a, b, {timeoutMs: c}), [name, args, t]);
try {
    await page.goto('http://127.0.0.1:5177/?game=dev');
    await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
    ev.arm = await rpc('stepOnBp', [n]);
    ev.bp = await rpc('breakOn', [parseInt(eipHex, 16), {fast: true, pause: false, continuous: true}]);
    await page.evaluate(wgb => { window.__BS__.harness.openWgb(`http://127.0.0.1:3001/wgb?path=${encodeURIComponent(wgb)}`, {io: {mode: 'stream'}}).catch(() => {}); }, WGB);
    const t0 = Date.now(); let tr;
    while (Date.now() - t0 < seconds * 1000) {
        await page.waitForTimeout(4000);
        tr = await rpc('guestTrace', [{limit: n * 3 + 100}]);
        const lines = tr.lines ?? tr.entries ?? [];
        if (lines.length >= n) break;
    }
    ev.breaks = await rpc('breaks', []);
    await writeFile(`${OUT}/trace.json`, JSON.stringify(tr));
    console.log('trace keys', Object.keys(tr ?? {}), (tr?.lines ?? tr?.entries ?? []).length);
} catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
finally { await writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 1)); await ctx.close(); }
