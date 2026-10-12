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
const out = path.join(root, 'artifacts/d1-wasm/d4');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
await page.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort()));
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push('console: ' + m.text()); });
const testUrl = new URL(url); testUrl.searchParams.set('audio',audio); testUrl.searchParams.set('xma',xma);
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
      return {pid:p.id, type:p.type, cpuTimeSeconds:p.cpuTime, rssBytes:m ? Number(m[1].replace(/[.,]/g,''))*1024 : null};
    });
    ramSamples.push({t:(Date.now()-ramStart)/1000, processes,
      sumWorkingSetBytes:processes.reduce((sum,p)=>sum+(p.rssBytes||0),0)});
  } catch (e) { ramSamples.push({error:String(e)}); }
  finally { ramBusy = false; }
}
const ramStart=Date.now();
const ramTimer=setInterval(sampleRam, 1000);
await page.click('#go');
const t0 = Date.now();
// G1e: G1E_LIVE="150,175" pulsa el botón "Pulsar START" de la página a esos segundos (como lo haría una persona).
const liveTimers = (process.env.G1E_LIVE || '').split(',').filter(Boolean).map(Number).map((s) =>
  setTimeout(() => page.click('#pressStart').catch(() => {}), s * 1000));
await page.waitForFunction(() => window.d4.exit !== null, null, { timeout: (seconds + 180) * 1000 }).catch(() => {});
clearInterval(ramTimer);
await sampleRam();
const r = await page.evaluate(() => ({ ...window.d4, status: document.getElementById('status').textContent }));
const log = r.log; delete r.log;
r.ramSamples=ramSamples;
r.peakProcessWorkingSetMB=Math.max(0,...ramSamples.map(s=>(s.sumWorkingSetBytes||0)/1048576));
r.ramMeasurement="Sum of working sets for this browser CDP process tree; shared pages may be counted twice. Not wasm reserved memory.";
r.xma=xma; r.audio = audio; r.gpu = gpu; r.label = label; r.seconds = seconds; r.browser = browser.version(); r.pageErrors = pageErrors;
r.timedOut = r.exit === null; r.waitSeconds = (Date.now() - t0) / 1000;
r.vdAll = ['VdSetGraphicsInterruptCallback', 'VdInitializeRingBuffer', 'VdEnableRingBufferRPtrWriteBack'].every((v) => r.vd[v]);
fs.writeFileSync(path.join(out, `${label}.log`), log.join('\n'));
fs.writeFileSync(path.join(out, `${label}.json`), JSON.stringify(r, null, 2));
await page.screenshot({ path: path.join(out, `${label}.png`), fullPage: false });
await browser.close();
console.log(JSON.stringify({ exit: r.exit, vdAll: r.vdAll, vd: r.vd, marks: r.marks, peakMemMB: Math.round(r.peakMemBytes / 1048576), wall: r.wallSeconds, errors: pageErrors.length, timedOut: r.timedOut }, null, 1));
