// Claude 2026-10-17: lado página del gancho «reloj del juego atado al audio» (tools/relojaudio/reloj_audio.h).
// ?relojaudio=1 corrige, ?relojaudio=2 sólo mide, sin parámetro = apagado (el gancho no hace nada).
// autopista60.js llama window.relojAudioWrite(ms, p) con el tiempo de canción del audio que suena (sin el ajuste
// «Notas y sonido») en el instante p (performance.now) y acá se copia a la memoria compartida del juego.
(() => {
  const q = new URLSearchParams(location.search), mode = Number(q.get('relojaudio') || 0) | 0;
  const st = { mode, ptr: 0, writes: 0 }; window.relojAudio = st;
  let sab = null, i32 = null, f64 = null;
  const connect = () => {
    if (!sab || !st.ptr || i32) return;
    i32 = new Int32Array(sab, st.ptr, 4); f64 = new Float64Array(sab, st.ptr + 16, 5);
    if (q.has('relojaudiocap')) f64[3] = Number(q.get('relojaudiocap')) / 1000;
    if (q.has('relojaudiogain')) f64[4] = Number(q.get('relojaudiogain'));
    if (q.has('relojaudioofs')) f64[2] = Number(q.get('relojaudioofs')) / 1000;
    Atomics.store(i32, 3, 1); Atomics.store(i32, 1, mode);
  };
  const prev = window.c1StrumAttach;
  window.c1StrumAttach = (s, p) => { sab = s; connect(); return prev?.(s, p); };
  new BroadcastChannel('hw60').addEventListener('message', (e) => {
    if (e.data?.type === 'relojAudioMemory' && !st.ptr) { st.ptr = e.data.ptr >>> 0; connect(); }
  });
  window.relojAudioWrite = (ms, p) => {
    if (!i32 || !mode || lk.b0 === null) return;
    const s = Atomics.add(i32, 2, 1) + 1; // impar
    f64[0] = ms / 1000; f64[1] = performance.timeOrigin + p;
    Atomics.store(i32, 2, s + 1); st.writes++;
  };
  // Ancla fija: autopista60 ancla «tiempo de canción ↔ muestra escrita» con el reloj del juego; si el gancho corrige
  // ese reloj, el ancla lo seguiría y el error nunca bajaría (comprobado 2026-10-17: −3,5 s corregidos, error igual).
  // Por eso se toma el ancla UNA vez por canción, con la canción ya sonando (reloj > 0,5 s, 40 anclas y 2,5 s seguidos sin
  // reinicio) y antes de corregir, y se mantiene (reanclar a mitad de canción dio resultados inconsistentes, 2026-10-17).
  // Canción nueva (reloj del gancho hacia atrás > 1 s): se olvida todo.
  const lk = { b0: null, resets: -1, anchors0: 0, corrBase: 0, lastT: null, locks: 0 }; st.lock = lk;
  const sumCorrMs = () => sab && st.ptr ? new Float64Array(sab, st.ptr + 96, 1)[0] * 1000 : 0;
  const hookT = () => sab && st.ptr ? new Float64Array(sab, st.ptr + 80, 1)[0] : null;
  window.relojAudioMed = (med) => {
    if (!mode || !i32) return med;
    const h = window.hw60 || {}, T = hookT();
    if (T !== null && lk.lastT !== null && T < lk.lastT - 1) { lk.b0 = null; lk.corrBase = sumCorrMs(); lk.resets = -1; }
    if (T !== null) lk.lastT = T;
    if (lk.b0 === null && h.anchorResets !== lk.resets) { lk.resets = h.anchorResets; lk.anchors0 = h.anchors; lk.resetT = T; }
    if (lk.b0 === null) {
      if (T === null || T <= 0.5) { lk.anchors0 = h.anchors; lk.resetT = T; return med; }
      if (T - lk.resetT < 2.5) return med; // 2,5 s de canción sin reinicio del ancla // ancla sólo con la canción ya sonando
      if (h.anchors - lk.anchors0 < 40) return med;   // sin ancla fija todavía: dibuja como siempre y no escribe
      lk.b0 = med - (sumCorrMs() - lk.corrBase); lk.locks++; lk.lockAt = T; lk.lockMed = med;
    }
    return lk.b0;
  };
  // Estadísticas del gancho (para las pruebas): window.relojAudio.stats()
  st.stats = () => {
    if (!sab || !st.ptr) return null;
    const d = new Float64Array(sab, st.ptr + 56, 6), n = new Int32Array(sab, st.ptr + 104, 10);
    const [calls, nCorr, nNeg, nZero, nStale, nBig, nCapped, nStill, nMeas, nFrozen] = n;
    return { mode: Atomics.load(i32, 1), lastErrMs: d[0] * 1000, meanAbsErrMs: d[1] * 1000 / Math.max(1, nMeas),
      meanErrMs: new Float64Array(sab, st.ptr + 144, 1)[0] * 1000 / Math.max(1, nMeas), maxAbsErrMs: d[2] * 1000, lastT: d[3], lastD: d[4], sumCorrMs: d[5] * 1000, calls, nCorr, nNeg, nZero, nStale, nBig, nCapped, nStill, nMeas, nFrozen, writes: st.writes, lock: { ...lk } };
  };
})();
