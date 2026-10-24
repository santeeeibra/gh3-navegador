// Claude 2026-10-16 (paso 4, memoria iPhone): mide la memoria del juego SIN Playwright.
// Playwright prende el inspector de red de Edge, que guarda en base64 todo lo descargado (~190 MB de más en el proceso del juego).
// Acá Edge se lanza a mano y se maneja sólo con Runtime.evaluate por CDP (sin Network.enable): lo más parecido a un usuario real.
// Uso: node tools/accesos/mem-sin-playwright.mjs [root] [--muestreo] [--salida archivo.json] [--query "&a=b"]
// --muestreo: perfil de memoria nativa (Memory.startSampling) para ver quién reserva cada MB (traducir con simbolizar.ps1).
import fs from 'node:fs';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {createDemandServer} from '../local-loader/demand-server.mjs';
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const root = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : 'artifacts/d1-wasm/xmalazy-pub/demo');
const PORT = 5491, CDP = 9336, PERFIL = path.resolve('artifacts/d1-wasm/perfil-pruebas/medir'), TURN = 'artifacts/PRUEBAS-EN-CURSO.md';
const nap = ms => new Promise(r => setTimeout(r, ms)), T0 = Date.now(), t = () => Math.round((Date.now() - T0) / 1000);
if (!fs.readFileSync(TURN, 'utf8').includes('Estado: LIBRE')) { console.log('Turno ocupado'); process.exit(1); }
const token = 'claude-mem-' + process.pid;
fs.writeFileSync(TURN, `# Turno de pruebas del juego (uno por vez)\nEstado: OCUPADO\nQuién: Claude (memoria sin Playwright)\nReserva: ${token}\nDesde: ${new Date().toISOString()}\nFin: estimado 3 min\n`);
const staticNames = fs.readdirSync(root).filter(n => fs.statSync(path.join(root, n)).isFile());
const server = createDemandServer({root, staticNames, latencyMs: 0, bandwidthKBps: 0, onChunk: () => {}});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--user-data-dir=' + PERFIL, '--remote-debugging-port=' + CDP, '--no-first-run', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--window-size=1600,900', 'about:blank'], {stdio: 'ignore'});
const res = {root, muestras: []};
let ws, id = 0; const wait = new Map();
const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({id: n, method, params, sessionId})); setTimeout(() => { if (wait.has(n)) { wait.delete(n); r({timeout: true}); } }, 30000); });
const reg = etiqueta => { const ps = JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/accesos/mem-procesos.ps1', 'perfil-pruebas?medir']))); const r = (Array.isArray(ps) ? ps : [ps]).filter(p => p.tipo === 'renderer').sort((a, b) => b.privadaMB - a.privadaMB)[0];
  const m = JSON.parse(String(execFileSync('powershell', ['-NoProfile', '-File', 'tools/accesos/mem-regiones.ps1', String(r.pid)])));
  const s = {s: t(), etiqueta, privadaMB: r.privadaMB, wasm: m.clases.wasm?.residentePrivadaMB, codigo: m.clases.codigo?.residentePrivadaMB, mayores: m.privadaMayores.slice(0, 4).map(x => x[1])}; res.muestras.push(s); console.log(JSON.stringify(s)); return s; };
try {
  let v; for (let k = 0; k < 100 && !v; k++) { try { v = await (await fetch(`http://127.0.0.1:${CDP}/json/version`)).json(); } catch { await nap(200); } }
  ws = new WebSocket(v.webSocketDebuggerUrl); await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const {result} = await send('Target.getTargets'); const tg = result.targetInfos.find(x => x.type === 'page');
  const s = (await send('Target.attachToTarget', {targetId: tg.targetId, flatten: true})).result.sessionId;
  const ev = async expr => (await send('Runtime.evaluate', {expression: expr, awaitPromise: true, returnByValue: true}, s)).result?.result?.value;
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `(${fs.readFileSync('tools/accesos/robot.mjs', 'utf8').match(/export function initMemoria\(\) (\{[\s\S]*?\n\})/)[1].replace(/^/, '() => ')})()`}, s);
  // Junta las líneas «PILA ...» (build de diagnóstico tools/accesos/pila_hilos.c) y el último informe del dibujo.
  await send('Page.addScriptToEvaluateOnNewDocument', {source: `(()=>{window.__pila=[];const W=window.Worker;window.Worker=function(...a){const w=new W(...a);w.addEventListener('message',e=>{const t=e.data&&e.data.text;if(typeof t==='string'&&t.startsWith('PILA'))window.__pila.push(t);if(e.data&&e.data.type==='r5SongReport')window.__r5rep=e.data.data});return w};window.Worker.prototype=W.prototype})()`}, s);
  await send('Page.enable', {}, s); await send('Page.bringToFront', {}, s); await send('Emulation.setFocusEmulationEnabled', {enabled: true}, s);
  await send('Page.navigate', {url: `http://127.0.0.1:${PORT}/gh3/?manual=1&diag=1${opt('query', '')}`}, s);
  if (opt('muestreo', false)) await send('Memory.startSampling', {samplingInterval: 65536}, s);
  for (let k = 0; !(await ev(`(()=>{const b=document.getElementById('loaderPlay');return !!b&&!b.disabled})()`)); k++) { if (k > 300) throw Error('Jugar no se habilitó'); await nap(200); }
  reg('portada');
  // Clic real (activación de usuario: sin ella el AudioContext no arranca y el cargador queda esperando).
  const [cx, cy] = await ev(`(()=>{const b=document.getElementById('loaderPlay');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', {type, x: cx, y: cy, button: 'left', clickCount: 1}, s);
  for (let k = 0; !(await ev(`!!window.g1live`)); k++) { if (k === 25) console.log('raf', await ev('new Promise(r=>{requestAnimationFrame(()=>r(1));setTimeout(()=>r(0),2000)})')); if (k > 150) throw Error('El juego no arrancó: ' + JSON.stringify(await ev(`({w:String(window.Worker).slice(0,60),st:document.getElementById('loaderStatus')?.textContent,ready:gh3Loader.ready,stats:gh3Loader.stats,vis:document.visibilityState,sw:!!navigator.serviceWorker?.controller,err:gh3Loader.error,phase:gh3Loader.phase})`))); await nap(200); }
  reg('juego vivo');
  for (let k = 0; !(await ev(`!!window.navSeen?.menu`)); k++) { if (k > 400) throw Error('No llegó al menú'); await ev(`gh3Input.tap('${k % 2 ? 'a' : 'start'}')`); await nap(350); }
  await nap(4000); reg('menú');
  await nap(10000); reg('menú +10 s');
  // --cancion: Partida rápida > Slow Ride (primer tema) y mide con la canción andando 15 s (sin robot).
  if (opt('cancion', false)) {
    for (const k of ['down', 'down', 'a']) { await ev(`gh3Input.tap('${k}')`); await nap(1800); }
    for (let k = 0; k < 6 && !(await ev('window.songPak||null')); k++) { await ev(`gh3Input.tap('a')`); await nap(2500); }
    await nap(20000); reg('canción elegida +20 s (etapa ' + await ev('window.gh3Diag?.stage||null') + ')');
    { const sc = await send('Page.captureScreenshot', {format: 'png'}, s); if (sc.result) fs.writeFileSync(process.env.TEMP + '/claude/cancion.png', Buffer.from(sc.result.data, 'base64')); }
    await nap(15000); reg('canción elegida +35 s (etapa ' + await ev('window.gh3Diag?.stage||null') + ')');
  }
  if (opt('muestreo', false)) { const p = await send('Memory.getSamplingProfile', {}, s); fs.writeFileSync(opt('salida', 'muestreo.json').replace(/\.json$/, '') + '-muestreo.json', JSON.stringify(p.result)); }
  res.errores = await ev(`(window.gh3Loader?.error)||null`);
  if (opt('pila', false)) { res.pila = await ev('window.__pila'); const v = res.pila.filter(x => / hilos=/.test(x)).pop(); console.log('pila', res.pila.length, v); }
  res.dibujo = await ev(`(()=>{const r=window.__r5rep||{},t=r.temporal||{},g=r.gpu||{};return {liberadas:t.texturesReleased,retiradasGpu:t.textureRetiredGpu,reenvios:t.textureResend,cpuMB:(t.textureCPUBytes||0)/1048576,gpuMB:(g.residentTextureBytes||0)/1048576,fatal:r.fatal||null}})()`); console.log('dibujo', JSON.stringify(res.dibujo));
} catch (e) { res.error = e.message; console.log('ERROR', e.message); }
finally {
  try { await send('Browser.close'); } catch {} await nap(1500); try { edge.kill(); } catch {}
  await new Promise(r => server.close(r));
  if (fs.readFileSync(TURN, 'utf8').includes(token)) fs.writeFileSync(TURN, `# Turno de pruebas del juego (uno por vez)\nEstado: LIBRE\nQuién: Claude (memoria sin Playwright)\nFin: ${new Date().toISOString()}\n`);
  if (opt('salida', false)) fs.writeFileSync(opt('salida'), JSON.stringify(res, null, 1));
  process.exit();
}
