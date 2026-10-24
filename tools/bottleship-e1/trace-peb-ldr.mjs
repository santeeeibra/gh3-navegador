// E1f: GH3 SIN MODIFICAR. Vigila PEB->Ldr (PEB+0x0C): apenas el loader lo publica, arma una trampa de
// escrituras del guest (watch) y otra de escrituras JS del emulador sobre esos 4 bytes, y muestrea el
// valor hasta el final. Repite hasta ver un cambio o el AV en gh3+0xa4c52c.
// Uso: node tools/bottleship-e1/trace-peb-ldr.mjs <etiqueta> [intentos=5] [segundos=60]
import {chromium} from 'playwright';
import {mkdir, writeFile} from 'node:fs/promises';
const tag = process.argv[2] ?? 'pebldr', tries = Number(process.argv[3] ?? 5), seconds = Number(process.argv[4] ?? 60);
const WGB = 'D:/guitar hero/original-data/wgb/gh3-pc.wgb'.replaceAll('/', String.fromCharCode(92));
const PEB = Number(process.env.PEB ?? 0x04000000), LDR = PEB + 0x0C;
const u32 = hex => hex ? Buffer.from(hex, 'hex').readUInt32LE(0) : null;

async function attempt(n) {
    const OUT = `artifacts/research/bottleship-e1/${tag}/try${n}`;
    await mkdir(OUT, {recursive: true});
    const ev = {tag, attempt: n, at: new Date().toISOString(), externalRequests: [], pageErrors: [], samples: []};
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
    const readLdr = async () => u32((await rpc('readBytes', [LDR, 4]).catch(() => null))?.hex);
    let changed = false, avAtWalk = false;
    try {
        await page.goto('http://127.0.0.1:5177/?game=dev');
        await page.waitForFunction(() => !!window.__BS__?.harness, {}, {timeout: 60000});
        ev.logRing = await rpc('logRing', [200000]).catch(e => String(e));
        await page.evaluate(wgb => { window.__openErr = null; window.__BS__.harness.openWgb(`http://127.0.0.1:3001/wgb?path=${encodeURIComponent(wgb)}`, {io: {mode: 'stream'}}).catch(e => { window.__openErr = String(e); }); }, WGB);
        const t0 = Date.now(); let armed = false, first = null;
        while (Date.now() - t0 < seconds * 1000) {
            await page.waitForTimeout(armed ? 250 : 50);
            const v = await readLdr();
            if (!armed && v) {
                first = v;
                ev.armedAt = {ms: Date.now() - t0, ldr: v};
                ev.wasmStringWriters = await rpc('wasmStringWriters', [false]).catch(e => String(e));
                ev.trapGuest = await rpc('trapWrites', [LDR, 4, 'PEB.Ldr', {watch: true}]).catch(e => String(e));
                ev.trapJs = await rpc('trapJsWrites', [LDR, 4, 'PEB.Ldr']).catch(e => String(e));
                armed = true;
            }
            if (armed && (ev.samples.length === 0 || ev.samples.at(-1).ldr !== v)) ev.samples.push({ms: Date.now() - t0, ldr: v});
            if (armed && v !== first) changed = true;
            const logs = await rpc('logs', [300]).catch(() => []);
            if (logs.some(x => /Process crash|ExitProcess\(|EIP=0x/i.test(x.message))) { ev.stop = 'crash/exit'; await page.waitForTimeout(1500); break; }
        }
        ev.elapsed = Date.now() - t0;
        ev.finalLdr = await readLdr();
        ev.openError = await page.evaluate(() => window.__openErr);
        ev.memTrap = await rpc('memTrapReport', []).catch(e => String(e));
        ev.jsWrites = await rpc('jsWriteReport', []).catch(e => String(e));
        const logs = await rpc('logs', [200000]).catch(() => []);
        avAtWalk = logs.some(x => /EIP=0xe4c52c/i.test(x.message));
        ev.faultLines = logs.filter(x => /#PF|SEH dispatch|EXIT-TRACE|MemWriteTrap|JsWriteTrap/i.test(x.message)).map(x => x.message).slice(-40);
        await writeFile(`${OUT}/logs.json`, JSON.stringify(logs));
        try { await writeFile(`${OUT}/report.json`, JSON.stringify(await page.evaluate(() => window.__BS__.harness.report()))); } catch (e) { ev.reportError = String(e); }
    } catch (e) { ev.error = String(e?.stack ?? e); console.log(ev.error); }
    finally { await writeFile(`${OUT}/evidence.json`, JSON.stringify(ev, null, 1)); await ctx.close(); }
    const hx = v => v == null ? v : '0x' + (v >>> 0).toString(16);
    console.log(`try${n} stop=${ev.stop} elapsed=${ev.elapsed} armedLdr=${hx(ev.armedAt?.ldr)} final=${hx(ev.finalLdr)} samples=${ev.samples.map(s => s.ms + ':' + hx(s.ldr)).join(',')} avAtWalk=${avAtWalk}`);
    return changed || avAtWalk;
}

for (let n = 1; n <= tries; n++) if (await attempt(n)) break;
