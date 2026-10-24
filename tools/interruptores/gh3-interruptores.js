// Claude 2026-10-17: lado página de los interruptores del juego (tools/interruptores/gh3_sw.h). Sólo para medir.
// ?sinpublico=1 → enable_crowd_models_cfunc siempre «false»; ?sinluces=1 → LightShow_SetActive siempre «false»;
// ?menoslod=1 → ToggleLOD on, SetViewerLODDist ×0,25, AllowBoneLOD on. Se escribe antes de que cargue el escenario.
(() => {
  const q = new URLSearchParams(location.search);
  const want = {crowd: q.get('sinpublico') === '1', light: q.get('sinluces') === '1', lod: q.get('menoslod') === '1'};
  const st = window.gh3Sw = {want, ptr: 0, conectado: false};
  let sab = null;
  const connect = () => {
    if (!sab || !st.ptr || st.conectado) return;
    const i = new Int32Array(sab, st.ptr, 13);
    Atomics.store(i, 2, want.crowd ? 1 : 0); Atomics.store(i, 3, want.light ? 1 : 0); Atomics.store(i, 4, want.lod ? 1 : 0);
    Atomics.store(i, 1, 1); st.conectado = true;
    st.leer = () => { const n = ['crowd', 'light', 'lod', 'nCrowd', 'nCrowdTrue', 'nLight', 'nLightTrue', 'nToggle', 'nViewer', 'nBone', 'ticks']; const o = {}; n.forEach((k, j) => o[k] = Atomics.load(i, 2 + j)); return o; };
  };
  const prev = window.c1StrumAttach;
  window.c1StrumAttach = (s, p) => { sab = s; connect(); return prev?.(s, p); };
  new BroadcastChannel('hw60').addEventListener('message', (e) => {
    if (e.data?.type === 'gh3swMemory' && !st.ptr) { st.ptr = e.data.ptr >>> 0; connect(); }
  });
})();
