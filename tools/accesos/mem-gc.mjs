// Claude 2026-10-16 (paso 4, memoria iPhone): fuerza recolección de basura (HeapProfiler.collectGarbage) en todos los hilos por CDP.
// Sirve para separar memoria «basura que el navegador todavía no juntó» de memoria realmente en uso.
export async function forzarGc(port, plazoMs = 4000) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({id: n, method, params, sessionId})); setTimeout(() => { if (wait.has(n)) { wait.delete(n); r({timeout: true}); } }, plazoMs); });
  let ok = 0, sin = 0; const vistos = new Set();
  const recorrer = async (sessionId, prof) => {
    const {result} = await send('Target.getTargets', {}, sessionId);
    for (const t of result?.targetInfos || []) {
      if (vistos.has(t.targetId) || !['page', 'worker', 'shared_worker', 'service_worker'].includes(t.type)) continue; vistos.add(t.targetId);
      const a = await send('Target.attachToTarget', {targetId: t.targetId, flatten: true}, sessionId); const s = a.result?.sessionId; if (!s) continue;
      const g = await send('HeapProfiler.collectGarbage', {}, s); g.timeout ? sin++ : ok++;
      if (prof < 3) await recorrer(s, prof + 1).catch(() => {});
    }
  };
  await recorrer(undefined, 0); ws.close(); return {hilos: ok, sinRespuesta: sin};
}
