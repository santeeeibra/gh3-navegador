// autopista60 (Claude, 2026-10-14): prueba SIN juego del reloj de la capa (Edge headless, tiempo controlado).
// Usa un cuadro real de Slow Ride (artifacts/hw60/offline/messages.json, el de la prueba de Codex) y simula el audio:
// AudioContext (getOutputTimestamp con 40 ms de salida), telemetría del worklet (campos 16–21) y contador de escritura
// del anillo 200 ms adelante de lo que suena. Comprueba: (1) tiempo dibujado = tiempo de canción de la muestra que suena
// (|dif| < 1 ms), (2) ~60 dibujos/s con rAF a 60/100/120 Hz, (3) audio cortado → capa quieta, (4) juego congelado →
// sin saltos atrás ni adelantarse al cuadro, (5) reinicio de canción → vuelve a seguir, (6) apagado → sin dibujo.
// No toca el turno de pruebas del juego (no arranca GH3). Uso: node tools/autopista60/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const out = path.resolve('artifacts/d1-wasm/autopista60/offline'); fs.mkdirSync(out, { recursive: true });
const html = `<!doctype html><style>body{margin:0}#r5Canvas{width:1280px;height:720px;display:block}</style><canvas id="r5Canvas" width="1280" height="720"></canvas>
<script>
window.testNow=1000;performance.now=()=>window.testNow;
let raf;window.requestAnimationFrame=fn=>(raf=fn,1);window.step=()=>raf(testNow);
window.BroadcastChannel=class{constructor(){window.tapChannel=this;this.sent=[];}postMessage(m){this.sent.push(m);}};
// Audio simulado: cuadro del AudioContext = 48 por ms desde testNow=1000 (+5 s); sale por el parlante 40 ms después.
const SR=48000, OUT=0.04; window.audio={on:true,r0:1000000,lagW:9600,rate:1};
const ct=p=>(p-1000)/1000+5;
window.r6ctx={state:'running',baseLatency:0.01,outputLatency:0.03,get currentTime(){return Math.floor(ct(testNow)*SR/128)*128/SR;},getOutputTimestamp(){return {contextTime:ct(testNow)-OUT,performanceTime:testNow};}};
window.r6tel=new SharedArrayBuffer(128);const T32=new Int32Array(r6tel);
// Muestra del anillo que empieza a sonar en el cuadro F (mientras suena; si se corta, se detiene en audio.stopR).
window.sampleAt=F=>audio.r0+(F-5*SR)*audio.rate;
window.block=()=>{const F=Math.floor(ct(testNow)*SR/128)*128;Atomics.add(T32,16,1);if(audio.on){const r=sampleAt(F);Atomics.store(T32,17,Math.floor(r)|0);Atomics.store(T32,18,Math.round((r-Math.floor(r))*1e6));Atomics.store(T32,20,1e6);Atomics.store(T32,21,1);}else Atomics.store(T32,21,0);Atomics.store(T32,19,F|0);Atomics.add(T32,16,1);};
// Lo que se oye en p: muestra que empezó a sonar en el cuadro ct(p)-OUT.
window.heardSample=p=>sampleAt((ct(p)-OUT)*SR);
window.writtenAt=p=>heardSample(p)+audio.lagW; // el juego escribió 200 ms más adelante
window.T0=null;window.songAtSample=s=>T0+(s-writtenAt(1000))/48; // ms de canción de cada muestra
window.load=async()=>{const dec=(k,v)=>v&&v.$t?new globalThis[v.$t](Uint8Array.from(atob(v.b64),c=>c.charCodeAt(0)).buffer):v;
 window.messages=JSON.parse(await(await fetch('/messages.json')).text(),dec);const im=new Image();im.src='/game.png';await im.decode();r5Canvas.getContext('2d').drawImage(im,0,0);
 window.base=messages.at(-1);window.board=base.draws.find(d=>d.vs==='80708BD1B82638B0');T0=board.vk[7]*1000;
 for(const m of messages.slice(0,-1))tapChannel.onmessage({data:{...m,w:writtenAt(testNow)>>>0}});};
// Un cuadro del juego capturado en testNow con tiempo T y la muestra escrita en ese instante.
window.frame=(T,w)=>{const m=structuredClone(base);m.draws.find(d=>d.vs==='80708BD1B82638B0').vk[7]=T/1000;m.at=performance.timeOrigin+testNow;m.w=(w??writtenAt(testNow))>>>0;m.textures=[];tapChannel.onmessage({data:m});tapChannel.onmessage({data:{type:'frame',draws:[],textures:[],at:m.at,w:m.w}});}; // + un cuadro sin pista (como en vivo)
// Corre ms milisegundos: rAF a hz, bloque de audio cada 128 muestras, cuadro del juego cada gameMs con reloj gameT(p).
window.run=(ms,{hz=60,gameMs=40,gameT=p=>songAtSample(writtenAt(p)),capt=0}={})=>{const end=testNow+ms;let nextRaf=testNow,nextBlk=testNow,nextGame=testNow;const errs=[];let shown0=hw60.shown,back=0,last=null;
 while(testNow<end){const t=Math.min(nextRaf,nextBlk,nextGame);testNow=t;
  if(t===nextBlk){block();nextBlk+=128/48;}
  if(t===nextGame){frame(gameT(t-capt),writtenAt(t));nextGame+=gameMs;}
  if(t===nextRaf){const s=hw60.shown;step();if(hw60.shown!==s){const want=songAtSample(heardSample(t));errs.push(hw60.visualTimeMs-want);if(last!==null&&hw60.visualTimeMs<last-1e-6)back++;last=hw60.visualTimeMs;}nextRaf+=1000/hz;}}
 const a=errs.map(Math.abs).sort((x,y)=>x-y);return {shown:hw60.shown-shown0,n:a.length,p50:a[a.length>>1],p95:a[Math.floor(a.length*0.95)],max:a.at(-1),back,lastVisual:last,mean:errs.reduce((x,y)=>x+y,0)/errs.length};};
</script><script src="/source.js"></script>`;
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://x').pathname;
  const files = { '/messages.json': 'artifacts/hw60/offline/messages.json', '/game.png': 'artifacts/hw60/offline/game.png', '/source.js': 'tools/autopista60/autopista60.js' };
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin'); res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.png') ? 'image/png' : name.endsWith('.json') ? 'application/json' : 'text/html');
  if (name === '/') res.end(html); else if (files[name]) res.end(fs.readFileSync(files[name])); else res.writeHead(404).end();
});
const report = { errors: [] }; let browser;
try {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(() => load());
  report.warm = await page.evaluate(() => run(2000));
  // (1)+(2) seguimiento y cadencia a 60/100/120 Hz.
  report.track = {};
  for (const hz of [60, 100, 120]) report.track[hz] = await page.evaluate((hz) => run(1000, { hz }), hz);
  // Captura del cuadro dibujado.
  await page.evaluate(() => run(100));
  await page.screenshot({ path: out + '/capa.png' });
  // Con demora de captura de 15 ms (CP atrasado): el error debe quedar ≈ 15 ms (sesgo conocido, no se oculta).
  report.cpLag15 = await page.evaluate(() => run(2000, { capt: 15 }));
  await page.evaluate(() => run(2000));
  // (3) audio cortado 500 ms: lo que ya estaba en camino al parlante (40 ms + 1 bloque) se sigue oyendo; después, quieta.
  report.cut = await page.evaluate(() => { run(200); const v0 = hw60.visualTimeMs; audio.on = false; run(100); const v100 = hw60.visualTimeMs; const r = run(400); const moved = hw60.visualTimeMs - v0, after100 = hw60.visualTimeMs - v100; audio.on = true; audio.r0 += 0; return { moved, after100, holds: hw60.holds, r }; });
  report.afterCut = await page.evaluate(() => { const r0 = run(300); return run(1000); });
  // (4) juego congelado 1 s (cuadros con el mismo T, el audio sigue escrito): ni atrás ni más allá del cuadro + 30 ms.
  report.freeze = await page.evaluate(() => { run(500); const Tf = songAtSample(writtenAt(testNow)); const r = run(1000, { gameT: () => Tf }); return { r, overFrameMs: hw60.visualTimeMs - Tf, resets: hw60.anchorResets, clampHigh: hw60.clampHigh }; });
  // Después del congelamiento el juego sigue desde Tf (b nuevo): vuelve a seguir el audio.
  report.afterFreeze = await page.evaluate(() => { const shift = 1000; const g = (p) => songAtSample(writtenAt(p)) - shift; run(2000, { gameT: g }); const save = window.songAtSample; window.songAtSample = (s) => save(s) - shift; const r = run(1000); return r; });
  // (5) reinicio: el tiempo del juego vuelve a 0 → reinicia anclas y sigue.
  report.restart = await page.evaluate(() => { const off = T0 + 5000; const save = window.songAtSample; window.songAtSample = (s) => save(s) - off; run(2000); return run(1000); });
  // (6) apagado.
  report.off = await page.evaluate(() => { hw60.setEnabled(false); const s = hw60.shown; run(300); return { shown: hw60.shown - s, display: document.getElementById('hw60Canvas').style.display, announces: tapChannel.sent.filter((m) => m.type === 'overlayReady').length, rings: tapChannel.sent.filter((m) => m.type === 'ring').length }; });
  report.state = await page.evaluate(() => JSON.parse(JSON.stringify(hw60)));
  const T = report.track;
  for (const hz of [60, 100, 120]) { assert.ok(T[hz].shown >= 59 && T[hz].shown <= 61, 'cadencia ' + hz + ': ' + T[hz].shown); assert.ok(T[hz].p95 < 1, 'sincronía ' + hz + ': ' + T[hz].p95); assert.equal(T[hz].back, 0); }
  assert.ok(report.cut.moved < 40 + 128 / 48 + 17 + 1, 'corte: se movió ' + report.cut.moved); assert.ok(Math.abs(report.cut.after100) < 0.01, 'corte: siguió moviéndose ' + report.cut.after100);
  assert.ok(report.afterCut.p95 < 1, 'después del corte: ' + report.afterCut.p95);
  assert.equal(report.freeze.r.back, 0); assert.ok(report.freeze.overFrameMs <= 30.01, 'congelado: ' + report.freeze.overFrameMs);
  assert.ok(report.afterFreeze.p95 < 1, 'después del congelamiento: ' + report.afterFreeze.p95);
  assert.ok(report.restart.p95 < 1, 'reinicio: ' + report.restart.p95);
  assert.equal(report.off.shown, 0); assert.equal(report.off.display, 'none');
  assert.equal(report.errors.length, 0); assert.equal(report.state.errors, 0, report.state.lastError);
  report.ok = true;
} catch (e) { report.ok = false; report.error = e.stack; process.exitCode = 1; } finally {
  await browser?.close(); await new Promise((r) => server.close(r));
  fs.writeFileSync(out + '/verification.json', JSON.stringify(report, null, 2));
  const brief = (r) => r && { shown: r.shown, p50: r.p50 && +r.p50.toFixed(3), p95: r.p95 && +r.p95.toFixed(3), max: r.max && +r.max.toFixed(3), back: r.back };
  console.log(JSON.stringify({ ok: report.ok, error: report.error?.split('\n')[0], track: Object.fromEntries(Object.entries(report.track || {}).map(([k, v]) => [k, brief(v)])), cpLag15: brief(report.cpLag15), cut: report.cut && { moved: report.cut.moved, after100: report.cut.after100 }, afterCut: brief(report.afterCut), freeze: report.freeze && { back: report.freeze.r.back, overFrameMs: report.freeze.overFrameMs }, afterFreeze: brief(report.afterFreeze), restart: brief(report.restart), off: report.off, pageErrors: report.errors.length }));
}
