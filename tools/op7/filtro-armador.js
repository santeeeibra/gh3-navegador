// Claude 2026-10-22 (alta100 op7): filtro de autopista60 para el worker ARMADOR (r5snap-armador.js).
// Desde op2/op5 los dibujos se preparan en el armador, no en el hilo CP donde corre autopista60-tap.js, así que el filtro
// del tap no llegaba. Misma regla que tools/autopista60/tap.mjs (__hw60DrawFilter): mientras la capa late (overlayReady,
// 350 ms) se sacan del dibujo del juego la pista, gemas, compases, colas, botones y llamaradas que dibuja la capa.
// Sin la condición «hay pista en este cuadro» del tap (aquí no se conoce antes de armar): la capa solo late con pista.
(() => {
  const WANTED = new Set(['80708BD1B82638B0', '582ABCF5FF619A55', '87D4CAE67E72C501', '19815E13AC0DCC92', '27643FEB20B8CBBD', 'C6F0B6F9BA5A2B12', '10CA3B730086027C', '035C1CB9583C0C7E']);
  const hex = (n) => n.toString(16).toUpperCase().padStart(16, '0');
  const chan = new BroadcastChannel('hw60');
  let enabled = true, overlayUntil = 0;
  chan.onmessage = (e) => {
    const m = e.data;
    if (m?.type === 'tapEnable') { enabled = !!m.on; if (!enabled) overlayUntil = 0; }
    if (m?.type === 'overlayReady') overlayUntil = m.on ? m.at + 350 : 0;
  };
  globalThis.__hw60DrawFilter = (d) => !(enabled && performance.timeOrigin + performance.now() < overlayUntil && WANTED.has(hex(d.vs)));
})();
