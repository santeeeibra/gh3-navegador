// R5L: consumidor de PRUEBA (Node o Worker). Cuenta cuadros, guarda algunos mini-archivos y comprueba
// que api.readPhysical lea rangos. No dibuja. Node: G1_R5LIVE_CONSUMER=<este archivo>, R5L_TEST_OUT=<carpeta>.
(function () {
  const st = { frames: 0, bytes: 0, saved: 0, readOk: 0, readFail: 0, t0: Date.now() };
  globalThis.__r5liveTest = st;
  const node = typeof process === 'object' && process.versions && process.versions.node;
  const out = node ? process.env.R5L_TEST_OUT : '';
  const keep = new Set([0, 1, 2, 50, 200, 600, 1200, 2400, 4800, 7200, 9000]);
  globalThis.__r5liveConsumer = (bytes, info, api) => {
    st.frames++; st.bytes += bytes.length;
    // Lectura de memoria: primer rango phys/bytes pedible (cabecera del frontbuffer no; solo prueba de acceso).
    try { const v = api.readPhysical(0x00100000, 4096); if (v.length === 4096) st.readOk++; else st.readFail++; } catch (e) { st.readFail++; }
    if (node && out && keep.has(info.seq)) {
      const fs = require('fs'), path = require('path');
      fs.mkdirSync(out, { recursive: true });
      fs.writeFileSync(path.join(out, `live-${String(info.seq).padStart(5, '0')}-s${info.swap}.r5f`), bytes);
      st.saved++;
    }
    if (st.frames <= 3 || st.frames % 600 === 0)
      console.error('[r5live-test] ' + JSON.stringify({ ...info, len: bytes.length, ...st, wallS: (Date.now() - st.t0) / 1000 }));
  };
})();
