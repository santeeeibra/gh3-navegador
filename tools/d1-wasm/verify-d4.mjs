// Paso D4: abre la página local en Edge headless, elige la carpeta del juego en el selector de carpeta
// (como lo haría Santi), arranca y guarda el resultado. Red bloqueada salvo 127.0.0.1.
// Requiere el servidor: node tools/d1-wasm/serve-d4.mjs   Uso: node tools/d1-wasm/verify-d4.mjs [segundos] [etiqueta]
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seconds = Number(process.argv[2] || 10);
const label = process.argv[3] || 'edge';
const gpu = process.argv[4] || 'none';
const audio = process.argv[5] || 'silent';
const xma=process.argv[6] || 'decode';
if(!['decode','silent-consume'].includes(xma)) throw new Error('XMA: decode o silent-consume');
if (!['silent','nop'].includes(audio)) throw new Error('Audio: silent o nop');
if (!['none','null'].includes(gpu)) throw new Error('GPU: none o null');
const game = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const url = process.env.D4_URL || 'http://127.0.0.1:5178/';
const out = process.env.D4_OUT || path.join(root, 'artifacts/d1-wasm/d4');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
const pageErrors = [];
// R5F: la página descarga el archivo de captura; se guarda como <D4_OUT>/<etiqueta>-<nombre>.r5f.
const r5fSaves = [];
page.on('download', (d) => r5fSaves.push(d.saveAs(path.join(out, `${label}-${d.suggestedFilename()}`)).then(() => d.suggestedFilename(), (e) => 'error: ' + e)));
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
const testUrl = new URL(url); testUrl.searchParams.set('audio',audio); testUrl.searchParams.set('xma',xma); if (process.env.G1_CP_WAIT) testUrl.searchParams.set('cpwait', process.env.G1_CP_WAIT); if (process.env.G1E_PRESS) testUrl.searchParams.set('press', process.env.G1E_PRESS); if (process.env.G1_R3A_YIELD) testUrl.searchParams.set('r3ayield', process.env.G1_R3A_YIELD); if (process.env.G1_R3A_CHECK) testUrl.searchParams.set('r3acheck', process.env.G1_R3A_CHECK); for (const [k, e] of [['cpasync', 'G1_CP_ASYNC'], ['r3bbudget', 'G1_R3B_BUDGET_US'], ['r3bpkts', 'G1_R3B_BUDGET_PKTS'], ['r3bfake', 'G1_R3B_FAKE_PENDING'], ['r3c', 'G1_R3C'], ['r5snap', 'G1_R5SNAP'], ['r5select', 'G1_R5SNAP_SELECT'], ['r5test', 'G1_R5SNAP_TEST'], ['r5max', 'G1_R5SNAP_MAX'], ['r5consumer', 'G1_R5SNAP_CONSUMER'], ['r5frame', 'G1_R5FRAME'], ['r5framemax', 'G1_R5FRAME_MAX']]) if (process.env[e]) testUrl.searchParams.set(k, process.env[e]);
await page.goto(testUrl.href);
await page.setInputFiles('#dir', game);
await page.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 30000 });
await page.fill('#secs', String(seconds));
await page.selectOption('#gpu', gpu);
const cdp = await browser.newBrowserCDPSession();
const ramSamples = [];
let ramBusy = false;
async function sampleRam() {
  if (ramBusy) return;
  ramBusy = true;
  try {
    const {processInfo} = await cdp.send('SystemInfo.getProcessInfo');
    const rows = await new Promise((resolve) => {
      const child = spawn('tasklist', ['/FO','CSV','/NH']);
      let text = ''; child.stdout.on('data', d => text += d);
      child.on('close', () => resolve(text)); child.on('error', () => resolve(''));
    });
    const processes = processInfo.map(p => {
      const line = rows.split(/\r?\n/).find(l => l.startsWith('"') && Number(l.split('","')[1]) === Number(p.id));
      const m = line?.match(/"([\d.,]+) KB"/);
      return {pid:p.id, type:p.type, rssBytes:m ? Number(m[1].replace(/[.,]/g,''))*1024 : null};
    });
    ramSamples.push({t:(Date.now()-ramStart)/1000, processes,
      sumWorkingSetBytes:processes.reduce((sum,p)=>sum+(p.rssBytes||0),0)});
  } catch (e) { ramSamples.push({error:String(e)}); }
  finally { ramBusy = false; }
}
const ramStart=Date.now();
const ramTimer=setInterval(sampleRam, 1000);
const cpuSum = async () => (await cdp.send('SystemInfo.getProcessInfo')).processInfo.reduce((a, p) => a + (p.cpuTime || 0), 0);
const cpu0 = await cpuSum();
await page.click('#go');
const t0 = Date.now();
// R3c: dos capturas del lienzo del latido (prueba del backend, NO un cuadro de GH3), separadas.
const r3cShots = [];
if (process.env.G1_R3C === '1') {
  (async () => {
    try {
      await page.waitForFunction(() => window.d4.r3c && window.d4.r3c.drawn > 30, null, { timeout: (seconds + 60) * 1000 });
      for (let k = 0; k < 3; k++) {
        const info = await page.evaluate(() => ({ drawn: window.d4.r3c.drawn, lastIdx: window.d4.r3c.lastIdx, lastColor: window.d4.r3c.lastColor }));
        const file = `${label}-r3c-${k}.png`;
        await page.locator('#r3cBox').screenshot({ path: path.join(out, file) });
        r3cShots.push({ ...info, file, t: (Date.now() - t0) / 1000 });
        await new Promise((res) => setTimeout(res, 1700));
      }
    } catch (e) { r3cShots.push({ error: String(e) }); }
  })();
}
await page.waitForFunction(() => window.d4.exit !== null, null, { timeout: (seconds + 180) * 1000 }).catch(() => {});
clearInterval(ramTimer);
const cpuWall = (Date.now() - t0) / 1000, cpu1 = await cpuSum();
await sampleRam();
await page.waitForTimeout(r5fSaves.length || process.env.G1_R5FRAME ? 3000 : 0);
const r = await page.evaluate(() => ({ ...window.d4, status: document.getElementById('status').textContent }));
r.r5frameSaved = await Promise.all(r5fSaves);
const log = r.log; delete r.log;
r.ramSamples=ramSamples;
r.peakProcessWorkingSetMB=Math.max(0,...ramSamples.map(s=>(s.sumWorkingSetBytes||0)/1048576));
r.ramMeasurement="Sum of working sets for this browser CDP process tree; shared pages may be counted twice. Not wasm reserved memory.";
r.r3cShots = r3cShots; r.xma=xma; r.audio = audio; r.gpu = gpu; r.label = label; r.seconds = seconds; r.browser = browser.version(); r.pageErrors = pageErrors;
r.cpu = { browserTreeCpuS: cpu1 - cpu0, wallS: cpuWall, cores: (cpu1 - cpu0) / cpuWall, note: 'SystemInfo.getProcessInfo cpuTime, todos los procesos de este Edge' };
r.timedOut = r.exit === null; r.waitSeconds = (Date.now() - t0) / 1000;
r.vdAll = ['VdSetGraphicsInterruptCallback', 'VdInitializeRingBuffer', 'VdEnableRingBufferRPtrWriteBack'].every((v) => r.vd[v]);
fs.writeFileSync(path.join(out, `${label}.log`), log.join('\n'));
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(r, null, 2));
await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: false });
await browser.close();
console.log(JSON.stringify({ exit: r.exit, vdAll: r.vdAll, vd: r.vd, marks: r.marks, peakMemMB: Math.round(r.peakMemBytes / 1048576), wall: r.wallSeconds, errors: pageErrors.length, timedOut: r.timedOut, cpu: r.cpu }, null, 1));
