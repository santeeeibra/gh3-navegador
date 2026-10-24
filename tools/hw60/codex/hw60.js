// hw60 (Claude, 2026-10-13): autopista fluida a 60 cuadros/s sobre la imagen original de GH3.
// Recibe por BroadcastChannel('hw60') lo que el lector paralelo (hw60-tap.js, hilo del CP) saca de cada cuadro del
// juego: pista, gemas, líneas de compás, colas, botones y chispas, con sus texturas, colores y constantes.
// En cada cuadro de pantalla redibuja esas piezas con WebGL2 encima del lienzo del juego, corridas por la autopista
// según el tiempo transcurrido desde el cuadro del juego (la pista avanza a velocidad fija), así las notas se mueven
// a 60 cuadros/s aunque el juego entregue 30–45. Texturas, tamaños y posiciones son las del juego; lo único propio
// es el corrimiento entre cuadros. ?hw60=0 lo apaga. Estado en window.hw60.
(() => {
  const Q = new URLSearchParams(location.search);
  let enabled = Q.get('hw60') !== '0';
  try { if (Q.get('hw60') === null && localStorage.getItem('gh3-hw60') === '0') enabled = false; } catch {}
  const BOARD = '80708BD1B82638B0', GEM = '582ABCF5FF619A55', STAR = '19815E13AC0DCC92', NOW = '87D4CAE67E72C501';
  const TAIL = new Set(['10CA3B730086027C', '035C1CB9583C0C7E']), FLAME = new Set(['27643FEB20B8CBBD', 'C6F0B6F9BA5A2B12']);
  const st = window.hw60 = { enabled, frames: 0, shown: 0, rafs: 0, dropped: 0, lastFrameAt: 0, rate: 1, jumpMax: 0, jumpAvg: 0, jumpHist: [0, 0, 0, 0, 0], gapMs: 0, maxExtrapMs: 0, extrapHist: [0, 0, 0, 0, 0], texCount: 0, tap: null, errors: 0, lastError: null, offsetMs: 0 };
  try { const o = Number(localStorage.getItem('gh3-hw60-offset')); if (Number.isFinite(o)) st.offsetMs = Math.max(-300, Math.min(300, o)); } catch {}

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

  // ---------- reloj suavizado (reloj de la canción en memoria) ----------
  const S = () => window.gh3Song;
  let ck = { last: NaN, lastAt: 0, off: null };
  function clockNow(now) {
    const c = S()?.clock ? S().clock() : NaN; if (!Number.isFinite(c) || c === 0) { ck.off = null; return NaN; }
    if (c !== ck.last) { const o = c - now; ck.off = ck.off === null || Math.abs(o - ck.off) > 150 ? o : ck.off + (o - ck.off) * 0.08; ck.last = c; ck.lastAt = now; }
    if (now - ck.lastAt > 200) return ck.last; // pausa o juego trabado: quieto
    return now + ck.off;
  }

  // ---------- tiempo de la autopista: recta T = a·ahora + b ajustada sobre los últimos cuadros (~1,5 s) ----------
  // Solo con el tiempo que trae cada cuadro (c155.w) y la hora de llegada: absorbe la demora de entrega y el ritmo
  // real del juego (si va más lento que el reloj de pared, a < 1). Saltos (pausa, reinicio) reinician la recta.
  const fit = {
    pts: [], a: 1, b: 0, ok: false,
    add(t, T) {
      const last = this.pts.at(-1);
      if (last && (T < last.T - 1 || T - last.T > 1000 || t - last.t > 1000)) this.pts = [];
      this.pts.push({ t, T }); while (this.pts.length > 2 && t - this.pts[0].t > 1500) this.pts.shift();
      const n = this.pts.length; if (n < 2) { this.a = 1; this.b = T - t; this.ok = n > 0; return; }
      let mt = 0, mT = 0; for (const p of this.pts) { mt += p.t; mT += p.T; } mt /= n; mT /= n;
      let sxy = 0, sxx = 0; for (const p of this.pts) { sxy += (p.t - mt) * (p.T - mT); sxx += (p.t - mt) ** 2; }
      let a = sxx > 1 ? sxy / sxx : 1; if (!(a > 0.5 && a < 1.5)) a = 1;
      // Demora de entrega d ≥ 0: T − a·t = b₀ − a·d, así que el cuadro que llegó más rápido da el máximo.
      let b = -Infinity; for (const p of this.pts) b = Math.max(b, p.T - a * p.t);
      this.a = a; this.b = b; this.ok = true; st.rate = a;
    },
    at(t) { return this.a * t + this.b; },
  };

  // ---------- cuadros del juego ----------
  let frame = null, boardDraw = null;
  const chan = new BroadcastChannel('hw60');
  chan.onmessage = (e) => {
    const m = e.data; if (m?.type !== 'frame' || !enabled) return;
    try {
      if (!gl && !initGL()) { enabled = false; return; }
      for (const t of m.textures) upload(t);
      if (m.stats) st.tap = m.stats;
      const now = performance.now(), b = m.draws.find((d) => d.vs === BOARD);
      if (!b) { frame = null; return; }
      if (b.verts) { tab = buildTable(b.verts); boardDraw = b; uploadBoard(b); } else if (boardDraw) { boardDraw = { ...b, verts: boardDraw.verts, colors: boardDraw.colors, idx: boardDraw.idx }; }
      if (!tab) return;
      const T = b.vk[7] * 1000; // c155.w: tiempo de la canción (s) con el que el juego armó este cuadro
      // Tirón: cuánto cambia el tiempo dibujado en este instante al recalcular la recta (ms).
      // Workers share a wall-time domain via timeOrigin. Use capture time, not
      // texture upload/message arrival time. Old offline fixtures use arrival.
      const sourceAt = m.at - performance.timeOrigin;
      const at = Number.isFinite(sourceAt) && Math.abs(now - sourceAt) < 1000 ? sourceAt : now;
      st.deliveryMs = now - at;
      const before = fit.ok ? fit.at(now) : null; fit.add(at, T);
      if (before !== null && fit.pts.length > 2) { const j = Math.abs(fit.at(now) - before); st.jumpMax = Math.max(st.jumpMax * 0.995, j); st.jumpAvg = st.jumpAvg * 0.98 + j * 0.02; st.jumpHist[j < 2 ? 0 : j < 5 ? 1 : j < 10 ? 2 : j < 20 ? 3 : 4]++; }
      if (frame) st.gapMs = now - frame.at;
      frame = { at: now, sourceAt: at, seq: m.seq, T, speed: -b.vc[16], complete: m.draws.every(d => !d.tex || textures.has(d.tex)), draws: m.draws.map(prep).filter(Boolean) };
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
  let active = false, heartbeatAt = -Infinity, nextRenderAt = 0, lastRenderNow = -Infinity;
  function announce(on, now) {
    if (active !== on || on && now - heartbeatAt >= 100) {
      chan.postMessage({type:'overlayReady', on, at: performance.timeOrigin + now});
      active = on; heartbeatAt = now;
    }
  }
  function render(now, tick = now) {
    st.rafs++;
    if (tick < lastRenderNow) nextRenderAt = tick; // deterministic replay / clock reset
    lastRenderNow = tick;
    if (tick + 0.01 < nextRenderAt) return;
    const period = 1000 / 60;
    nextRenderAt += (Math.floor((tick + 0.01 - nextRenderAt) / period) + 1) * period;
    const fr = frame, c = clockNow(now);
    const visible = enabled && fr && fr.complete && tab && now - fr.at < 400 && Number.isFinite(c) && fit.ok;
    announce(!!visible, now);
    if (!placeCanvas(visible)) return;
    // Δ en segundos de canción entre el cuadro del juego y ahora (+ ajuste de sincronía de la página).
    let dt = (fit.at(now) + st.offsetMs - fr.T) / 1000; const cap = 0.35; // celular: el juego puede tardar 200 ms entre cuadros
    if (now - ck.lastAt > 200) dt = 0; // no avanzar sobre una pausa o un reloj detenido
    if (dt > cap) dt = cap; if (dt < -0.05) dt = -0.05;
    st.sourceTimeMs = fr.T; st.visualTimeMs = fr.T + dt * 1000;
    st.clockMs = S()?.clock?.(); st.clockDomainDeltaMs = st.visualTimeMs - st.clockMs;
    st.seq = fr.seq;
    st.maxExtrapMs = Math.max(st.maxExtrapMs * 0.999, dt * 1000); st.extrapHist[Math.min(4, Math.max(0, Math.floor(dt * 1000 / 20)))]++;
    const dv = fr.speed * dt, map = mover(dv);
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
        const uvFn = p.anim ? animUV(p, dt) : null; // gemas estrella: hoja de cuadros animada (VS 19815E13)
        drawPiece(p, (i) => [640 + (p.pos[i * 2] - 640) * k, yb2 - (yb - p.pos[i * 2 + 1]) * k], uvFn);
      } else if (p.kind === 'tail') {
        // Cola: cada vértice corre por la autopista; el recorte de abajo queda fijo si está en la línea (nota sostenida).
        const held = p.clip[1] > 600, top = p.clip[0] <= 305.5 ? p.clip[0] : map(p.clip[0])[0], bot = held ? p.clip[1] : map(p.clip[1])[0];
        drawPiece({ ...p, clip: [top, bot] }, (i) => { const [y2, k] = map(p.pos[i * 2 + 1]); return [640 + (p.pos[i * 2] - 640) * k, y2]; });
      } else drawPiece(p, (i) => [p.pos[i * 2], p.pos[i * 2 + 1]], p.anim ? animUV(p, dt) : null);
    }
    st.shown++;
  }

  // ---------- lienzo encima del juego (mismo rectángulo que el contenido de #r5Canvas) ----------
  let lastBox = '';
  function placeCanvas(visible) {
    const game = document.getElementById('r5Canvas');
    if (!visible || !game || !cv) { if (cv && cv.style.display !== 'none') cv.style.display = 'none'; return false; }
    const r = game.getBoundingClientRect(); if (r.width < 10 || r.height < 10) { cv.style.display = 'none'; return false; }
    const sc = Math.min(r.width / 1280, r.height / 720), w = 1280 * sc, h = 720 * sc, x = r.left + (r.width - w) / 2, y = r.top + (r.height - h) / 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(w * dpr), H = Math.round(h * dpr);
    const z = parseInt(getComputedStyle(game).zIndex) || 0, box = [x, y, w, h, z].map((n) => Math.round(n * 10)).join(',');
    if (box !== lastBox) { lastBox = box; Object.assign(cv.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', zIndex: String(z + 1) }); }
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    if (cv.style.display === 'none') cv.style.display = 'block';
    return true;
  }
  // Pantalla completa del juego: se agranda toda la página (no solo #r5Canvas) para que esta capa también se vea.
  const fsCss = document.createElement('style');
  fsCss.textContent = 'html.hw60Full #r5Canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;height:100dvh!important;max-width:none!important;max-height:none!important;object-fit:contain;background:#000;z-index:2147483000}';
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
  window.hw60.setEnabled = (on) => { enabled = !!on; st.enabled = enabled; if (!enabled) { announce(false, performance.now()); placeCanvas(false); } try { localStorage.setItem('gh3-hw60', on ? '1' : '0'); } catch {} chan.postMessage({ type: 'tapEnable', on: enabled }); };
  chan.postMessage({type:'tapEnable', on:enabled});
  window.hw60.setOffset = (ms) => { st.offsetMs = Math.max(-300, Math.min(300, Number(ms) || 0)); try { localStorage.setItem('gh3-hw60-offset', String(st.offsetMs)); } catch {} };
})();
