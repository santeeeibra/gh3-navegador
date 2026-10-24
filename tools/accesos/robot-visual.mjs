// Robot que "mira" (Claude 2026-10-15, plan artifacts/gh3-liviano/PLAN-ROBOT-VISUAL.md).
// No lee el chart: mira la capa autopista60 (lienzo #hw60Canvas, el que ve el jugador) y toca cuando ve llegar una gema
// a su botón, como una persona. Si erra donde el robot del chart acierta, el problema es la imagen, no el juego.
//   - Mirar: en cada cuadro nuevo de la capa lee una franja (y 440–720 de 1280×720) y busca filas "anchas" del color de
//     cada carril (gemas). Sigue cada gema en la zona de llegada (y 440–600, encima de los botones).
//   - Tocar: cuando el centro de la gema cruza la línea y 560 (hora interpolada entre dos cuadros), avisa al hilo del robot
//     que rasguee viajeMs después (como una persona que aprendió el tiempo hasta el botón); el hilo aprieta los trastes
//     50 ms antes. (Predecir la llegada con velocidad o con ajuste cuadrático daba ~70–90 ms tarde: probado y descartado.)
//     Colas: mientras se ve la cola (franja angosta del color) justo encima del botón, mantiene el traste.
//   - Contar (vale también con el robot del chart): gemas que el JUEGO deja pasar (en su propio cuadro desaparecen debajo de y 670)
//     = fallos según el propio juego (las acertadas desaparecen en la línea).
// Coordenadas sacadas de la sonda (acceso.mjs --sonda): botones x 435/537,5/640/742,5/845, y 604–655; ancho de la pista
// ≈ 554 − (711 − y)·0,99.
import {leerChart} from './robot.mjs';

// Para startGame({init}): memoria compartida del robot + lienzos WebGL2 con preserveDrawingBuffer (para poder leerlos).
export function initVisual() {
  const W = window.Worker;
  window.Worker = function (...a) { const w = new W(...a); w.addEventListener('message', e => {
    if (e.data?.type === 'g1eInput') window.g1live = {sab: e.data.sab, ptr: e.data.ptr};
    if (e.data?.type === 'g1Mem' || e.data?.type === 'g1eInput') window.g1mem = {sab: e.data.sab, seg: e.data.seg}; }); return w; };
  window.Worker.prototype = W.prototype;
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, o) { if (t === 'webgl2') o = {...(o || {}), preserveDrawingBuffer: true}; return gc.call(this, t, o); };
}

// modo 'mira' = toca mirando; 'contar' = sólo cuenta fallos (para usar junto al robot del chart).
// viajeMs: de la línea y 560 al botón (medido con cruces(): la gema cruza 560 ~116 ms antes de la hora ideal, Slow Ride medium).
export async function instalarVisual(page, {modo = 'mira', ajusteMs = 0, viajeMs = 116, lead = -350, sincro = false} = {}) {
  await page.evaluate(({modo, ajusteMs, viajeMs, lead, sincro}) => {
    const LANES = [435, 537.5, 640, 742.5, 845], Y0 = 440, Y1 = 720, X0 = 370, X1 = 910, HIT = 630, ZONA = 600, CRUCE = 560, FALLO = 670;  // medido: acertadas desaparecen en y 633–667 del cuadro del juego, falladas en 672–700
    const ancho = (y) => 554 - (711 - y) * 0.99, kk = (y) => ancho(y) / ancho(HIT);
    const color = [  // ¿el píxel es del color del carril?
      (r, g, b) => g > 140 && g > r + 50 && g > b + 50,
      (r, g, b) => r > 140 && r > g + 70 && r > b + 70,
      (r, g, b) => r > 160 && g > 140 && b < 110 && Math.abs(r - g) < 70,
      (r, g, b) => b > 140 && b > r + 60,
      (r, g, b) => r > 180 && g > 70 && g < r - 50 && b < 90];
    const vb = window.visBot = {modo, viajeMs, ajusteMs, costoDumpMs: 0, cuadros: 0, gemasVistas: 0, programadas: 0, fallosVistos: [0, 0, 0, 0, 0], colasVistas: 0, finales: [], cruces: [], costoMs: 0, costoMaxMs: 0, errores: 0, ultimoError: null, muestras: [], tiras: [], strums: null};

    // ---- hilo del robot (sólo 'mira'): aprieta y rasguea a la hora pedida ----
    let bw = null;
    if (modo === 'mira') {
      const src = `
        const FRET = [0x1000, 0x2000, 0x8000, 0x4000, 0x0100], DOWN = 0x0002, ADDR = 0x829B57B0, BASE = 340;
        let M = null, L = null, lead = 0, pend = [], hold = 0, sincro = false, aud = null, esperas = 0, esperaMs = 0; const log = [], hechas = new Set(), ult = [-1e9, -1e9, -1e9, -1e9, -1e9];
        const ahora = () => performance.timeOrigin + performance.now();
        onmessage = (e) => { const d = e.data;
          if (d.type === 'init') ({lead, sincro} = d);
          if (d.type === 'aud') aud = d;
          if (d.type === 'mem') M = {sab: d.sab, seg: d.seg};
          if (d.type === 'live') L = new Int32Array(d.sab, d.ptr, 11);
          if (d.type === 'plan') { for (const p of d.p) { if (hechas.has(p.id) || Math.abs(p.T - ult[p.lane]) < 90) continue; const q = pend.find(x => x.id === p.id); if (q) q.T = p.T; else pend.push(p); } }
          if (d.type === 'hold') hold = d.mask;
          if (d.type === 'stats') postMessage({type: 'stats', log: log.splice(0), esperas, esperaMs}); };
        const clock = () => { if (!M) return NaN; const t = new Uint32Array(M.sab, M.seg, 256), h = (t[ADDR >>> 24] + ADDR) >>> 0;
          return h + 4 > M.sab.byteLength ? NaN : new DataView(M.sab).getFloat32(h, false); };
        const nap = new Int32Array(new SharedArrayBuffer(4));
        let frets = 0, keep = 0, strumUntil = 0, last = -1, n = 0;
        (function loop() { for (;;) {
          Atomics.wait(nap, 0, 0, 1);
          if (++n % 5 === 0) { setTimeout(loop, 0); return; }  // cede cada ~5 ms para recibir los avisos de los ojos
          if (!L) continue;
          const t = ahora(), pnow = performance.now();
          pend = pend.filter(p => p.T > t - 400);
          // Trastes: los de gemas que llegan dentro de 50 ms + los que se mantienen por cola.
          let want = 0; for (const p of pend) if (p.T - t < 50) want |= 1 << p.lane;
          if (want) { frets = want; keep = pnow + 60; } else if (pnow > keep) frets = 0;
          let tap = 0; const listas = pend.filter(p => p.T <= t);
          // --sincro (prueba del arreglo): el reloj del juego debe llegar a donde estaba el SONIDO a la hora del toque
          // (+ BASE, la relación medida con CPU sobrada). Si va atrasado, se espera (máx. 300 ms).
          if (listas.length && sincro && aud) { const T0 = Math.min(...listas.map(p => p.T)), K = aud.a + (T0 - aud.at) + BASE, c = clock();
            if (Number.isFinite(c) && c < K && t - T0 < 300) continue; if (t - T0 > 1) { esperas++; esperaMs += t - T0; } }
          if (listas.length) { tap = DOWN; strumUntil = pnow + 30; let m = 0; for (const p of listas) m |= 1 << p.lane; frets |= m;
            log.push({c: clock(), m, tarde: Math.round(t - Math.min(...listas.map(p => p.T)))}); for (const p of listas) { hechas.add(p.id); ult[p.lane] = t; } pend = pend.filter(p => p.T > t && p.T - ult[p.lane] >= 90); }
          const f = frets | hold; let b = 0; for (let k = 0; k < 5; k++) if (f & (1 << k)) b |= FRET[k];
          if (pnow < strumUntil) b |= DOWN;
          if (b !== last || tap) { if (tap) Atomics.or(L, 10, tap); Atomics.store(L, 2, 0); Atomics.store(L, 1, b); Atomics.add(L, 0, 1); last = b; }
        } })();`;
      bw = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
      bw.postMessage({type: 'init', lead, sincro});
      vb.strums = [];
      bw.onmessage = (e) => { if (e.data.type === 'stats') { vb.strums.push(...e.data.log); vb.esperas = e.data.esperas; vb.esperaMs = e.data.esperaMs; } };
      let sentLive = false;
      setInterval(() => {
        if (window.g1mem) bw.postMessage({type: 'mem', sab: window.g1mem.sab, seg: window.g1mem.seg});
        if (!sentLive && window.g1live?.sab) { bw.postMessage({type: 'live', sab: window.g1live.sab, ptr: window.g1live.ptr}); sentLive = true; }
        bw.postMessage({type: 'stats'});
      }, 500);
    }

    // ---- ojos: en cada cuadro nuevo de la capa ----
    let buf = null, lastShown = -1, gid = 0, holdPrev = -1;
    const tracks = [[], [], [], [], []];   // por carril: {id, cy, t, v}
    const bajaPrev = [-1, -1, -1, -1, -1];
    function mirar() {
      requestAnimationFrame(mirar);
      const tIni = performance.now();
      try {
        const h = window.hw60, cv = document.getElementById('hw60Canvas');
        if (!h || !cv || cv.style.display === 'none' || h.shown === lastShown || h.paused) return;
        lastShown = h.shown;
        const gl = cv.getContext('webgl2'); if (!gl) return;
        const sc = cv.width / 1280, x0 = Math.floor(X0 * sc), w = Math.ceil((X1 - X0) * sc), yTop = Math.floor(Y0 * sc), hh = Math.ceil((Y1 - Y0) * sc);
        if (!buf || buf.length !== w * hh * 4) buf = new Uint8Array(w * hh * 4);
        gl.readPixels(x0, cv.height - (yTop + hh), w, hh, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        const t = performance.timeOrigin + performance.now(), clk = window.gh3Song?.clock?.() ?? NaN;
        vb.cuadros++;
        // Fila (en coordenadas 1280×720) → fracción del ancho de la gema con color del carril, y conteo al centro (colas).
        const px = (X, Y) => { const cx = Math.round(X * sc) - x0, cy = hh - 1 - (Math.round(Y * sc) - yTop); if (cx < 0 || cx >= w || cy < 0 || cy >= hh) return null; const i = (cy * w + cx) * 4; return [buf[i], buf[i + 1], buf[i + 2]]; };
        const fila = (k, Y, medio) => { const k_ = kk(Y), xc = 640 + (LANES[k] - 640) * k_, half = medio * k_; let n = 0, tot = 0;
          for (let X = xc - half; X <= xc + half; X += 2 / sc) { const p = px(X, Y); if (!p) continue; tot++; if (color[k](p[0], p[1], p[2])) n++; } return tot ? n / tot : 0; };
        let hold = 0, guardar = ''; const plan = [];
        for (let k = 0; k < 5; k++) {
          // Gemas en la zona de llegada: grupos de filas anchas (≥ 45 % de ±38 px del carril).
          const grupos = []; let ini = -1, hueco = 0;
          for (let Y = Y0; Y <= ZONA + 20; Y += 3) {
            const g = fila(k, Y, 38) >= 0.45;
            if (g) { if (ini < 0) ini = Y; hueco = 0; } else if (ini >= 0 && ++hueco > 2) { grupos.push([ini, Y - 3 * hueco]); ini = -1; hueco = 0; }
          }
          if (ini >= 0) grupos.push([ini, ZONA + 20]);
          // El anillo de la gema (elipse) da dos franjas, arriba y abajo: se unen si están a menos de 18 px.
          for (let i = grupos.length - 1; i > 0; i--) if (grupos[i][0] - grupos[i - 1][1] < 18 * kk(grupos[i][0])) { grupos[i - 1][1] = grupos[i][1]; grupos.splice(i, 1); }
          const vistos = grupos.filter(([a, b]) => a > Y0 + 2 && b < ZONA && b - a >= 4).map(([a, b]) => (a + b) / 2);
          const nuevos = [];
          for (const cy of vistos) {
            const tr = tracks[k].find(x => cy >= x.cy - 4 && cy < x.cy + 90 && !nuevos.includes(x));
            if (tr) { tr.n++;
              // Cruce de la línea fija y 560: reloj del juego interpolado (mide la sincronía de la imagen sin el robot).
              // Tocar: hora del cruce (interpolada entre los dos cuadros) + viaje hasta el botón.
              if (tr.cy < CRUCE && cy >= CRUCE && cy > tr.cy) { const f = (CRUCE - tr.cy) / (cy - tr.cy); vb.cruces.push({k, c: Math.round(tr.c + (clk - tr.c) * f)}); plan.push({id: tr.id, lane: k, T: tr.t + (t - tr.t) * f + viajeMs + ajusteMs}); }
              tr.cy = cy; tr.t = t; tr.c = clk; nuevos.push(tr); }
            else if (cy < 560) { const nt = {id: ++gid, cy, t, c: clk, n: 0}; nuevos.push(nt); vb.gemasVistas++; }  // nace arriba: llamaradas/brillo de botones no cuentan
          }
          // Las que dejaron de verse en la zona (entraron a los botones) conservan su última hora calculada.
          tracks[k] = nuevos;
          // Cola: angosta y del color, justo encima del botón (y 585–598), sin gema ancha ahí.
          let cola = 0; for (let Y = 586; Y <= 598; Y += 3) { const f = fila(k, Y, 14), fa = fila(k, Y, 38); if (f >= 0.5 && fa < 0.45) cola++; }
          if (cola >= 4) hold |= 1 << k;
        }
        // Fallos según el juego: gema que en el cuadro DEL JUEGO (sin el adelanto de la capa, que hace pasar un poco
        // la línea también a las acertadas) desaparece más abajo que y 670 (centro). Las acertadas el juego las saca antes.
        const baja = [-1, -1, -1, -1, -1];
        const tD = performance.now(); const piezas = h.dump?.() || []; vb.costoDumpMs += performance.now() - tD;
        for (const p of piezas) { if (p.kind === 'move' && p.tex !== '1024x16') { const cy = (p.box[1] + p.box[3]) / 2, cx = (p.box[0] + p.box[2]) / 2; let k = 0, dm = 1e9; for (let j = 0; j < 5; j++) { const d = Math.abs(640 + (LANES[j] - 640) * kk(cy) - cx); if (d < dm) { dm = d; k = j; } } if (cy > baja[k] && cy > 520) baja[k] = cy; } }
        // Dónde desaparece la gema más baja de cada carril (para calibrar el umbral de fallo): {c: reloj, k, y}.
        for (let k = 0; k < 5; k++) { if (bajaPrev[k] > 0 && (baja[k] < 0 || baja[k] < bajaPrev[k] - 20)) { vb.finales.push({c: Math.round(window.gh3Song?.clock?.() ?? 0), k, y: Math.round(bajaPrev[k])}); if (bajaPrev[k] >= FALLO) { vb.fallosVistos[k]++; guardar = 'fallo' + k; } } bajaPrev[k] = baja[k]; }
        if (hold && hold !== holdPrev) vb.colasVistas++;
        // sincro 'imagen' (def.): tiempo dibujado sin el adelanto; 'sonido': tiempo del audio que suena.
        if (bw && sincro && h.audioOk && Number.isFinite(h.audioTimeMs)) bw.postMessage({type: 'aud', a: sincro === 'sonido' ? h.audioTimeMs : h.visualTimeMs - h.offsetMs, at: t});
        if (bw) { if (plan.length) { bw.postMessage({type: 'plan', p: plan}); vb.programadas += plan.length; } if (hold !== holdPrev) bw.postMessage({type: 'hold', mask: hold}); }
        holdPrev = hold;
        // Para revisar a mano: guarda 4 tiras (cada ~5 s) como RGBA en base64.
        if (guardar && vb.tiras.length < 8 || vb.tiras.length < 2 && vb.cuadros % 300 === 150) { vb.tiras.at?.(-1); const motivo = guardar || 'periodica'; guardar = ''; let s = ''; for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192)); vb.tiras.push({motivo, w, h: hh, sc, x0, yTop, rgba: btoa(s)}); }
      } catch (e) { vb.errores++; vb.ultimoError = e.message; }
      const dur = performance.now() - tIni; vb.costoMs += dur; if (dur > vb.costoMaxMs) vb.costoMaxMs = dur;
    }
    requestAnimationFrame(mirar);
  }, {modo, ajusteMs, viajeMs, lead, sincro});
}

// Atraso del robot que mira respecto al momento ideal (el del robot del chart: reloj = nota + 350 ms).
export function atrasos(strums, tema, lead = -350) {
  const notas = leerChart(tema).notes.map(n => n.t - lead);
  const d = strums.filter(s => Number.isFinite(s.c)).map(s => { let best = Infinity; for (const n of notas) if (Math.abs(s.c - n) < Math.abs(best)) best = s.c - n; return Math.round(best); });
  if (!d.length) return null;
  const o = [...d].sort((a, b) => a - b), q = p => o[Math.min(o.length - 1, Math.floor(p * o.length))];
  return {n: d.length, mediana: q(0.5), p10: q(0.1), p90: q(0.9), min: o[0], max: o.at(-1), fueraDe80ms: d.filter(x => Math.abs(x) > 80).length};
}

// Cruces de la línea y 560: reloj del juego cuando la gema la cruza en la imagen − hora ideal de su nota (mismo carril).
// La mediana es cuánto antes se ve la gema ahí (constante); la dispersión (p90 − p10) es el temblor de la imagen.
export function cruces(lista, tema, lead = -350) {
  const notas = leerChart(tema).notes;
  const d = lista.filter(x => Number.isFinite(x.c)).map(x => { let best = Infinity; for (const n of notas) if (n.mask & (1 << x.k)) { const v = x.c - (n.t - lead); if (Math.abs(v) < Math.abs(best)) best = v; } return Math.round(best); }).filter(Number.isFinite);
  if (!d.length) return null;
  const o = [...d].sort((a, b) => a - b), q = p => o[Math.min(o.length - 1, Math.floor(p * o.length))];
  return {n: d.length, mediana: q(0.5), p10: q(0.1), p90: q(0.9), min: o[0], max: o.at(-1)};
}
