// Claude 2026-10-15 (paso 4, memoria iPhone): volcado memory-infra de Edge (lanzado con --remote-debugging-port).
// Devuelve, por proceso, el tamaño de cada parte interna (v8 = JavaScript y código wasm, partition_alloc/malloc = C++,
// blink_gc, gpu, shared_memory, ...) para saber qué ocupa la memoria del proceso del juego.
export async function volcadoMemoria(port, archivo, plazoMs = 25000) {
  return Promise.race([volcar(port, archivo), new Promise((_, j) => setTimeout(() => j(Error('volcado sin respuesta en ' + plazoMs / 1000 + ' s')), plazoMs))]);
}
async function volcar(port, archivo) {
  const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(v.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const wait = new Map(); let fin = null; const finP = new Promise(r => { fin = r; });
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } else if (d.method === 'Tracing.tracingComplete') fin(d.params); };
  const send = (method, params = {}) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({id: n, method, params})); });
  await send('Tracing.start', {traceConfig: {includedCategories: ['disabled-by-default-memory-infra'], recordMode: 'recordAsMuchAsPossible', memoryDumpConfig: {triggers: []}}, transferMode: 'ReturnAsStream'});
  const d = await send('Tracing.requestMemoryDump', {deterministic: false, levelOfDetail: 'light'});
  await send('Tracing.end');
  const {stream} = await finP; let txt = '';
  for (;;) { const r = await send('IO.read', {handle: stream, size: 1 << 22}); const c = r.result; txt += c.base64Encoded ? Buffer.from(c.data, 'base64').toString() : c.data; if (c.eof) break; }
  await send('IO.close', {handle: stream}); ws.close();
  if (archivo) (await import('node:fs')).writeFileSync(archivo, txt);
  const ev = (JSON.parse(txt).traceEvents || []).filter(e => e.ph === 'v' && e.args?.dumps?.allocators);
  const procesos = {};
  for (const e of ev) {
    const al = e.args.dumps.allocators, partes = {};
    for (const [nombre, a] of Object.entries(al)) {
      const prof = nombre.split('/').length, sz = a.attrs?.size?.value ? parseInt(a.attrs.size.value, 16) / 1048576 : 0;
      if (prof <= 3 && sz >= 5 && !nombre.startsWith('global/') && !nombre.includes('0x')) partes[nombre] = Math.round(sz);
    }
    const pt = e.args.dumps.process_totals || {}, hx = k => pt[k] ? Math.round(parseInt(pt[k], 16) / 1048576) : null, total = hx('private_footprint_bytes') ?? hx('resident_set_bytes');
    procesos[e.pid] = {huellaPrivadaMB: total, partesMB: partes};
  }
  return {ok: d.result?.success ?? null, procesos};
}
