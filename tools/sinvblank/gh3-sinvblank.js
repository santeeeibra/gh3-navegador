// Claude 2026-10-18: lado página del interruptor ?sinvblank=1 (tools/sinvblank/sin_vblank.h). Sin parámetro = apagado (sólo mide).
(() => {
  const q = new URLSearchParams(location.search), mode = q.get('sinvblank') === '1' ? 1 : 0;
  const st = { mode, ptr: 0 }; window.sinVblank = st;
  let sab = null, i32 = null;
  const connect = () => { if (!sab || !st.ptr || i32) return; i32 = new Int32Array(sab, st.ptr, 12); Atomics.store(i32, 1, mode); Atomics.store(i32, 2, 1); };
  const prev = window.c1StrumAttach;
  window.c1StrumAttach = (s, p) => { sab = s; connect(); return prev?.(s, p); };
  new BroadcastChannel('hw60').addEventListener('message', (e) => { if (e.data?.type === 'sinVblankMemory' && !st.ptr) { st.ptr = e.data.ptr >>> 0; connect(); } });
  st.stats = () => { if (!i32) return null; const d = new Float64Array(sab, st.ptr + 48, 2);
    return { enabled: Atomics.load(i32, 1), calls: i32[3], late: i32[4], skips: i32[5], n20: i32[6], n34: i32[7], n50: i32[8], nAll: i32[9], vbMs: d[0], qMs: d[1] }; };
})();
