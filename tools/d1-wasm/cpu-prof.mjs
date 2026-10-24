// Perfil de CPU de TODOS los hilos (workers y pthreads anidados) de un Edge lanzado con --remote-debugging-port.
// Uso: const p=await startCpuProfile(port); ...; await p.stop(dir) -> escribe <dir>/cpu-<n>.cpuprofile + cpu-targets.json
export async function startCpuProfile(port, intervalUs = 1000) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map();
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}, sessionId) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params, sessionId })); });
  const { result } = await send('Target.getTargets');
  const targets = result.targetInfos.filter(t => t.type === 'worker' || t.type === 'shared_worker' || t.type === 'page');
  const sessions = [];
  for (const t of targets) {
    const a = await send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const s = a.result?.sessionId; if (!s) continue;
    await send('Profiler.enable', {}, s);
    await send('Profiler.setSamplingInterval', { interval: intervalUs }, s);
    await send('Profiler.start', {}, s);
    sessions.push({ s, t });
  }
  return {
    count: sessions.length,
    async stop(dir) {
      const fs = await import('node:fs'); const info = [];
      for (const [i, { s, t }] of sessions.entries()) {
        const r = await send('Profiler.stop', {}, s);
        if (!r.result?.profile) continue;
        fs.writeFileSync(`${dir}/cpu-${i}.cpuprofile`, JSON.stringify(r.result.profile));
        info.push({ file: `cpu-${i}.cpuprofile`, type: t.type, url: t.url, title: t.title });
      }
      fs.writeFileSync(`${dir}/cpu-targets.json`, JSON.stringify(info, null, 1));
      ws.close(); return info;
    }
  };
}
