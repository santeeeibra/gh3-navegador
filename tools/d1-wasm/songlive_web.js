// Canción + R5L vivo (Claude, 2026-10-11, pedido de Codex): copia de r6_web.js (audio R6, C1, g1Mem, plan_clear)
// que además pasa r5frame/r5live/r5liveconsumer/r5livemax como d4_web.js. Usado solo por tools/d1-wasm/songlive-link.sh.
// Paso D4 (--pre-js): el programa corre dentro de un Worker creado por artifacts/d1-wasm/d4/index.html.
// La página manda los archivos de la carpeta del juego (objetos File: se leen en esta PC, no se suben)
// y este código los monta con WORKERFS en /game (solo lectura). /data queda en memoria (MEMFS).
// Mensajes a la página: {type:'log'|'mark'|'mem'|'exit', ...}.
if (!ENVIRONMENT_IS_PTHREAD && ENVIRONMENT_IS_WORKER) {
  const t0 = performance.now();
  const post = (m) => self.postMessage({ t: (performance.now() - t0) / 1000, ...m });
  const q = new URLSearchParams(self.location.search);
  Module['arguments'] = ['/game', '/data', q.get('seconds') || '10', q.get('log') || 'info', q.get('gpu') || 'none', q.get('audio') || 'silent', q.get('xma') || 'decode', q.get('press') || '-'];
  Module['print'] = (text) => post({ type: 'log', text });
  Module['printErr'] = (text) => post({ type: 'log', text });
  Module['onExit'] = (code) => post({ type: 'exit', code });
  Module['onAbort'] = (what) => post({ type: 'exit', code: 'abort', what: String(what) });
  let files = null, waiting = null;
  self.onmessage = (e) => {
    // G1e: botón de la página -> pulsación en vivo del mando programable.
    if (e.data?.type === 'r3cAck') { if (Module['_r3c_ack']) Module['_r3c_ack'](); return; }
    // Canción híbrida: la memoria crece después del arranque; la página pide la vista actual para leer el reloj.
    if (e.data?.type === 'pressClear') { if (runtimeInitialized && Module['_g1e_plan_clear']) Module['_g1e_plan_clear'](); return; }
    if (e.data?.type === 'memReq') { if (!runtimeInitialized) return; try { self.postMessage({ type: 'g1Mem', sab: wasmMemory.buffer, seg: Module['_g1_seg_table'] ? Module['_g1_seg_table']() >>> 0 : 0 }); } catch {} return; }
    if (e.data?.type === 'press') { if (Module['_g1e_press']) Module['_g1e_press'](e.data.buttons | 0, e.data.ms | 0); return; }
    if (e.data?.type !== 'files') return;
    files = e.data.files;
    if (waiting) waiting();
  };
  const mount = () => {
    FS.mkdir('/game');
    FS.mount(WORKERFS, { blobs: files.map((f) => ({ name: f.name, data: f.data })) }, '/game');
    FS.mkdir('/data');
    post({ type: 'mark', what: 'montado', files: files.length });
  };
  Module['preRun'] = [() => {
    if (q.get('cpwait')) ENV.G1_CP_WAIT = q.get('cpwait');  // R2c: política de espera del CP
    if (q.get('r3ayield')) ENV.G1_R3A_YIELD = q.get('r3ayield');  // R3a: solo prueba
    if (q.get('r3acheck')) ENV.G1_R3A_CHECK = q.get('r3acheck');
    // R3b/R3c: CP asíncrono, presupuesto, backend ocupado simulado y latido WebGPU de prueba.
    for (const [k, e] of [['waitmulti', 'G1_WAITMULTI'], ['audiotap', 'G1_AUDIO_TAP'], ['cpasync', 'G1_CP_ASYNC'], ['r3bbudget', 'G1_R3B_BUDGET_US'], ['r3bpkts', 'G1_R3B_BUDGET_PKTS'], ['r3bfake', 'G1_R3B_FAKE_PENDING'], ['r3c', 'G1_R3C'], ['r5snap', 'G1_R5SNAP'], ['r5select', 'G1_R5SNAP_SELECT'], ['r5test', 'G1_R5SNAP_TEST'], ['r5max', 'G1_R5SNAP_MAX'], ['r5consumer', 'G1_R5SNAP_CONSUMER'], ['padtype', 'G1_PADTYPE'], ['r5frame', 'G1_R5FRAME'], ['r5framemax', 'G1_R5FRAME_MAX'], ['r5live', 'G1_R5LIVE'], ['r5liveconsumer', 'G1_R5LIVE_CONSUMER'], ['r5livemax', 'G1_R5LIVE_MAX'], ['r5optcheck', 'G1_R5OPT_CHECK'], ['r5lite', 'G1_R5LITE'], ['r5livevs', 'G1_R5LIVE_VS']]) if (q.get(k)) ENV[e] = q.get(k);
    if (files) return mount();
    addRunDependency('gh3-files');
    waiting = () => { mount(); removeRunDependency('gh3-files'); };
  }];
  // R5F (como d4_web.js): el hilo del CP manda las tandas del archivo de captura (callHandler) -> página.
  Module['r5frame'] = (chunks, name, ok, bytes) => self.postMessage({ type: 'r5frame', chunks, name, ok, bytes }, chunks);
  Module['onRuntimeInitialized'] = () => {
    post({ type: 'mark', what: 'wasm listo' });
    // C1: la página escribe teclado/mando directo en la memoria compartida (gh3-input.js).
    try { self.postMessage({ type: 'g1eInput', sab: wasmMemory.buffer, ptr: Module['_g1e_live_ptr'](), seg: Module['_g1_seg_table'] ? Module['_g1_seg_table']() >>> 0 : 0 }); }
    catch (e) { post({ type: 'log', text: '[c1] sin mando en vivo: ' + e }); }
    // R6: la página reproduce la cola de audio (memoria compartida) con un AudioWorklet.
    if (q.get('audiotap') === '1') {
      try { self.postMessage({ type: 'r6AudioRing', sab: wasmMemory.buffer, ptr: Module['_g1_audio_ring']() }); }
      catch (e) { post({ type: 'log', text: '[r6-audio-web] sin cola: ' + e }); }
    }
  };
  // R3c: imagen del latido de prueba que manda el hilo del CP (callHandler) -> página. La página
  // confirma con {type:'r3cAck'} y eso libera un lugar de la cola acotada (r3c_ack).
  Module['r3cFrame'] = (bitmap, idx, r, g, b) => self.postMessage({ type: 'r3cFrame', bitmap, idx, color: [r, g, b] }, [bitmap]);
  // Memoria lineal de wasm (incluye la reserva guest ya tocada) cada segundo.
  setInterval(() => { if (typeof wasmMemory !== 'undefined') post({ type: 'mem', bytes: wasmMemory.buffer.byteLength }); }, 1000);
  post({ type: 'mark', what: 'worker inicio' });
}
