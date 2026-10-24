// Claude 2026-10-23: grabadora del audio que escribe el juego (cola compartida de r6). Se inyecta con med.mjs --grabar.
// Un worker mira la cola cada ~2 ms (sin pasar por el hilo de la página, que tiene retrasos) y anota por segundo cuántas
// muestras entraron (100 % = 48000/s) y los sucesos: parada (el juego tardó >40 ms en escribir), salto (cambio brusco
// de onda = chasquido), silencio (>=1 ms de ceros exactos en medio de la música) y perdido (la cola se llenó de más).
(() => {
  if (window.__grabInstalada) return; window.__grabInstalada = true;
  const G = window.__grab = {seg: [], ev: [], w: null, err: null};
  const src = `onmessage = e => { const {sab, ptr} = e.data;
    const wA = new Uint32Array(sab, ptr, 1), cap = new Uint32Array(sab, ptr + 4, 1)[0], d = new Float32Array(sab, ptr + 8, cap * 2), nap = new Int32Array(new SharedArrayBuffer(4));
    let last = Atomics.load(wA, 0), tChg = performance.now(), segW0 = last, segT0 = tChg, prevL = 0, prevR = 0, zrun = 0, ev = [], segStall = 0, nSalto = 0, nZero = 0;
    for (;;) { Atomics.wait(nap, 0, 0, 2); const now = performance.now(), w = Atomics.load(wA, 0), n = (w - last) >>> 0;
      if (n > 0 && n < cap / 2) { const gap = now - tChg; if (gap > segStall) segStall = gap; if (gap > 40) ev.push({k: 'parada', ms: Math.round(gap)});
        for (let i = 0; i < n; i++) { const s = ((last + i) % cap) * 2, L = d[s], R = d[s + 1], j = Math.max(Math.abs(L - prevL), Math.abs(R - prevR));
          if (j > 0.5) { nSalto++; if (ev.length < 300) ev.push({k: 'salto', v: +j.toFixed(2)}); }
          if (L === 0 && R === 0) zrun++; else { if (zrun >= 48) { nZero++; if (ev.length < 300) ev.push({k: 'silencio', frames: zrun}); } zrun = 0; }
          prevL = L; prevR = R; }
        last = w; tChg = now; }
      else if (n >= cap / 2) { ev.push({k: 'perdido', frames: n}); last = w; tChg = now; }
      if (now - segT0 >= 1000) { postMessage({seg: {frames: (w - segW0) >>> 0, ms: Math.round(now - segT0), stallMax: Math.round(segStall), saltos: nSalto, silencios: nZero}, ev}); ev = []; segW0 = w; segT0 = now; segStall = 0; nSalto = 0; nZero = 0; } } };`;
  const iniciar = (sab, ptr) => { if (G.w) return; const w = G.w = new Worker(URL.createObjectURL(new Blob([src], {type: 'text/javascript'})));
    w.onmessage = e => { const c = window.gh3Song?.clock?.() ?? null; if (e.data.seg) G.seg.push({...e.data.seg, clock: c}); for (const x of e.data.ev || []) G.ev.push({...x, clock: c}); }; w.postMessage({sab, ptr}); };
  let orig; Object.defineProperty(window, 'r6StartAudio', {configurable: true, get() { return orig && function (sab, ptr) { try { iniciar(sab, ptr); } catch (e) { G.err = String(e); } return orig.apply(this, arguments); }; }, set(v) { orig = v; }});
  window.__grabDrain = () => { const o = {seg: G.seg, ev: G.ev, err: G.err}; G.seg = []; G.ev = []; return o; };
})();
