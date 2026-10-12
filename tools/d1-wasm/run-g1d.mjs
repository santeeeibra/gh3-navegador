// Paso D3: corre gh3-headless.wasm en Node con la carpeta del juego (solo lectura) y un watchdog.
// Uso: node tools/d1-wasm/run-d3.mjs [segundos de juego] [etiqueta] [none|null] [silent|nop]
// Salida: artifacts/d1-wasm/d3/<etiqueta>.log y <etiqueta>.json (tiempos, RAM máxima, código de salida).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seconds = Number(process.argv[2] || 20);
const label = process.argv[3] || 'run';
const gpu = process.argv[4] || 'none';
const audio = process.argv[5] || 'silent';
const xma=process.argv[6] || 'decode';
if(!['decode','silent-consume'].includes(xma)) throw new Error('XMA: decode o silent-consume');
if (!['silent','nop'].includes(audio)) throw new Error('Audio: silent o nop');
if (!['none','null'].includes(gpu)) throw new Error('GPU: none o null');
const game = 'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock';
const outDir = path.join(root, 'artifacts/d1-wasm/d3');
const data = path.join(outDir, 'data').replaceAll('\\', '/');
const js = path.join(root, 'artifacts/d1-wasm/d2/gh3-headless.js');
fs.mkdirSync(outDir, { recursive: true });

const log = fs.createWriteStream(path.join(outDir, `${label}.log`));
const t0 = Date.now();
fs.mkdirSync(data, { recursive: true });
const child = spawn(process.execPath, [...(process.env.G1D_CPU_PROFILE?['--cpu-prof','--cpu-prof-interval=10000','--cpu-prof-dir='+process.env.G1D_CPU_PROFILE]:[]),js, '/game', '/data', String(seconds), process.env.REX_LOG_LEVEL || 'info', gpu, audio, xma, ...(process.env.G1E_PRESS ? [process.env.G1E_PRESS] : [])], {
  cwd: outDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH3_GAME: game, GH3_DATA: data, REX_LOG_LEVEL: process.env.REX_LOG_LEVEL || 'info' },
});
let peakRss = 0; const ramSamples=[];
const poll = setInterval(() => {
  // RAM del proceso hijo (Windows): tasklist en KB.
  const ps = spawn('tasklist', ['/FI', `PID eq ${child.pid}`, '/FO', 'CSV', '/NH']);
  let out = '';
  ps.stdout.on('data', (d) => (out += d));
  ps.on('close', () => {
    const m = out.match(/"([\d.,]+) KB"/);
    if (m) {const rssBytes=Number(m[1].replace(/[.,]/g, ''))*1024;peakRss=Math.max(peakRss,rssBytes);ramSamples.push({t:(Date.now()-t0)/1000,rssBytes});}
  });
}, 1000);
child.stdout.on('data', (d) => log.write(d));
child.stderr.on('data', (d) => log.write(d));
const watchdogMs = (seconds + 90) * 1000;
const watchdog = setTimeout(() => { log.write(`\n[run-d3] WATCHDOG: matado a los ${watchdogMs / 1000} s\n`); child.kill('SIGKILL'); }, watchdogMs);
child.on('exit', (code, signal) => {
  clearInterval(poll); clearTimeout(watchdog);
  const result = { label, seconds, gpu, audio, xma, press: process.env.G1E_PRESS || null, exitCode: code, signal, wallSeconds: (Date.now() - t0) / 1000, peakRssMB: Math.round(peakRss / 1048576), ramSamples };
  log.end(() => {
    fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({...result,ramSamples:ramSamples.length}));
  });
});
