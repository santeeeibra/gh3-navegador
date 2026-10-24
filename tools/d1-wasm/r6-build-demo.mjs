// R6 (Claude): demo LOCAL imagen + sonido. Junta COPIAS de: mi build (artifacts/d1-wasm/r6/web, con
// WaitMultiple por evento y cola de audio) + consumidor en vivo de Codex (artifacts/r5-live). No modifica
// archivos de Codex. Salida: artifacts/d1-wasm/r6/demo. NO publicar: contiene código y shaders del juego.
// Servir: D4_ROOT=artifacts/d1-wasm/r6/demo node tools/d1-wasm/serve-d4.mjs 5393
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
// Song builds may choose a smaller queue; other demos retain their original buffer.
const bufferMs = Number(process.env.R6_AUDIO_BUFFER_MS || 200);
if (!Number.isFinite(bufferMs) || bufferMs < 40 || bufferMs > 200) throw Error('R6_AUDIO_BUFFER_MS must be 40..200');
const bufferFrames = Math.round(bufferMs * 48), recoverFrames = Math.round(Math.max(40, bufferMs * .75) * 48);
const web = resolve(root, process.env.R6_WEB || 'artifacts/d1-wasm/r6/web'), live = resolve(root, 'artifacts/r5-live'), out = resolve(root, process.env.R6_DEMO_OUT || 'artifacts/d1-wasm/r6/demo');
await mkdir(out, { recursive: true });
await copyFile(resolve(web, 'gh3-web.wasm'), resolve(out, 'gh3-web.wasm'));
await copyFile(resolve(live, 'r5snap-codex.js'), resolve(out, 'r5snap-codex.js'));
await copyFile(resolve(root, 'tools/d1-wasm/gh3-input.js'), resolve(out, 'gh3-input.js'));  // C1: controles

// Mismos manejadores que tools/r5-runtime/build-live.mjs (Codex), sobre mi gh3-web.js.
let js = await readFile(resolve(web, 'gh3-web.js'), 'utf8');
const anchor = 'Module["r3cFrame"] =';
const i = js.indexOf(anchor); if (i < 0) throw Error('falta el ancla del runtime');
js = js.slice(0, i) + `Module['r5LiveReport'] = data => self.postMessage({type:'r5LiveReport',data});
Module['r5LiveFrame'] = (bitmap,info) => self.postMessage({type:'r5LiveFrame',bitmap,info},[bitmap]);
` + js.slice(i);
await writeFile(resolve(out, 'gh3-web.js'), js);

let html = await readFile(resolve(live, 'index.html'), 'utf8');
const swap = (a, b) => { if (!html.includes(a)) throw Error('falta en index.html: ' + a.slice(0, 60)); html = html.replace(a, b); };
swap("['r3ayield', 'r3acheck', 'cpasync'", "['waitmulti', 'audiotap', 'padtype', 'r3ayield', 'r3acheck', 'cpasync'");
swap("} else if (m.type === 'mem') {", `} else if (m.type === 'r6AudioRing') {
      window.r6StartAudio(m.sab, m.ptr);
    } else if (m.type === 'g1eInput') {
      window.gh3Input.attach(m.sab, m.ptr);  // C1: teclado y mando -> mando del juego
    } else if (m.type === 'mem') {`);
// AudioWorklet: lee la cola {write, capacity, data[capacity*2]} que llena el hilo de audio del juego.
// Colchón configurable. El perfil de canción limita también la demora acumulada.
const worklet = `class R6 extends AudioWorkletProcessor {
  constructor(o) { super(); const { sab, ptr } = o.processorOptions;
    this.w = new Uint32Array(sab, ptr, 1); this.cap = new Uint32Array(sab, ptr + 4, 1)[0];
    this.d = new Float32Array(sab, ptr + 8, this.cap * 2); this.r = -1; this.wait = true;
    this.st = { played: 0, underruns: 0, silentBlocks: 0, skips: 0 };
    this.port.onmessage = (e) => {
      if (e.data?.type === 'reset') { this.r = -1; this.wait = true; }
      const w = Atomics.load(this.w, 0); if (this.w0 === undefined) this.w0 = w;
      this.port.postMessage({ ...this.st, written: (w - this.w0) >>> 0, wNow: w, lag: this.r < 0 ? 0 : (w - this.r) >>> 0 }); }; }
  process(_, outs) { const L = outs[0][0], R = outs[0][1] || L, n = L.length, w = Atomics.load(this.w, 0);
    if (this.r < 0) { if (w < ${bufferFrames}) return true; this.r = (w - ${bufferFrames}) >>> 0; this.wait = false; }
    let lag = (w - this.r) >>> 0;
    if (lag > ${bufferMs < 200 ? bufferFrames + 4800 : 'this.cap - 2048'}) { this.r = (w - ${bufferFrames}) >>> 0; lag = ${bufferFrames}; this.st.skips++; }
    if (this.wait) { if (lag < ${recoverFrames}) { this.st.silentBlocks++; return true; } this.wait = false; }
    if (lag < n) { this.wait = true; this.st.underruns++; this.st.silentBlocks++; return true; }
    for (let i = 0; i < n; i++) { const s = ((this.r + i) % this.cap) * 2; L[i] = this.d[s]; R[i] = this.d[s + 1]; }
    this.r = (this.r + n) >>> 0; this.st.played += n; return true; } }
registerProcessor('r6-gh3', R6);`;
// Abrir la dirección sola (sin parámetros) carga la configuración de la demo: menos errores al copiar.
swap('<head>', `<head><script>if (!location.search.includes('r5consumer=')) location.replace('/?' + new URLSearchParams({ cpasync: '1', cpwait: 'event', r3acheck: '1', r5snap: '1', r5consumer: 'r5snap-codex.js', audio: 'silent', xma: 'decode', waitmulti: 'event', audiotap: '1' }));</script>`);
swap('</body>', `<p id="c1Input" class="card">Controles: cargando…</p>
<script src="gh3-input.js"></script>
<p id="r6Audio" class="card">Audio: tocá Iniciar para habilitar el sonido.</p>
<button id="r6ResetAudio" disabled>Reacomodar sonido</button>
<script>
// Valores de la demo: GPU nula y 300 s (se pueden cambiar a mano).
try { document.getElementById('secs').value = '300'; document.getElementById('gpu').value = 'null'; } catch {}
// R6: el AudioContext necesita un clic del usuario (el botón Iniciar).
document.addEventListener('click', () => {
  if (window.r6ctx) return;
  window.r6ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
  window.r6ready = window.r6ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([${JSON.stringify(worklet)}], { type: 'text/javascript' })));
}, { capture: true });
window.r6StartAudio = async (sab, ptr) => {
  const el = document.getElementById('r6Audio');
  if (!window.r6ctx) { el.textContent = 'Audio: sin clic previo, no se puede reproducir.'; return; }
  await window.r6ready; await window.r6ctx.resume();
  const node = new AudioWorkletNode(window.r6ctx, 'r6-gh3', { outputChannelCount: [2], processorOptions: { sab, ptr } });
  window.r6node = node;
  node.connect(window.r6ctx.destination);
  let previous = null;
  node.port.onmessage = (e) => {
    const now = performance.now(), rate = previous ? (((e.data.wNow - previous.w) >>> 0) / ((now - previous.at) * 48)) : null;
    previous = { w: e.data.wNow, at: now };
    window.d4.r6Audio = { ...e.data, productionRatio: rate, ctxState: window.r6ctx.state, sampleRate: window.r6ctx.sampleRate, baseLatency: window.r6ctx.baseLatency, outputLatency: window.r6ctx.outputLatency };
    el.textContent = 'Audio GH3: ' + (e.data.played / 48000).toFixed(1) + ' s reproducidos · cortes ' + e.data.underruns + ' · colchón ' + (e.data.lag / 48).toFixed(0) + ' ms' + (rate === null ? '' : ' · ritmo de audio ' + (rate * 100).toFixed(0) + '%'); };
  setInterval(() => node.port.postMessage(0), 500);
  const reset = document.getElementById('r6ResetAudio'); reset.disabled = false;
  reset.onclick = async () => { await window.r6ctx.resume(); node.port.postMessage({ type: 'reset' }); };
};
</script>
</body>`);
await writeFile(resolve(out, 'index.html'), html);
console.log('Demo local lista en artifacts/d1-wasm/r6/demo (no publicar).');
