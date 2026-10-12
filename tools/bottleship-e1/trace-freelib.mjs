// E1f: GH3 SIN MODIFICAR. Captura FreeLibrary (entrada: EIP/ESP/retorno/pila/registros; salida: estado),
// el estado al volver al llamador (bp en las direcciones de retorno) y la traza por bloques desde ahí
// hasta el primer EIP inválido. Post-mortem: vuelca el código de los últimos bloques para desensamblar.
// Repite la corrida hasta que aparezca un EIP inválido (el fallo es intermitente).
// Uso: node tools/bottleship-e1/trace-freelib.mjs <etiqueta> [intentos=5] [segundos=60]
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
const tag = process.argv[2] ?? 'freelib', tries = Number(process.argv[3] ?? 5), seconds = Number(process.argv[4] ?? 60);
const WGB = 'D:/guitar hero/original-data/wgb/gh3-pc.wgb'.replaceAll('/', String.fromCharCode(92));
// Direcciones de retorno de los FreeLibrary vistos en ntq-base3/ntq-patch* (gh3 base 0x400000).
const RET_SITES = (process.env.RET_SITES ?? 'e29d34,e2aa04,ea07ab,ef4299').split(',').map(a => parseInt(a, 16));
const STEPS = Number(process.env.STEPS ?? 1500);
const INVALID = e => e < 0x400000;
const hx = v => '0x' + (v >>> 0).toString(16);

async function attempt(n) {
    const OUT = `artifacts/research/bottleship-e1/${tag}/try${n}`;
    await mkdir(OUT, {recursive: true});
    const ev = {tag, attempt: n, at: new Date().toISOString(), externalRequests: [], pageErrors: []};
    const ctx = await chromium.launchPersistentContext('D:\\guitar hero\\original-data\\edge-profile', {
        channel: 'msedge', headless: true, viewport: {width: 1280, height: 860},
        args: ['--autoplay-policy=no-user-gesture-required', '--enable-unsafe-webgpu'],
    });
    await ctx.route('**/*', route => { const u = new URL(route.request().url());
        if (u.hostname === '127.0.0.1' || u.protocol === 'blob:' || u.protocol === 'data:') return route.continue();
        ev.externalRequests.push(u.href); return route.abort(); });
    const page = ctx.pages()[0] ?? await ctx.newPage();
    page.on('pageerror', e => ev.pageErrors.push(String(e.message).slice(0, 500)));
    const rpc = (name, a, t = 30000) => page.evaluate(([x, y, z]) => window.__BS__.harness.rpc(x, y, {timeoutMs: z}), [name, a, t]);
    let result = {invalid: null};
    try {
        await page.goto('http://127.0.0.1:5177/?game=dev');
        await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
        ev.logLevel = await rpc('logLevel', ['KERNEL32', 'VERBOSE']).catch(e => String(e));
        ev.logRing = await rpc('logRing', [200000]).catch(e => String(e));
        await rpc('breakEvents', [{capacity: 20000, limit: 1}]).catch(() => null);
        ev.armed = [await rpc('breakOnApi', ['kernel32:FreeLibrary', {continuous: true,
            capture: {reads: [{reg: 'esp', offset: -16, size: 80}], after: {args: [{index: 0, size: 64}]}}}])];
        await page.evaluate(wgb => { window.__openErr = null; window.__BS__.harness.openWgb(`http://127.0.0.1:3001/wgb?path=${encodeURIComponent(wgb)}`, {io: {mode: 'stream'}}).catch(e => { window.__openErr = String(e); }); }, WGB);
        const t0 = Date.now(); let stepArmed = false;
        while (Date.now() - t0 < seconds * 1000) {
            await page.waitForTimeout(stepArmed ? 2000 : 300);
            if (!stepArmed && (await rpc('breakEvents', [{limit: 1}]).catch(() => null))?.total > 0) {
                // Igual que trace-ntq: breakOn primero, stepOnBp después (orden del interceptor de guestTrace).
                ev.stepArm = [];
                for (const a of RET_SITES) ev.stepArm.push(await rpc('breakOn', [a, {fast: true, pause: false, continuous: true,
                    capture: {reads: [{reg: 'esp', offset: -16, size: 80}]}}]).catch(e => String(e)));
                ev.stepArm.push(await rpc('stepOnBp', [STEPS]).catch(e => String(e)));
                stepArmed = true;
            }
            const logs = await rpc('logs', [300]).catch(() => []);
            if (logs.some(x => /Process crash|ExitProcess\(|EIP=0x/i.test(x.message))) { ev.stop = 'crash/exit'; await page.waitForTimeout(2000); break; }
        }
        ev.elapsed = Date.now() - t0;
        ev.openError = await page.evaluate(() => window.__openErr);
        ev.events = []; let since = 0;
        for (;;) { const be = await rpc('breakEvents', [{since, limit: 5000}]);
            const evs = (be.events ?? []).filter(r => r.seq > since); if (!evs.length) break; ev.events.push(...evs); since = evs.at(-1).seq;
            if (evs.length < 5000) break; }
        const gt = await rpc('guestTrace', [{limit: 20000}]).catch(e => ({error: String(e)}));
        await writeFile(`${OUT}/guesttrace.json`, JSON.stringify(gt));
        // Primer EIP inválido después del último <BP>, y los bloques que lo preceden.
        const lines = (gt.lines ?? []).map(l => typeof l === 'string' ? l : JSON.stringify(l));
        const eipOf = l => { const m = /eip=0x([0-9a-f]+)/.exec(l); return m ? parseInt(m[1], 16) : null; };
        let lastBp = -1; lines.forEach((l, i) => { if (/<BP>/.test(l)) lastBp = i; });
        let k = -1; for (let i = Math.max(0, lastBp); i < lines.length; i++) { const e = eipOf(lines[i]); if (e !== null && INVALID(e)) { k = i; break; } }
        if (k > 0) {
            // Volcados: cada uno de los 8 bloques previos (0x180 bytes desde su entrada).
            const prev = lines.slice(Math.max(lastBp, k - 8), k).map(eipOf).filter(e => e !== null);
            ev.dumps = {};
            for (const a of [...new Set(prev)]) ev.dumps[hx(a)] = await rpc('readBytes', [a, 0x180]).catch(e => String(e));
            // Estado de PEB/TEB post-mortem: PEB 0x04000000 (+0x0C Ldr) y TEB del hilo 1 (+0x30 = puntero al PEB).
            for (const [a, len] of [[0x04000000, 0x40], [0x04000630, 0x40], [0x04208b60, 0x40]]) ev.dumps['state_' + hx(a)] = await rpc('readBytes', [a, len]).catch(e => String(e));
            result = {invalid: lines[k], from: lines[k - 1], lastBp: lines[lastBp], window: lines.slice(Math.max(lastBp, k - 60), k + 3)};
        }
        ev.result = result;
        for (const [name, fn] of [['report', () => page.evaluate(() => window.__BS__.harness.report())], ['logs', () => rpc('logs', [200000])]]) {
            try { await writeFile(`${OUT}/${name}.json`, JSON.stringify(await fn())); } catch (e) { ev[name + 'Error'] = String(e); }
        }
    } catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
    finally { await writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 1)); await ctx.close(); }
    const fl = (ev.events ?? []).filter(r => /FreeLibrary/.test(r.at)).length;
    console.log(`try${n} stop=${ev.stop} elapsed=${ev.elapsed} FreeLibrary=${fl} invalid=${result.invalid ? result.invalid.slice(0, 60) : 'no'}`);
    if (!result.invalid) return null;
    return /eip=0x0000(86|85)/.test(result.invalid) ? 'B' : 'A';
}

// Modo A: salto a EAX desde código del heap; modo B: #PF en el recorrido de PEB->Ldr. Para cuando vio ambos.
const seen = new Set();
for (let n = 1; n <= tries; n++) { const m = await attempt(n); if (m) seen.add(m); if (seen.has('A') && seen.has('B')) break; }
console.log('modos vistos', [...seen].join(','));
