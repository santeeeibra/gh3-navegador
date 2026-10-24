// Claude 2026-10-15 (paso 4, memoria iPhone): memoria JavaScript de cada hilo (página, workers, pthreads) por CDP.
// Runtime.getHeapUsage: usedSize/totalSize = montículo JS; backingStorageSize = ArrayBuffers (buffers grandes fuera del montículo).
// Los hilos que están dentro del wasm sin volver al bucle de eventos no contestan: se anotan como «sin respuesta».
export async function memoriaJs(port, plazoMs = 4000) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({id: n, method, params, sessionId})); setTimeout(() => { if (wait.has(n)) { wait.delete(n); r({timeout: true}); } }, plazoMs); });
  const MB = x => x == null ? null : Math.round(x / 1048576);
  const salida = [], vistos = new Set();
  const recorrer = async (sessionId, prof) => {
    const {result} = await send('Target.getTargets', {}, sessionId);
    for (const t of result?.targetInfos || []) {
      if (vistos.has(t.targetId) || !['page', 'worker', 'shared_worker', 'service_worker'].includes(t.type)) continue; vistos.add(t.targetId);
      const a = await send('Target.attachToTarget', {targetId: t.targetId, flatten: true}, sessionId); const s = a.result?.sessionId; if (!s) continue;
      const h = await send('Runtime.getHeapUsage', {}, s);
      salida.push({tipo: t.type, url: (t.url || '').split('/').pop().split('?')[0].slice(0, 60), heapUsadoMB: MB(h.result?.usedSize), heapTotalMB: MB(h.result?.totalSize), buffersMB: MB(h.result?.backingStorageSize), sinRespuesta: !!h.timeout});
      // Workers anidados (los pthreads cuelgan del worker principal del juego).
      if (prof < 3) { await send('Target.setAutoAttach', {autoAttach: false, waitForDebuggerOnStart: false, flatten: true}, s); await recorrer(s, prof + 1).catch(() => {}); }
    }
  };
  await recorrer(undefined, 0); ws.close();
  const sum = k => salida.reduce((x, y) => x + (y[k] || 0), 0);
  return {hilos: salida.length, sinRespuesta: salida.filter(x => x.sinRespuesta).length, heapTotalMB: sum('heapTotalMB'), buffersMB: sum('buffersMB'), detalle: salida};
}
