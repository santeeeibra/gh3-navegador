// Copia del worklet de audio ANTES del gobernador (web/gh3-native60/index.html, commit 1698fbe). Referencia para
// tests/movil-audio-worklet.test.mjs: el worklet nuevo debe sonar idéntico sin ?audiorate.
class R6 extends AudioWorkletProcessor {
  constructor(o) { super(); const { sab, ptr } = o.processorOptions;
    this.w = new Uint32Array(sab, ptr, 1); this.cap = new Uint32Array(sab, ptr + 4, 1)[0];
    this.d = new Float32Array(sab, ptr + 8, this.cap * 2); this.r = -1; this.wait = true; this.target = 9600;
    this.st = { played: 0, underruns: 0, silentBlocks: 0, skips: 0 };
    this.port.onmessage = (e) => {
      if (e.data?.type === 'reset') { this.r = -1; this.wait = true; }
      if (e.data?.type === 'target') { this.target = Math.max(1440, Math.min(19200, e.data.samples | 0)); return; }
      const w = Atomics.load(this.w, 0); if (this.w0 === undefined) this.w0 = w;
      this.port.postMessage({ ...this.st, written: (w - this.w0) >>> 0, wNow: w, lag: this.r < 0 ? 0 : (w - this.r) >>> 0 }); }; }
  // Claude 2026-10-12: ritmo adaptable (0,96–1,03, interpolación lineal): si el juego produce algo más lento que el tiempo real (celular), el sonido acompaña en vez de vaciar el colchón y cortarse.
  process(_, outs) { const L = outs[0][0], R = outs[0][1] || L, n = L.length, w = Atomics.load(this.w, 0), cap = this.cap, d = this.d;
    if (this.r < 0) { if (w < this.target) return true; this.r = (w - this.target) >>> 0; this.f = 0; this.avg = this.target; this.wait = false; }
    let lag = (w - this.r) >>> 0;
    if (lag > cap - 2048 || (!this.wait && lag > this.target * 2 + 4800)) { this.r = (w - this.target) >>> 0; this.f = 0; lag = this.avg = this.target; this.st.skips++; }
    if (this.wait) { if (lag < (this.target >> 1)) { this.st.silentBlocks++; return true; } this.wait = false; this.avg = lag; }
    this.avg += (lag - this.avg) * 0.002;
    const rate = Math.max(0.96, Math.min(1.03, 1 + (this.avg - this.target) / this.target * 0.04));
    if (lag < n * rate + 2) { this.wait = true; this.st.underruns++; this.st.silentBlocks++; return true; }
    let r = this.r, f = this.f;
    for (let i = 0; i < n; i++) { const s0 = (r % cap) * 2, s1 = ((r + 1) % cap) * 2; L[i] = d[s0] + (d[s1] - d[s0]) * f; R[i] = d[s0 + 1] + (d[s1 + 1] - d[s0 + 1]) * f; f += rate; const k = f | 0; r = (r + k) >>> 0; f -= k; }
    this.r = r; this.f = f; this.st.played += n; this.st.rate = rate; return true; } }
registerProcessor('r6-gh3', R6);
