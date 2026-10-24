// Diagnóstico de viabilidad (Claude 2026-10-16). SÓLO para pruebas; no va a la página publicada.
// ?sinvisual=1        → mientras corre la canción, el motor de GH3 NO arma la escena (ni visibilidad, ni materiales,
//                       ni comandos de dibujo): se usa la llave propia del juego (StopRendering_C / StartRendering_C,
//                       byte 0x828EF689). El hilo de dibujo del juego lee esa llave al empezar cada cuadro (sub_823812B8,
//                       campo +555) y, apagada, saltea la escena entera (sub_82381A48). Lógica, juicio, reloj y audio siguen.
// ?sinvisual=desde:S  → igual, pero recién desde el segundo S de la canción (para comparar antes/después en una corrida).
// ?sinvisual=siempre  → desde que hay memoria del juego (también menús: pantalla congelada).
// Al terminar la canción (el reloj deja de avanzar) se devuelve el valor original y el juego vuelve a dibujar.
(() => {
  const v = new URLSearchParams(location.search).get('sinvisual');
  if (!v || v === '0') return;
  const ADDR = 0x828EF689, siempre = v === 'siempre', desde = v.startsWith('desde:') ? Number(v.slice(6)) * 1000 : 0;
  const st = window.gh3SinVisual = {modo: v, activo: false, escrituras: 0, desdeMs: null, hastaMs: null, original: null};
  let M = null, u8 = null, seg = null, lastClock = null, lastMove = 0;
  setInterval(() => {
    const w = window.g1worker;
    if (!w || M) return;
    if (!w.__gh3sv) { w.__gh3sv = 1; w.addEventListener('message', e => { if (e.data?.type === 'g1Mem' && !M) { M = e.data; u8 = new Uint8Array(M.sab); seg = new Uint32Array(M.sab, M.seg, 256); } }); }
    w.postMessage({type: 'memReq'});
  }, 1000);
  const host = () => (seg[ADDR >>> 24] + ADDR) >>> 0;
  setInterval(() => {
    if (!M) return;
    const h = host(); if (h >= u8.length) return;
    let clock = null; try { clock = window.gh3Song?.clock?.() ?? null; } catch {}
    const now = performance.now();
    if (clock != null && clock !== lastClock) { lastClock = clock; lastMove = now; }
    const enCancion = clock != null && clock > desde && now - lastMove < 1500;
    const quiero = siempre || enCancion;
    if (quiero) {
      if (!st.activo) { st.activo = true; st.original = u8[h]; st.desdeMs = clock; }
      if (u8[h] !== 0) { u8[h] = 0; st.escrituras++; }
    } else if (st.activo) {
      st.activo = false; st.hastaMs = clock; u8[h] = st.original ?? 1;
    }
  }, 8);
})();
