// autopista60 (Claude, 2026-10-14): autopista y notas propias a 60 cuadros/s con el RELOJ DEL AUDIO QUE SUENA.
// Base: capa hw60 (Claude 2026-10-13) revisada por Codex (tools/hw60/codex/hw60.js): sampler, cadencia, filtro sin
// dibujo doble y vuelta al original. Cambia el reloj: antes el tiempo dibujado salía de una recta sobre la hora de
// llegada de los cuadros (~25/s, atrasados); ahora sale del audio:
//   - el lector del hilo CP (autopista60-tap.js) manda con cada cuadro el par (c155.w, muestra escrita en el anillo);
//   - el AudioWorklet publica en cada bloque qué muestra del anillo empieza a sonar y en qué cuadro del AudioContext;
//   - en cada cuadro de pantalla: muestra que sale por el parlante ahora (getOutputTimestamp) → tiempo de canción con
//     el ancla (mediana de los últimos cuadros), suavizado y sin volver atrás. Si el audio se corta, la capa se queda
//     quieta; si el juego se congela, también.
// Juicio y puntaje siguen siendo del GH3 original. ?a60=0 (o ?hw60=0) la apaga y el juego dibuja su autopista.
(() => {
  const Q = new URLSearchParams(location.search);
  let enabled = Q.get('a60') !== '0' && Q.get('hw60') !== '0';
  try { if (Q.get('a60') === null && localStorage.getItem('gh3-a60') === '0') enabled = false; } catch {}
  const BOARD = '80708BD1B82638B0', GEM = '582ABCF5FF619A55', STAR = '19815E13AC0DCC92', NOW = '87D4CAE67E72C501';
  const TAIL = new Set(['10CA3B730086027C', '035C1CB9583C0C7E']), FLAME = new Set(['27643FEB20B8CBBD', 'C6F0B6F9BA5A2B12']);
  const st = window.hw60 = { enabled, frames: 0, shown: 0, rafs: 0, dropped: 0, lastFrameAt: 0, rate: 1, jumpMax: 0, jumpAvg: 0, jumpHist: [0, 0, 0, 0, 0], gapMs: 0, maxExtrapMs: 0, extrapHist: [0, 0, 0, 0, 0], texCount: 0, tap: null, errors: 0, lastError: null, offsetMs: 200, hides: [], hideStart: null }; // adelanto por defecto 200 ms: Santi 2026-10-15 acierta con 200 (con 0 la capa llega tarde al juicio)
  try { const o = Number(localStorage.getItem('gh3-a60-offset')); if (Number.isFinite(o)) st.offsetMs = Math.max(-300, Math.min(300, o)); } catch {}
  // ?a60off=N (ms, + = notas antes): prueba de adelanto de la capa (Claude 2026-10-15); no se guarda.
  if (Q.get('a60off') !== null && Number.isFinite(Number(Q.get('a60off')))) st.offsetMs = Math.max(-300, Math.min(300, Number(Q.get('a60off'))));
  Object.assign(st, { a60: true, anchors: 0, anchorResets: 0, anchorSpreadMs: null, audioOk: false, holds: 0, clampHigh: 0, outOfRange: 0,
    syncHist: [0, 0, 0, 0, 0, 0], syncAbsMax: 0, syncSum: 0, syncN: 0, dtMs: null, latencyMs: null, tsMinusLatMs: null,
    shownGaps: { le17: 0, le20: 0, le25: 0, le34: 0, le50: 0, gt50: 0 } });

  // ---------- texturas (BC1/2/3 → RGBA) ----------
  const c565 = (c, o, k) => { o[k] = ((c >> 11) & 31) * 255 / 31 | 0; o[k + 1] = ((c >> 5) & 63) * 255 / 63 | 0; o[k + 2] = (c & 31) * 255 / 31 | 0; };
  function decode(t) {
    const W = t.width, H = t.height, src = t.data, f = t.format;
    if (f === 'rgba8unorm') { const out = new Uint8Array(W * H * 4); for (let y = 0; y < H; y++) out.set(src.subarray(y * t.bytesPerRow, y * t.bytesPerRow + W * 4), y * W * 4); return out; }
    if (!/^bc[123]/.test(f)) return null;
    const out = new Uint8Array(W * H * 4), bs = f.startsWith('bc1') ? 8 : 16, bw = Math.ceil(W / 4), bh = Math.ceil(H / 4), bpr = t.bytesPerRow || bw * bs, pal = new Uint8Array(16), ap = new Uint8Array(8);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      const o = by * bpr + bx * bs, co = bs === 8 ? o : o + 8, a = src[co] | src[co + 1] << 8, b = src[co + 2] | src[co + 3] << 8;
      c565(a, pal, 0); c565(b, pal, 4); pal[3] = pal[7] = 255;
      const four = bs === 16 || a > b;
      for (let i = 0; i < 3; i++) { pal[8 + i] = four ? (2 * pal[i] + pal[4 + i]) / 3 | 0 : (pal[i] + pal[4 + i]) >> 1; pal[12 + i] = four ? (pal[i] + 2 * pal[4 + i]) / 3 | 0 : 0; }
      pal[11] = 255; pal[15] = four ? 255 : 0;
      const bits = (src[co + 4] | src[co + 5] << 8 | src[co + 6] << 16 | src[co + 7] << 24) >>> 0;
      let alo = 0, ahi = 0;
      if (f.startsWith('bc3')) { const a0 = src[o], a1 = src[o + 1]; ap[0] = a0; ap[1] = a1; if (a0 > a1) for (let i = 1; i < 7; i++) ap[i + 1] = ((7 - i) * a0 + i * a1) / 7 | 0; else { for (let i = 1; i < 5; i++) ap[i + 1] = ((5 - i) * a0 + i * a1) / 5 | 0; ap[6] = 0; ap[7] = 255; } alo = (src[o + 2] | src[o + 3] << 8 | src[o + 4] << 16) >>> 0; ahi = (src[o + 5] | src[o + 6] << 8 | src[o + 7] << 16) >>> 0; }
      for (let p = 0; p < 16; p++) {
        const x = bx * 4 + (p & 3), y = by * 4 + (p >> 2); if (x >= W || y >= H) continue;
        const k = (bits >>> (p * 2)) & 3, d = (y * W + x) * 4;
        out[d] = pal[k * 4]; out[d + 1] = pal[k * 4 + 1]; out[d + 2] = pal[k * 4 + 2]; out[d + 3] = pal[k * 4 + 3];
        if (f.startsWith('bc3')) out[d + 3] = ap[(p < 8 ? alo >>> (p * 3) : ahi >>> ((p - 8) * 3)) & 7];
        else if (f.startsWith('bc2')) out[d + 3] = ((src[o + (p >> 1)] >> ((p & 1) * 4)) & 15) * 17;
      }
    }
    return out;
  }

  // ---------- WebGL2 ----------
  let cv = null, gl = null, prog = null, U = {}, vbo = null, ibo = null, boardBuf = null, boardIdx = null, boardIdxCount = 0;
  const textures = new Map(); // clave -> {tex, w, h}
  function initGL() {
    cv = document.createElement('canvas'); cv.id = 'hw60Canvas';
    cv.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;display:none;z-index:2';
    document.body.appendChild(cv);
    gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) { st.lastError = 'sin WebGL2'; return false; }
    const vs = `#version 300 es
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUV; layout(location=2) in vec4 aCol;
uniform vec2 uFade; uniform vec2 uUVOff;
out vec2 vUV; out vec4 vCol; out float vY;
void main(){ vec2 p = aPos; gl_Position = vec4(p.x/640.0-1.0, 1.0-p.y/360.0, 0.0, 1.0);
  float a = 1.0; if (uFade.x != uFade.y) { float t = clamp((p.y-uFade.y)/(uFade.x-uFade.y), 0.0, 1.0); a = t*t*(3.0-2.0*t); }
  vUV = aUV + uUVOff; vCol = vec4(aCol.rgb, aCol.a*a); vY = p.y; }`;
    const fs = `#version 300 es
precision mediump float;
in vec2 vUV; in vec4 vCol; in float vY;
uniform sampler2D uTex; uniform vec4 uMul; uniform vec4 uAdd; uniform vec2 uClip; uniform float uAddMode;
out vec4 o;
void main(){ if (vY < uClip.x || vY > uClip.y) discard;
  vec4 c = texture(uTex, vUV) * vCol * uMul + uAdd; float a = clamp(c.a, 0.0, 1.0);
  o = vec4(clamp(c.rgb, 0.0, 1.0) * a, uAddMode > 0.5 ? 0.0 : a); }`;
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(x)); return x; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(prog));
    for (const n of ['uFade', 'uUVOff', 'uTex', 'uMul', 'uAdd', 'uClip', 'uAddMode']) U[n] = gl.getUniformLocation(prog, n);
    vbo = gl.createBuffer(); ibo = gl.createBuffer(); boardBuf = gl.createBuffer(); boardIdx = gl.createBuffer();
    gl.useProgram(prog); gl.uniform1i(U.uTex, 0); gl.enable(gl.BLEND);
    return true;
  }
  const WRAP = (m) => m === 0 ? gl.REPEAT : m === 1 ? gl.MIRRORED_REPEAT : gl.CLAMP_TO_EDGE;
  function upload(t) {
    const rgba = decode(t); if (!rgba) return;
    let e = textures.get(t.key); if (!e) { e = { tex: gl.createTexture() }; textures.set(t.key, e); st.texCount = textures.size; }
    e.w = t.width; e.h = t.height;
    gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, t.width, t.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    st.textureBytes = [...textures.values()].reduce((sum,t) => sum+t.w*t.h*4*4/3, 0);
  }

  // ---------- geometría de la pista: tabla y → v (profundidad en unidades de textura) y ancho ----------
  let tab = null; // {y:Float64Array, v:Float64Array, w:Float64Array}
  function buildTable(verts) {
    const rows = new Map();
    for (let i = 0; i < verts.length; i += 4) { const y = Math.round(verts[i + 1] * 100) / 100; let r = rows.get(y); if (!r) rows.set(y, r = { v: verts[i + 3], x0: verts[i], x1: verts[i] }); r.x0 = Math.min(r.x0, verts[i]); r.x1 = Math.max(r.x1, verts[i]); }
    const ys = [...rows.keys()].sort((a, b) => a - b); if (ys.length < 4) return null;
    return { y: Float64Array.from(ys), v: Float64Array.from(ys, (y) => rows.get(y).v), w: Float64Array.from(ys, (y) => rows.get(y).x1 - rows.get(y).x0) };
  }
  const interp = (xs, ys, x) => { const n = xs.length; let i = 1; if (x <= xs[0]) i = 1; else if (x >= xs[n - 1]) i = n - 1; else { let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (xs[m] <= x) lo = m; else hi = m; } i = hi; } const x0 = xs[i - 1], x1 = xs[i]; return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - x0) / (x1 - x0 || 1); };
  const vOfY = (y) => interp(tab.y, tab.v, y), yOfV = (v) => interp(tab.v, tab.y, v), wOfY = (y) => interp(tab.y, tab.w, y);

  // ---------- reloj del audio que suena ----------
  // Telemetría del AudioWorklet (window.r6tel, Int32): [16] secuencia (impar = escribiendo) [17] muestra del anillo con
  // la que empieza el bloque [18] fracción ×1e6 [19] cuadro del AudioContext del bloque [20] ritmo ×1e6 [21] sonando.
  const S = () => window.gh3Song, SR = 48000;
  let tel = null, good = null; // good: último bloque que sonó {r, frame, rate}
  function readTel() {
    const sab = window.r6tel; if (!sab || sab.byteLength < 96) return null;
    if (!tel || tel.buffer !== sab) tel = new Int32Array(sab);
    for (let k = 0; k < 4; k++) {
      const a = Atomics.load(tel, 16); if (a & 1) continue;
      const r = Atomics.load(tel, 17) >>> 0, f = Atomics.load(tel, 18), fr = Atomics.load(tel, 19), rate = Atomics.load(tel, 20), on = Atomics.load(tel, 21);
      if (Atomics.load(tel, 16) !== a) continue;
      if (on && a) good = { r, f: f / 1e6, frame: fr, rate: rate / 1e6 };
      return good;
    }
    return good;
  }
  // Cuadro del AudioContext que está saliendo por el parlante en el instante p (performance.now).
  function heardFrame(p) {
    const ctx = window.r6ctx; if (!ctx || ctx.state !== 'running') return null;
    const lat = (ctx.baseLatency || 0) + (ctx.outputLatency || 0), byLat = (ctx.currentTime - lat) * SR;
    st.latencyMs = lat * 1000;
    let ts = null; try { ts = ctx.getOutputTimestamp?.(); } catch {}
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0) {
      const f = (ts.contextTime + (p - ts.performanceTime) / 1000) * SR;
      st.tsMinusLatMs = (f - byLat) / 48; st.clockSource = 'outputTimestamp';
      return f;
    }
    st.clockSource = 'currentTime-latency';
    return byLat;
  }
  // Muestra del anillo que suena en p, relativa a una base (enteros de 32 bits con vuelta). null = sin audio.
  let W0 = null;
  const rel = (x) => ((x - W0) | 0);
  function heardSample(p) {
    const g = readTel(), F = heardFrame(p); if (!g || F === null) return null;
    if (W0 === null) W0 = g.r;
    const df = F - g.frame; // normalmente negativo: el bloque recién armado sale por el parlante más tarde
    return rel(g.r) + g.f + Math.min(df, 128) * g.rate; // si el audio se cortó, no pasa del final del último bloque que sonó
  }
  // Ancla: b = T − muestra/48 (ms) de cada cuadro con pista; media recortada de los últimos 3 s. Saltos reales (pausa,
  // reinicio, salto del audio) se detectan con 3 cuadros seguidos lejos de la mediana o tiempo hacia atrás.
  const anc = { pts: [], med: null, out: 0, lastT: null };
  function addAnchor(T, w, at) {
    if (w === null || w === undefined) return;
    if (W0 === null) W0 = w >>> 0;
    const b = T - rel(w >>> 0) / 48;
    if (anc.lastT !== null && T < anc.lastT - 50) { anc.pts = []; anc.out = 0; st.anchorResets++; resetVisual(); }
    anc.lastT = T;
    if (anc.med !== null && Math.abs(b - anc.med) > 80) { if (++anc.out < 3) return; anc.pts = anc.pts.slice(-2); st.anchorResets++; }
    anc.out = 0;
    anc.pts.push({ b, at }); while (anc.pts.length > 3 && at - anc.pts[0].at > 3000) anc.pts.shift();
    // Media del 50 % central de los últimos 3 s: la muestra escrita se lee en tandas y con demora variable del CP
    // (dispersión típica ~10 ms por cuadro); la media recortada queda estable a ~1 ms.
    const v = anc.pts.map((p) => p.b).sort((x, y) => x - y), lo = v.length >> 2, hi = Math.max(lo + 1, v.length - lo);
    let sum = 0; for (let i = lo; i < hi; i++) sum += v[i];
    const m = sum / (hi - lo); anc.med = m; st.anchors++;
    const dev = v.map((x) => Math.abs(x - m)).sort((x, y) => x - y); st.anchorSpreadMs = dev[dev.length >> 1];
  }
  // Tiempo dibujado: b mostrado se acerca a la mediana a ≤ 1 ms por cuadro (salto si difiere > 60 ms) y nunca vuelve
  // atrás salvo reinicio de la canción. Tope: no adelantarse al cuadro más nuevo del juego (+30 ms).
  const vis = { b: null, last: null };
  function resetVisual() { vis.b = null; vis.last = null; }
  function visualTime(p, newestT) {
    const s = heardSample(p); st.audioOk = s !== null && anc.med !== null;
    if (!st.audioOk) return null;
    const target = anc.med + s / 48;
    if (vis.b === null || Math.abs(anc.med - vis.b) > 60) vis.b = anc.med;
    else vis.b += Math.max(-1, Math.min(1, anc.med - vis.b));
    let T = vis.b + s / 48 + st.offsetMs;
    if (newestT !== null && T > newestT + 30) { T = newestT + 30; st.clampHigh++; }
    if (vis.last !== null && T < vis.last) { T = vis.last; st.holds++; }
    vis.last = T;
    const err = T - st.offsetMs - target; // diferencia entre lo dibujado y el audio que suena (ms)
    if (Math.abs(err) < 1000) { const a = Math.abs(err); st.syncHist[a < 1 ? 0 : a < 2 ? 1 : a < 5 ? 2 : a < 10 ? 3 : a < 20 ? 4 : 5]++; st.syncAbsMax = Math.max(st.syncAbsMax, a); st.syncSum += a; st.syncN++; }
    st.audioTimeMs = target; st.visualTimeMs = T;
    return T;
  }
  setInterval(() => { if (window.r6ringPtr) chan.postMessage({ type: 'ring', ptr: window.r6ringPtr }); }, 500);

  // ---------- cuadros del juego ----------
  let frame = null, boardDraw = null, srcMovedAt = 0, hist = [];
  const chan = new BroadcastChannel('hw60');
  chan.onmessage = (e) => {
    const m = e.data; if (m?.type !== 'frame' || !enabled) return;
    try {
      if (!gl && !initGL()) { enabled = false; return; }
      for (const t of m.textures) upload(t);
      if (m.stats) st.tap = m.stats;
      const now = performance.now(), b = m.draws.find((d) => d.vs === BOARD);
      // Sólo ~25 de cada 60 cuadros del lector traen la pista (el juego renueva la autopista ~25/s): los demás no
      // borran el último cuadro con pista (antes sí, y la capa dibujaba ~22/s). Sin pista por > 400 ms → se apaga.
      if (!b) { st.noBoard = (st.noBoard || 0) + 1; return; }
      if (b.verts) { tab = buildTable(b.verts); boardDraw = b; uploadBoard(b); } else if (boardDraw) { boardDraw = { ...b, verts: boardDraw.verts, colors: boardDraw.colors, idx: boardDraw.idx }; }
      if (!tab) return;
      const T = b.vk[7] * 1000; // c155.w: tiempo de la canción (s) con el que el juego armó este cuadro
      // Hora de captura en el hilo CP (dominio común por timeOrigin); el ancla usa la muestra escrita en ese instante.
      const sourceAt = m.at - performance.timeOrigin;
      const at = Number.isFinite(sourceAt) && Math.abs(now - sourceAt) < 1000 ? sourceAt : now;
      st.deliveryMs = now - at;
      addAnchor(T, m.w, at);
      if (frame) st.gapMs = now - frame.at;
      if (!frame || T !== frame.T) srcMovedAt = now; // pausa / SONG FAILED: el juego sigue dibujando pero su reloj no avanza
      frame = { at: now, sourceAt: at, seq: m.seq, T, speed: -b.vc[16], complete: m.draws.every(d => !d.tex || textures.has(d.tex)), draws: m.draws.map(prep).filter(Boolean) };
      // Historial ~1,5 s de cuadros del juego: se dibuja el que corresponde al audio que suena, no el más nuevo (Claude
      // 2026-10-15: el más nuevo va ~colchón adelantado y el juego ya sacó las notas que pasaron la línea → desaparecían antes de los botones).
      if (hist.length && T < hist[hist.length - 1].T - 50) hist = [];
      hist.push(frame); while (hist.length > 2 && now - hist[0].at > 1500) hist.shift();
      st.frames++; st.lastFrameAt = now;
    } catch (err) { st.errors++; st.lastError = String(err?.message || err); }
  };
  function uploadBoard(b) {
    const n = b.verts.length / 4, data = new Float32Array(n * 5), du = new Uint32Array(data.buffer);
    for (let i = 0; i < n; i++) { data[i * 5] = b.verts[i * 4]; data[i * 5 + 1] = b.verts[i * 4 + 1]; data[i * 5 + 2] = b.verts[i * 4 + 2]; data[i * 5 + 3] = b.verts[i * 4 + 3]; du[i * 5 + 4] = rgbaU(b.colors[i]); }
    gl.bindBuffer(gl.ARRAY_BUFFER, boardBuf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const idx = b.idx ? Uint32Array.from(b.idx) : quadIdx(n);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, boardIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW); boardIdxCount = idx.length;
  }
  // color ARGB del juego → bytes R,G,B,A (entero de 32 bits, se lee como 4 bytes normalizados; no pasa por float)
  const rgbaU = (c) => ((c >>> 24 & 255) << 24 | (c & 255) << 16 | (c >>> 8 & 255) << 8 | (c >>> 16 & 255)) >>> 0;
  const quadIdx = (n) => { const q = new Uint32Array((n >> 2) * 6); for (let k = 0, i = 0; i + 3 < n; i += 4, k += 6) q.set([i, i + 1, i + 2, i, i + 2, i + 3], k); return q; };

  // Cada dibujo del juego → pieza lista para redibujar. kind: 'board' | 'move' (se corre con la pista) | 'tail' | 'static'.
  function prep(d) {
    const base = { tex: d.tex, sampler: d.sampler, blend: d.blend, mul: d.pc.subarray(0, 4), add: null, fade: null, clip: null, uvoff: null, anim: null };
    if (d.vs === BOARD) return { ...base, kind: 'board', add: d.pc.subarray(4, 8), fade: [d.vc[32], d.vc[36]], vk: d.vk, vt: d.vt, c4: d.vc[16] };
    if (!d.verts) return null;
    const n = d.verts.length / 4, idx = d.quad ? null : d.idx ? Uint32Array.from(d.idx) : null;
    if (TAIL.has(d.vs)) {
      // VS de las colas: X = c0.x + onda·px + c0.z·c0.w·py ; Y = py + c0.y. Recorte del PS en Y ∈ [c1.z, c1.w].
      const c = d.vc, k254 = d.vt.subarray(4, 8), k255 = d.vt.subarray(8, 12), pos = new Float32Array(n * 2), glow = d.vs === '035C1CB9583C0C7E';
      for (let i = 0; i < n; i++) {
        const px = d.verts[i * 4], py = d.verts[i * 4 + 1], kk = d.extra[i] * k254[0], a0 = Math.trunc(kk), sub = Math.trunc(k254[2] * (kk - a0));
        const sel = (j) => { const r = 128 + j; return sub === 0 ? c[r * 4] : sub + k255[1] === 0 ? c[r * 4 + 2] : sub + k255[0] === 0 ? c[r * 4 + 3] : c[r * 4 + 1]; };
        const row = (4 + a0) * 4, w = sel(3) * (c[row + 3] ?? 1) + sel(2) * (c[row + 2] ?? 1) + sel(0) * (c[row] ?? 1) + sel(1) * (c[row + 1] ?? 1);
        const wave = (Number.isFinite(w) && row + 3 < c.length ? w : 1) * (glow ? c[6] : 1); // el brillo 035C1CB9 ensancha por c1.z
        pos[i * 2] = c[0] + wave * px + c[2] * py * c[3]; pos[i * 2 + 1] = py + c[1];
      }
      return { ...base, kind: 'tail', n, pos, uv: d.verts, colors: d.colors, idx: idx || quadStrip(n), mul: d.pc.subarray(8, 12), fade: [d.vc[5], d.vc[4]], clip: [d.pc[6], d.pc[7]] };
    }
    const pos = new Float32Array(n * 2); for (let i = 0; i < n; i++) { pos[i * 2] = d.verts[i * 4]; pos[i * 2 + 1] = d.verts[i * 4 + 1]; }
    if (d.vs === GEM) return { ...base, kind: 'move', n, pos, uv: d.verts, colors: d.colors, idx, fade: [d.vc[0], d.vc[4]] };
    if (d.vs === STAR) { const c = d.vc; return { ...base, kind: 'move', n, pos, uv: d.verts, colors: null, idx, fade: [c[16], c[20]], anim: { cols: c[0], rows: c[4], rate: c[8], phase: c[12], t: d.vk[4] } }; }
    if (d.vs === NOW) return { ...base, kind: 'static', n, pos, uv: d.verts, colors: d.colors, idx };
    // Llamaradas/destellos: hoja de cuadros que se reproduce una vez desde c6.x (VS 27643FEB / C6F0B6F9).
    if (FLAME.has(d.vs)) { const c = d.vc; return { ...base, kind: 'static', n, pos, uv: d.verts, colors: null, idx, fade: [c[16], c[20]], anim: { cols: c[0], rows: c[4], rate: c[8], phase: c[12], start: c[24], t: d.vk[4] } }; }
    return null;
  }
  const quadStrip = (n) => { const q = []; for (let i = 0; i + 3 < n; i += 2) q.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); return Uint32Array.from(q); };

  // ---------- dibujo ----------
  const GLF = () => ({ 0: gl.ZERO, 1: gl.ONE, 4: gl.SRC_COLOR, 5: gl.ONE_MINUS_SRC_COLOR, 6: gl.SRC_ALPHA, 7: gl.ONE_MINUS_SRC_ALPHA, 8: gl.DST_COLOR, 9: gl.ONE_MINUS_DST_COLOR, 10: gl.DST_ALPHA, 11: gl.ONE_MINUS_DST_ALPHA });
  let glf = null;
  function setBlend(b) {
    // El sombreador entrega color premultiplicado: alfa normal → (1, 1−a); aditivo (destino ONE) → (1, 1) con alfa 0.
    const dst = b >>> 8 & 31; glf ||= GLF();
    if (dst === 1) { gl.blendFunc(gl.ONE, gl.ONE); return 1; }
    if ((b & 31) === 6 && dst === 7) { gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); return 0; }
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); return 0;
  }
  function bindTex(key, sampler) {
    const e = textures.get(key); if (!e) return false;
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, WRAP(sampler?.clampX ?? 0)); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, WRAP(sampler?.clampY ?? 0));
    return true;
  }
  const attribs = () => {
    const stride = 20;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, stride, 16);
  };
  let scratch = new Float32Array(4096 * 5), scratchU = new Uint32Array(scratch.buffer);
  function drawPiece(p, posFn, uvFn) {
    if (!bindTex(p.tex, p.sampler)) return;
    const n = p.n; if (scratch.length < n * 5) { scratch = new Float32Array(n * 10); scratchU = new Uint32Array(scratch.buffer); }
    for (let i = 0; i < n; i++) {
      const [x, y] = posFn(i); scratch[i * 5] = x; scratch[i * 5 + 1] = y;
      const [u, v] = uvFn ? uvFn(i) : [p.uv[i * 4 + 2], p.uv[i * 4 + 3]]; scratch[i * 5 + 2] = u; scratch[i * 5 + 3] = v;
      scratchU[i * 5 + 4] = p.colors ? rgbaU(p.colors[i]) : 0xffffffff;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, scratch.subarray(0, n * 5), gl.STREAM_DRAW); attribs();
    const addMode = setBlend(p.blend);
    gl.uniform4fv(U.uMul, p.mul); gl.uniform4fv(U.uAdd, p.add || [0, 0, 0, 0]); gl.uniform2fv(U.uFade, p.fade || [0, 0]); gl.uniform2fv(U.uClip, p.clip || [-1e9, 1e9]); gl.uniform1f(U.uAddMode, addMode); gl.uniform2fv(U.uUVOff, [0, 0]);
    const idx = p.idx || quadIdx(n);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STREAM_DRAW);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_INT, 0);
  }
  const fract = (x) => x - Math.floor(x);
  // Hoja de cuadros de los VS 19815E13/27643FEB/C6F0B6F9: cuadro = fase/total → columna y fila; uv = (col+u)/cols, (fila+v)/filas.
  function animUV(p, dt) {
    const a = p.anim, total = a.cols * a.rows; if (!(total > 0)) return null;
    const t = a.t + dt, f = a.start === undefined ? t * a.rate + a.phase : Math.min(total - 1, (t - a.start) * a.rate) + a.phase;
    const idx = fract(f / total) * total, q = fract(idx / a.cols / a.rows), row = Math.floor(q * a.rows), col = Math.floor(fract(q * a.rows) * a.cols);
    return (i) => [(col + p.uv[i * 4 + 2]) / a.cols, (row + p.uv[i * 4 + 3]) / a.rows];
  }
  // Corrimiento por la autopista: v aumenta hacia el jugador; un punto en (x, y) pasa a y' = y(v + s·Δ) y su
  // distancia al centro escala con el ancho de la pista. Las gemas se escalan desde su borde de abajo (no se deforman).
  function mover(dv) {
    return (y) => { const y2 = yOfV(vOfY(y) + dv); return [y2, wOfY(y2) / wOfY(y)]; };
  }
  let active = false, heartbeatAt = -Infinity, nextRenderAt = 0, lastShownAt = 0;
  function announce(on, now) {
    if (active !== on || on && now - heartbeatAt >= 100) {
      chan.postMessage({type:'overlayReady', on, at: performance.timeOrigin + now});
      active = on; heartbeatAt = now;
    }
  }
  function render(now, tick = now) {
    st.rafs++;
    // Tope de 60/s con 4 ms de tolerancia: en 60 Hz se dibuja en cada rAF (el tope exacto de antes salteaba los rAF que
    // llegaban unas décimas antes y daba ~47/s); en 100/120 Hz, 60 de cada segundo.
    const P = 1000 / 60;
    if (tick < nextRenderAt - P * 2) nextRenderAt = tick; // reloj reiniciado
    if (tick < nextRenderAt - 4) return;
    nextRenderAt = Math.max(nextRenderAt + P, tick + P - 4); // sin ráfagas después de un rAF tardío
    const nf = frame, T = nf ? visualTime(now, nf.T) : null;
    // Cuadro a dibujar: el más nuevo del historial con T ≤ tiempo del audio (si no hay, el más viejo guardado).
    let fr = nf; if (T !== null && hist.length) { fr = hist[0]; for (let i = hist.length - 1; i >= 0; i--) if (hist[i].T <= T + 2) { fr = hist[i]; break; } }
    // Δ (s de canción) entre ese cuadro y el audio que suena: ahora casi siempre 0..40 ms (antes ~ −colchón de audio).
    const dt = T === null ? NaN : (T - fr.T) / 1000, inRange = dt >= -0.6 && dt <= 0.35;
    if (T !== null && !inRange) st.outOfRange++;
    // Reloj del juego quieto > 250 ms con cuadros llegando = pausa o fin: la capa se apaga y el juego dibuja su
    // autopista DEBAJO de su menú (Claude 2026-10-15: antes la capa tapaba el menú de pausa).
    st.paused = !!fr && now - srcMovedAt > 250;
    const visible = enabled && fr && fr.complete && tab && now - nf.at < 400 && T !== null && inRange && !st.paused;
    // Registro de apagones (Claude 2026-10-16, Santi: «la autopista desaparecía y aparecía en menos de un segundo»).
    if (!visible && active) {
      const why = !enabled ? 'capa apagada' : !fr ? 'sin cuadro del juego' : !fr.complete ? 'cuadro incompleto' : !tab ? 'sin datos de pista'
        : now - nf.at >= 400 ? `el juego no mandó cuadros (${Math.round(now - nf.at)} ms)` : T === null ? 'sin reloj de audio'
        : !inRange ? `imagen y sonido desfasados (${Math.round(dt * 1000)} ms)` : 'pausa o fin de canción';
      st.hides.push({ at: Date.now(), why, ms: null }); if (st.hides.length > 30) st.hides.shift();
      st.hideStart = now;
    } else if (visible && !active && st.hideStart != null && st.hides.length) {
      st.hides[st.hides.length - 1].ms = Math.round(now - st.hideStart); st.hideStart = null;
    }
    announce(!!visible, now);
    if (!placeCanvas(visible)) return;
    st.sourceTimeMs = fr.T; st.dtMs = dt * 1000;
    st.clockMs = S()?.clock?.(); st.clockDomainDeltaMs = Number.isFinite(st.clockMs) ? T - st.clockMs : null;
    st.seq = fr.seq;
    // Animaciones (hojas de cuadros de estrellas/llamaradas) siguen el tiempo de pared desde el cuadro: nunca hacia atrás.
    const dtA = Math.max(0, Math.min(0.1, dt));
    const dv = fr.speed * dt, map0 = mover(dv), map = (y) => { const r = map0(y); if (!(r[1] > 0.05)) r[1] = 0.05; return r; };
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(prog);
    for (const p of fr.draws) {
      if (p.kind === 'board') {
        if (!bindTex(p.tex, p.sampler)) continue;
        // Desplazamiento de textura del VS original: fract(c254.x·(t·c4.x))·c255.z, con t = tiempo del cuadro + Δ.
        const t = p.vk[7] + dt, voff = fract(p.vt[4] * (t * p.c4)) * p.vt[10];
        gl.bindBuffer(gl.ARRAY_BUFFER, boardBuf); attribs(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, boardIdx);
        const addMode = setBlend(p.blend);
        gl.uniform4fv(U.uMul, p.mul); gl.uniform4fv(U.uAdd, p.add); gl.uniform2fv(U.uFade, p.fade); gl.uniform2fv(U.uClip, [-1e9, 1e9]); gl.uniform1f(U.uAddMode, addMode); gl.uniform2fv(U.uUVOff, [0, voff]);
        gl.drawElements(gl.TRIANGLES, boardIdxCount, gl.UNSIGNED_INT, 0);
      } else if (p.kind === 'move') {
        let yb = -1e9; for (let i = 0; i < p.n; i++) yb = Math.max(yb, p.pos[i * 2 + 1]);
        const [yb2, k] = map(yb);
        const uvFn = p.anim ? animUV(p, dtA) : null; // gemas estrella: hoja de cuadros animada (VS 19815E13)
        drawPiece(p, (i) => [640 + (p.pos[i * 2] - 640) * k, yb2 - (yb - p.pos[i * 2 + 1]) * k], uvFn);
      } else if (p.kind === 'tail') {
        // Cola: cada vértice corre por la autopista; el recorte de abajo queda fijo si está en la línea (nota sostenida).
        const held = p.clip[1] > 600, top = p.clip[0] <= 305.5 ? p.clip[0] : map(p.clip[0])[0], bot = held ? p.clip[1] : map(p.clip[1])[0];
        drawPiece({ ...p, clip: [top, bot] }, (i) => { const [y2, k] = map(p.pos[i * 2 + 1]); return [640 + (p.pos[i * 2] - 640) * k, y2]; });
      } else drawPiece(p, (i) => [p.pos[i * 2], p.pos[i * 2 + 1]], p.anim ? animUV(p, dtA) : null);
    }
    st.shown++;
    if (lastShownAt) { const g = now - lastShownAt, h = st.shownGaps; h[g <= 17 ? 'le17' : g <= 20 ? 'le20' : g <= 25 ? 'le25' : g <= 34 ? 'le34' : g <= 50 ? 'le50' : 'gt50']++; }
    lastShownAt = now;
  }

  // ---------- lienzo encima del juego (mismo rectángulo que el contenido de #r5Canvas) ----------
  let lastBox = '';
  function placeCanvas(visible) {
    const game = document.getElementById('r5Canvas');
    if (!visible || !game || !cv) { if (cv && cv.style.display !== 'none') cv.style.display = 'none'; return false; }
    const r = game.getBoundingClientRect(); if (r.width < 10 || r.height < 10) { cv.style.display = 'none'; return false; }
    const sc = Math.min(r.width / 1280, r.height / 720), w = 1280 * sc, h = 720 * sc, x = r.left + (r.width - w) / 2, y = r.top + (r.height - h) / 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    // Nivel: encima del contenedor más alto del juego (en celular #r5Box tiene z 40 y la capa quedaba tapada; Claude
    // 2026-10-15), debajo de los botones táctiles (50+).
    let z = 0; for (let e = game; e && e !== document.body; e = e.parentElement) z = Math.max(z, parseInt(getComputedStyle(e).zIndex) || 0);
    const box = [x, y, w, h, z].map((n) => Math.round(n * 10)).join(',');
    if (box !== lastBox) { lastBox = box; Object.assign(cv.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', zIndex: String(z + 1) }); }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    if (cv.style.display === 'none') cv.style.display = 'block';
    return true;
  }
  // Pantalla completa del juego: se agranda toda la página (no solo #r5Canvas) para que esta capa también se vea.
  const fsCss = document.createElement('style');
  fsCss.textContent = 'html.hw60Full body #r5Canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;object-fit:contain;background:#000;z-index:2147483000}';
  document.head.appendChild(fsCss);
  document.addEventListener('click', (e) => {
    const b = e.target.closest?.('#gh3Full,#gh3Full2'); if (!b || !enabled || document.documentElement.classList.contains('gh3Mobile')) return;
    e.stopImmediatePropagation(); e.preventDefault(); b.blur();
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); else document.documentElement.requestFullscreen?.().catch(() => {});
  }, true);
  document.addEventListener('fullscreenchange', () => document.documentElement.classList.toggle('hw60Full', document.fullscreenElement === document.documentElement && !document.documentElement.classList.contains('gh3Mobile')));

  const loop = (t) => { const start = performance.now(); try { const shown = st.shown; render(start, t); if (st.shown !== shown) { st.renderMs = (st.renderMs || 0) + performance.now() - start; st.renderSamples = (st.renderSamples || 0) + 1; } } catch (err) { st.errors++; st.lastError = String(err?.message || err); } requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  // Diagnóstico: piezas del último cuadro (tipo, VS, caja, textura, mezcla, multiplicador).
  window.hw60.dump = () => frame && frame.draws.map((p) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (let i = 0; i < (p.n || 0); i++) { x0 = Math.min(x0, p.pos[i * 2]); x1 = Math.max(x1, p.pos[i * 2]); y0 = Math.min(y0, p.pos[i * 2 + 1]); y1 = Math.max(y1, p.pos[i * 2 + 1]); } const t = textures.get(p.tex); return { kind: p.kind, n: p.n, box: [x0, y0, x1, y1].map(Math.round), tex: t ? t.w + 'x' + t.h : null, blend: (p.blend >>> 0).toString(16), mul: Array.from(p.mul || []).map((v) => +v.toFixed(2)), fade: p.fade, clip: p.clip, anim: p.anim }; });
  window.hw60.setEnabled = (on) => { enabled = !!on; st.enabled = enabled; if (!enabled) { announce(false, performance.now()); placeCanvas(false); } try { localStorage.setItem('gh3-a60', on ? '1' : '0'); } catch {} chan.postMessage({ type: 'tapEnable', on: enabled }); };
  chan.postMessage({type:'tapEnable', on:enabled});
  window.hw60.setOffset = (ms) => { st.offsetMs = Math.max(-300, Math.min(300, Number(ms) || 0)); try { localStorage.setItem('gh3-a60-offset', String(st.offsetMs)); } catch {} };
  // Ajuste «Notas y sonido» en el panel ☰ (Claude 2026-10-15, pedido de Santi): el retraso real del parlante/auriculares
  // cambia por equipo (iPhone no informa outputLatency; Bluetooth suma ~0,2 s). Se guarda en este navegador.
  const addSync = () => {
    const panel = document.getElementById('gh3Panel'); if (!panel || document.getElementById('a60Sync')) return !!panel;
    const box = document.createElement('div'); box.id = 'a60Sync';
    box.style.cssText = 'margin:10px 0;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:10px;font:14px system-ui,sans-serif;color:#eee';
    box.innerHTML = '<div style="font-weight:600;margin-bottom:6px">Notas y sonido</div>'
      + '<div style="display:flex;align-items:center;gap:8px"><button type="button" data-d="-10" style="min-width:44px;min-height:40px;font-size:18px">−</button>'
      + '<span id="a60SyncVal" style="min-width:90px;text-align:center"></span><button type="button" data-d="10" style="min-width:44px;min-height:40px;font-size:18px">+</button>'
      + '<button type="button" data-d="0" style="min-height:40px;margin-left:auto">Normal</button></div>'
      + '<div style="opacity:.75;font-size:12px;margin-top:6px">Si las notas llegan después del sonido, tocá +. Si llegan antes, tocá −.</div>';
    const show = () => { document.getElementById('a60SyncVal').textContent = (st.offsetMs > 0 ? '+' : '') + st.offsetMs + ' ms'; };
    box.addEventListener('click', (e) => { const b = e.target.closest('button[data-d]'); if (!b) return; e.stopPropagation(); b.blur();
      const d = Number(b.dataset.d); window.hw60.setOffset(d === 0 ? 200 : st.offsetMs + d); show(); });
    panel.appendChild(box); show(); return true;
  };
  if (!addSync()) { const iv = setInterval(() => { if (addSync()) clearInterval(iv); }, 1000); }
})();
