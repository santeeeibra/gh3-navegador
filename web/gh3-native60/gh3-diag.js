// Diagnóstico de arranque y audio para el celular (Claude, copia aislada artifacts/d1-wasm/mobilediag).
// Cargar en <head> ANTES de cualquier otro script (envuelve Worker). Muestra la etapa actual arriba al centro, guarda
// un registro en localStorage que sobrevive a que Safari cierre la pestaña, anota el error exacto si algo se detiene,
// activa el sonido dentro del toque de Jugar y lo recupera al volver de otra aplicación. Memoria wasm y cortes de audio.
// Etapas: página → preparando archivos → cargando programa → compilando → iniciando motor → menú → entrando a la
// canción → canción. El worker principal (gh3-web.js del paquete) avisa descarga/compilación con mensajes 'diag'.
(() => {
  const KEY = 'gh3diag-v1', MAX_EVENTS = 300;
  const STAGES = { pagina: 'Página abierta', preparando: 'Preparando archivos', programa: 'Cargando el programa',
    compilando: 'Compilando el programa', motor: 'Iniciando el motor', menu: 'Menú del juego', entrando: 'Entrando a la canción',
    cancion: 'Canción en curso', detenido: 'Se detuvo' };
  const ORDER = Object.keys(STAGES);
  const t0 = performance.now(), sec = () => +((performance.now() - t0) / 1000).toFixed(2);
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const prev = load();
  const S = {
    id: Date.now().toString(36), started: new Date().toISOString(), ua: navigator.userAgent,
    screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio }, isolated: self.crossOriginIsolated,
    stage: 'pagina', stages: { pagina: 0 }, events: [], errors: [], audio: {}, mem: {}, beat: null, ended: null,
    previous: prev && prev.id ? summarize(prev) : null,
  };
  window.gh3Diag = S;
  function summarize(p) {
    const lost = !p.ended;
    return { id: p.id, started: p.started, stage: p.stage, lastBeat: p.beat, ended: p.ended, errors: (p.errors || []).slice(-5), tail: p.tail,
      verdict: lost ? `La sesión anterior se cortó sin aviso en «${STAGES[p.stage] || p.stage}» (último registro a los ${p.beat?.t ?? '?'} s). ` +
        'Si Safari mostró «Ocurrió un problema» o recargó sola, lo más probable es falta de memoria.' : 'La sesión anterior terminó: ' + p.ended };
  }
  let saveTimer = 0;
  function save(now) {
    const write = () => { saveTimer = 0; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
    if (now) { clearTimeout(saveTimer); write(); } else if (!saveTimer) saveTimer = setTimeout(write, 500);
  }
  function ev(what, extra) { S.events.push({ t: sec(), what, ...extra }); if (S.events.length > MAX_EVENTS) S.events.splice(0, S.events.length - MAX_EVENTS); save(); render(); }
  function stage(name, cycle = false) {
    if (S.stage === 'detenido' || name === S.stage || !cycle && ORDER.indexOf(name) <= ORDER.indexOf(S.stage)) return;
    S.stage = name; S.stages[name] = sec(); ev('etapa: ' + STAGES[name]); save(true);
  }
  function fail(kind, message, extra) {
    const e = { t: sec(), stage: S.stage, kind, message: String(message).slice(0, 4000), ...extra };
    S.errors.push(e); if (S.errors.length > 50) S.errors.shift();
    ev('ERROR ' + kind + ': ' + e.message.slice(0, 200)); save(true); render(true);
  }
  function stop(why) { if (S.ended) return; S.ended = why; if (S.stage !== 'detenido') { S.stoppedIn = S.stage; S.stage = 'detenido'; S.stages.detenido = sec(); } save(true); render(true); }

  // ---- errores de la página ----
  function optionalToolbar(value) {
    try { const u = new URL(value, location.href); return u.hostname === 'vercel.live' && u.pathname.startsWith('/_next-live/'); } catch { return false; }
  }
  addEventListener('error', (e) => {
    const resource = e.target?.src || e.filename;
    if (resource && optionalToolbar(resource)) return ev('aviso opcional: no cargó la barra de Vercel', { resource });
    if (e.target && e.target !== window && e.target.src) return fail('recurso', 'No cargó ' + e.target.src);
    fail('página', e.message, { file: e.filename, line: e.lineno, col: e.colno, stack: e.error?.stack });
  }, true);
  addEventListener('unhandledrejection', (e) => fail('promesa', e.reason?.stack || e.reason?.message || e.reason));
  const cerr = console.error;
  console.error = (...a) => { try { S.consoleErrors = (S.consoleErrors || []).concat(a.map(String).join(' ').slice(0, 500)).slice(-20); save(); } catch {} return cerr.apply(console, a); };

  // ---- worker del juego ----
  const W = window.Worker;
  window.Worker = function (url, opts) {
    const w = new W(url, opts), main = opts?.name === 'gh3-main', name = String(url).split('?')[0];
    w.addEventListener('error', (e) => fail(main ? 'worker del juego' : 'worker ' + name, e.message || 'error sin mensaje', { file: e.filename, line: e.lineno }));
    w.addEventListener('messageerror', () => fail('worker ' + name, 'mensaje ilegible (messageerror)'));
    if (main) { stage('programa'); ev('worker del juego creado'); w.addEventListener('message', onGame); }
    return w;
  };
  window.Worker.prototype = W.prototype;
  function onGame(e) {
    const m = e.data; if (!m || typeof m !== 'object') return;
    if (m.type === 'diag') {
      if (m.what === 'fetch-resp' && /\.wasm/.test(m.url)) ev('programa recibido', { status: m.status, bytes: m.size });
      else if (/Streaming-error$/.test(m.what)) ev('aviso (Emscripten reintenta sin streaming): ' + String(m.error).slice(0, 300));
      else if (m.what === 'fetch-error' || /-error$/.test(m.what)) fail('carga/compilación', m.error || m.what, { url: m.url });
      else if (/^wasm-.*-start$/.test(m.what)) { stage('compilando'); ev(m.what); }
      else if (/^wasm-.*-done$/.test(m.what)) ev(m.what);
      else if (m.what === 'worker-error' || m.what === 'worker-rejection') fail('worker del juego', m.error, { file: m.file, line: m.line });
      else ev(m.what);
    } else if (m.type === 'mark') {
      if (m.what === 'wasm listo') stage('motor');
      if (/^(worker inicio|wasm listo|montado)$/.test(m.what)) ev('marca: ' + m.what);
    } else if (m.type === 'mem') {
      S.mem.wasmBytes = m.bytes; S.mem.wasmPeak = Math.max(S.mem.wasmPeak || 0, m.bytes);
    } else if (m.type === 'log') {
      const t = m.text; S.lastLogT = sec();
      if (/GH3_Intro\.bik/i.test(t)) stage('menu');
      else if (/_song\.pak\.xen/i.test(t)) { stage('menu'); stage('entrando'); }
      if (/\b(abort|Aborted|RuntimeError|out of memory|OOM|unreachable)\b/i.test(t)) fail('motor (registro)', t.slice(0, 600));
    } else if (m.type === 'exit') {
      if (m.code !== 0) fail('fin del motor', `código ${m.code}${m.what ? ': ' + m.what : ''}`);
      stop('motor terminó (código ' + m.code + (m.what ? ': ' + m.what : '') + ')');
    }
  }

  // ---- sonido ----
  // iOS: el AudioContext se crea en el primer toque (index.html, captura). Con audioSession 'playback' suena aunque
  // el iPhone esté en silencio. En cada toque, si el contexto no corre, se reanuda dentro del gesto.
  try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; S.audio.session = navigator.audioSession.type; } else S.audio.session = 'no disponible'; } catch (e) { S.audio.session = 'error: ' + e.message; }
  let hooked = null;
  function audioWatch() {
    const ctx = window.r6ctx; if (!ctx || hooked === ctx) return;
    hooked = ctx; S.audio.created = sec(); S.audio.state = ctx.state; ev('sonido: contexto creado (' + ctx.state + ')');
    ctx.addEventListener('statechange', () => { S.audio.state = ctx.state; ev('sonido: ' + ctx.state); if (ctx.state === 'running') hideWake(); });
  }
  const resumeInGesture = () => {
    audioWatch(); const ctx = window.r6ctx;
    if (ctx && ctx.state !== 'running') ctx.resume().then(() => { ev('sonido reanudado en toque'); afterResume(); }, (e) => fail('sonido', 'resume(): ' + e.message));
  };
  // Después del clic de index.html (que crea el contexto) — por eso escucha en burbuja, no en captura.
  addEventListener('pointerup', resumeInGesture); addEventListener('click', resumeInGesture); addEventListener('touchend', resumeInGesture);
  function afterResume() { try { window.r6node?.port.postMessage({ type: 'reset' }); } catch {} }  // colchón de audio de nuevo en su lugar
  let hiddenAt = null;
  async function onReturn() {
    if (hiddenAt === null) return;
    const away = sec() - hiddenAt; hiddenAt = null; ev('volvió a la página tras ' + away.toFixed(1) + ' s');
    const ctx = window.r6ctx; if (!ctx) return;
    S.audio.returns = (S.audio.returns || 0) + 1;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
    setTimeout(() => {
      if (ctx.state === 'running') { S.audio.autoResumed = (S.audio.autoResumed || 0) + 1; ev('sonido recuperado solo'); afterResume(); }
      else { ev('sonido sigue ' + ctx.state + ': pide un toque'); showWake(); }
    }, 600);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = sec(); ev('página oculta (otra app / pantalla apagada)'); save(true); } else onReturn();
  });
  // Cierre o recarga normal = sesión terminada (un cierre de Safari por memoria NO dispara pagehide).
  addEventListener('pagehide', (e) => { ev('pagehide' + (e.persisted ? ' (en caché)' : '')); S.ended ??= 'página cerrada o recargada'; save(true); });
  addEventListener('pageshow', (e) => { if (e.persisted) { if (S.ended === 'página cerrada o recargada') S.ended = null; ev('pageshow desde caché'); hiddenAt ??= sec(); onReturn(); } });

  // ---- latido: memoria, audio, renderer, cuelgues ----
  addEventListener('gh3stage', ({detail:d}) => {
    const mapped = { preview: 'menu', loadStart: 'entrando', levelConfirmed: 'entrando', songPlaying: 'cancion' }[d?.stage];
    if (mapped) { stage(mapped, true); ev('señal de etapa: ' + d.stage, { song: d.song, at: d.at }); }
  });
  // Claude 2026-10-13 (B1): velocidad del juego medida con contadores del juego, no con imágenes (idea de lab-speed.js
  // de Budokai). Juego % = swaps del juego por segundo / 60; reloj % = avance del reloj de la canción / tiempo real.
  // Ventana de ~5 s; en canción también promedio y peor ventana. Imágenes/s va aparte.
  S.device = { cores: navigator.hardwareConcurrency ?? null, memoryGB: navigator.deviceMemory ?? null };
  S.speed = {};
  const speedWin = [];
  let songSpeed = null;
  function speedTick(clock) {
    const d4 = window.d4 || {}, swap = d4.songRenderer?.swap, now = performance.now();
    speedWin.push({ now, swap: Number.isFinite(swap) ? swap : null, clock: Number.isFinite(clock) ? clock : null, img: d4.songPresented || 0 });
    while (speedWin.length > 2 && now - speedWin[1].now >= 5000) speedWin.shift();
    const a = speedWin[0], b = speedWin.at(-1), dt = (b.now - a.now) / 1000;
    if (dt < 1.5) return;
    const r = (v) => Math.round(v * 10) / 10, sp = S.speed;
    sp.swapsS = a.swap !== null && b.swap !== null && b.swap >= a.swap ? r((b.swap - a.swap) / dt) : null;
    if (sp.swapsS === null && S.governor?.medidas?.swapsJuegoPorSeg != null) sp.swapsS = S.governor.medidas.swapsJuegoPorSeg;
    sp.juegoPct = sp.swapsS === null ? null : Math.round(sp.swapsS / 60 * 100);
    sp.relojPct = S.stage === 'cancion' && a.clock !== null && b.clock !== null && b.clock > a.clock ? Math.round((b.clock - a.clock) / 1000 / dt * 100) : null;
    sp.imgS = r((b.img - a.img) / dt);
    if (S.stage !== 'cancion') { songSpeed = null; return; }
    if (!songSpeed) songSpeed = { now, swap: b.swap, clock: b.clock };
    const st = (now - songSpeed.now) / 1000;
    if (st >= 1.5) {
      if (b.swap !== null && songSpeed.swap !== null) sp.cancionJuegoPct = Math.round((b.swap - songSpeed.swap) / st / 60 * 100);
      if (b.clock !== null && songSpeed.clock !== null) sp.cancionRelojPct = Math.round((b.clock - songSpeed.clock) / 1000 / st * 100);
      sp.cancionS = Math.round(st);
    }
    if (sp.juegoPct !== null) sp.peorJuegoPct = Math.min(sp.peorJuegoPct ?? 999, sp.juegoPct);
  }
  let lastAudio = null, songStartAudio = null;
  setInterval(() => {
    audioWatch();
    const clock = window.gh3Song?.clock?.();
    if (!window.gh3Stage && Number.isFinite(clock) && clock !== 0) { stage('menu'); stage('entrando'); stage('cancion'); }
    if (S.stage === 'pagina' && document.body?.classList.contains('loaderStarted')) stage('preparando');
    const a = window.d4?.r6Audio;
    if (a) {
      Object.assign(S.audio, { state: window.r6ctx?.state, played: +(a.played / 48000).toFixed(1), underruns: a.underruns, silentBlocks: a.silentBlocks, skips: a.skips, lagMs: Math.round(a.lag / 48), ratio: a.productionRatio && +a.productionRatio.toFixed(3), outputLatency: a.outputLatency });
      if (S.stage === 'cancion' && !songStartAudio) songStartAudio = { underruns: a.underruns, skips: a.skips };
      if (songStartAudio) { S.audio.songUnderruns = a.underruns - songStartAudio.underruns; S.audio.songSkips = a.skips - songStartAudio.skips; }
      if (lastAudio && a.underruns > lastAudio.underruns) ev('cortes de audio +' + (a.underruns - lastAudio.underruns), { total: a.underruns });
      lastAudio = a;
    }
    S.mem.jsHeap = performance.memory ? performance.memory.usedJSHeapSize : 'no disponible (Safari)';
    const r = window.d4?.songRenderer;
    if (r?.fatal && !S.rendererFatal) { S.rendererFatal = true; fail('gráficos', typeof r.fatal === 'string' ? r.fatal : JSON.stringify(r.fatal)); }
    if (window.d4?.workerError && !S.workerErrorSeen) { S.workerErrorSeen = true; }
    if (window.d4?.exit !== null && window.d4?.exit !== undefined && !S.ended) stop('motor terminó (' + window.d4.exit + ')');
    if (window.gh3Loader?.error && !S.loaderErrorSeen) { S.loaderErrorSeen = true; fail('cargador', window.gh3Loader.error); }
    const quiet = S.lastLogT !== undefined && ['programa', 'compilando', 'motor', 'menu', 'entrando'].includes(S.stage) && document.visibilityState === 'visible' ? sec() - S.lastLogT : 0;
    S.quietS = Math.round(quiet);
    // Claude 2026-10-13: resumen del gobernador móvil (estado, transiciones, métricas separadas, cortes) en el informe guardado.
    if (window.gh3Governor?.summary) try { S.governor = window.gh3Governor.summary(); } catch {}
    // Claude 2026-10-13: últimas líneas del registro del juego (#log), guardadas también para la sesión siguiente si Safari cierra la página.
    const logLines = Array.isArray(window.d4?.log) ? window.d4.log.slice(-400) : (document.getElementById('log')?.textContent || '').split('\n').slice(-400);
    const tail = logLines.filter((l) => l && !/Too few processor cores/.test(l)).slice(-25).map((l) => String(l).slice(0, 200)); if (tail.length) S.tail = tail;
    speedTick(clock);
    S.beat = { t: sec(), stage: S.stage, clockS:Number.isFinite(clock) ? +(clock / 1000).toFixed(1) : null, wasmMB: S.mem.wasmBytes ? Math.round(S.mem.wasmBytes / 1048576) : null, fps: window.d4?.songPresented ?? null };
    save(); render();
  }, 2000);

  // ---- controles táctiles: ocultos hasta que arranca el juego, para no tapar el cargador ----
  window.gh3TouchDeferred = true;
  const touchGate = setInterval(() => {
    if (!window.gh3Touch) return;
    if (!window.gh3Input?.attached) { if (gh3Touch.enabled()) gh3Touch.disable(); return; }
    if (S.touchPref === true || (S.touchPref !== false && window.gh3IsMobile)) gh3Touch.enable(); clearInterval(touchGate);
  }, 300);

  // ---- interfaz ----
  const css = `#gh3Diag{position:fixed;z-index:70;top:calc(env(safe-area-inset-top) + 6px);left:50%;transform:translateX(-50%);max-width:min(420px,calc(100vw - 150px));min-width:0;font:600 11px/1.3 system-ui,sans-serif;color:#fff;background:rgba(20,22,30,.86);border:1px solid #556;border-radius:10px;padding:3px 8px;opacity:.85;-webkit-user-select:none;user-select:none}
#gh3Diag.bad{border-color:#ff6b6b;background:rgba(60,10,14,.92)}#gh3Diag:not(.open) .row{flex-wrap:nowrap}#gh3Diag:not(.open) .row>span:first-child{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}#gh3Diag.open{max-width:min(560px,calc(100vw - 20px));opacity:1}#gh3Diag .row{display:flex;gap:8px;align-items:center;justify-content:space-between}#gh3Diag button{font:inherit;color:#fff;background:#333a4a;border:1px solid #667;border-radius:7px;padding:4px 8px;min-height:30px}
#gh3Diag pre{max-height:50vh;overflow:auto;white-space:pre-wrap;word-break:break-word;font:11px/1.35 ui-monospace,monospace;margin:6px 0;-webkit-user-select:text;user-select:text}
#gh3Wake{position:fixed;inset:0;z-index:80;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6)}#gh3Wake button{font:700 20px system-ui;padding:22px 28px;border-radius:16px;border:0;background:#c4e7a6;color:#142010}`;
  let box = null, open = false, wake = null;
  function ui() {
    if (box || !document.body) return;
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    box = document.createElement('div'); box.id = 'gh3Diag'; document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button')?.dataset.a;
      if (b === 'copy') copy(); else if (b === 'share') share(); else if (b === 'touch') { S.touchPref = !(window.gh3Touch?.enabled()); S.touchPref ? gh3Touch.enable() : gh3Touch.disable(); render(true); }
      else if (b === 'clear') { try { localStorage.removeItem(KEY); } catch {} S.previous = null; render(true); }
      else if (!b) { open = !open; render(true); }
    });
    wake = document.createElement('div'); wake.id = 'gh3Wake'; wake.innerHTML = '<button>🔊 Tocá para reactivar el sonido</button>'; document.body.appendChild(wake);
    wake.addEventListener('click', async () => { const ctx = window.r6ctx; try { await ctx?.resume(); } catch (e) { fail('sonido', 'resume() en toque: ' + e.message); } S.audio.wakeTaps = (S.audio.wakeTaps || 0) + 1; ev('toque para reactivar: ' + ctx?.state); afterResume(); if (ctx?.state === 'running') hideWake(); });
    render(true);
  }
  function showWake() { ui(); if (wake) wake.style.display = 'flex'; }
  function hideWake() { if (wake) wake.style.display = 'none'; }
  let lastRender = 0;
  function render(force) {
    if (!box) return; const now = performance.now(); if (!force && now - lastRender < 500) return; lastRender = now;
    const bad = S.errors.length > 0 || S.stage === 'detenido'; box.classList.toggle('bad', bad); box.classList.toggle('open', open);
    // Sesión A 2026-10-12: el cartel tapa la pantalla; solo aparece si hay un error o con ?diag=1.
    box.style.display = bad || /[?&]diag=1/.test(location.search) ? '' : 'none';
    const since = S.stages[S.stage] ?? 0, mb = S.mem.wasmBytes ? Math.round(S.mem.wasmBytes / 1048576) + ' MB' : '—';
    const au = S.audio.state ? `sonido ${S.audio.state === 'running' ? 'activo' : S.audio.state}${S.audio.underruns !== undefined ? ' · cortes ' + (S.audio.songUnderruns ?? S.audio.underruns) : ''}` : 'sonido sin activar';
    let head = `<div class="row"><span>${bad ? '⚠ ' : ''}${STAGES[S.stage]}${S.stage === 'detenido' ? ' en «' + STAGES[S.stoppedIn] + '»' : ''} · ${(sec() - since).toFixed(0)} s · memoria ${mb}${S.speed.juegoPct != null ? ' · juego ' + S.speed.juegoPct + ' %' : ''} · ${au}${S.quietS > 45 ? ' · sin actividad ' + S.quietS + ' s' : ''}</span><span>${open ? '▲' : '▼'}</span></div>`;
    // Claude 2026-10-12: cerrado = una sola línea (Santi: el cartel ocupaba espacio); el detalle sigue al tocar ▼.
    if (open) head += `<pre>${esc(simple())}\n\n(«Copiar informe» incluye además el detalle técnico)</pre><div class="row"><button data-a="copy">Copiar informe</button><button data-a="share">Compartir</button><button data-a="touch">Controles táctiles: ${window.gh3Touch?.enabled() ? 'sí' : 'no'}</button><button data-a="clear">Borrar anterior</button></div>`;
    box.innerHTML = head;
  }
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  // Claude 2026-10-13: resumen en palabras simples (Santi no es programador); el detalle técnico va debajo.
  function simple() {
    const d4 = window.d4 || {}, frames = d4.songPresented || 0, gov = S.governor, a = S.audio;
    const cortes = a.songUnderruns ?? a.underruns, saltos = a.songSkips ?? a.skips;
    const L = ['RESUMEN', '• Paso actual: ' + (STAGES[S.stage] || S.stage) + ' (hace ' + (sec() - (S.stages[S.stage] ?? 0)).toFixed(0) + ' s)' + (S.quietS > 45 ? ' — parece trabado: ' + S.quietS + ' s sin novedades' : ''),
      '• Imagen: ' + (frames ? 'sí, ' + frames + ' cuadros mostrados' : 'todavía no se mostró ninguna imagen del juego'),
      '• Sonido: ' + (a.state === 'running' ? 'funcionando' : a.state ? 'pausado (' + a.state + ')' : 'sin activar') + (cortes !== undefined ? ' · cortes ' + cortes + (saltos !== undefined ? ' · saltos ' + saltos : '') + (cortes || saltos ? ' (se escuchó entrecortado)' : ' (limpio)') : ''),
      '• Velocidad del juego: ' + speedText(),
      '• Memoria usada: ' + (S.mem.wasmBytes ? Math.round(S.mem.wasmBytes / 1048576) + ' MB' : '—'),
      '• Controles táctiles: ' + (window.gh3Touch?.enabled() ? 'activados' : 'apagados')];
    if (gov) L.push('• Calidad automática: ' + (gov.estado || '—') + (gov.modo === 'observa' ? ' (solo mira, no cambia nada)' : ''));
    L.push('• Problemas: ' + (S.errors.length ? S.errors.length + ' — el último: ' + S.errors.at(-1).kind + ' (' + String(S.errors.at(-1).message).slice(0, 80) + ')' : 'ninguno'));
    if (S.previous) L.push('• Vez anterior: ' + S.previous.verdict);
    return L.join('\n');
  }
  function speedText() {
    const sp = S.speed;
    if (sp.juegoPct == null && sp.relojPct == null) return 'todavía sin medir';
    let s = sp.juegoPct != null ? sp.juegoPct + ' % (' + sp.swapsS + ' de 60 cuadros calculados por segundo)' : 'sin dato de cuadros';
    if (sp.relojPct != null) s += ' · reloj de la canción ' + sp.relojPct + ' %';
    if (sp.cancionJuegoPct != null) s += ' · en esta canción: promedio ' + sp.cancionJuegoPct + ' %, peor ' + sp.peorJuegoPct + ' %';
    if (sp.juegoPct != null) s += sp.juegoPct >= 95 ? ' (a velocidad completa)' : sp.juegoPct >= 75 ? ' (algo lento)' : ' (lento: el celular no llega)';
    return s + ' · imágenes ' + sp.imgS + '/s';
  }
  function text() {
    const L = [simple(), '', 'DETALLE TÉCNICO (para Claude)', `GH3 diagnóstico · ${S.started} · ${S.ua}`, `Pantalla ${S.screen.w}x${S.screen.h}@${S.screen.dpr} · aislado ${S.isolated}`,
      'Etapas (s): ' + ORDER.filter((k) => k in S.stages).map((k) => STAGES[k] + ' ' + S.stages[k]).join(' → '),
      `Memoria wasm ${S.mem.wasmBytes ? (S.mem.wasmBytes / 1048576).toFixed(0) : '—'} MB (máx ${S.mem.wasmPeak ? (S.mem.wasmPeak / 1048576).toFixed(0) : '—'}) · heap JS ${S.mem.jsHeap}`,
      'Sonido: ' + JSON.stringify(S.audio), 'Velocidad: ' + JSON.stringify(S.speed) + ' · dispositivo: ' + JSON.stringify(S.device)];
    if (S.governor) L.push('Gobernador: ' + JSON.stringify(S.governor));
    if (S.previous) L.push('Sesión anterior: ' + S.previous.verdict + (S.previous.errors.length ? ' Errores: ' + S.previous.errors.map((e) => e.kind + ': ' + e.message).join(' | ') : ''));
    if (S.errors.length) { L.push('ERRORES:'); for (const e of S.errors) L.push(`  [${e.t} s, ${STAGES[e.stage] || e.stage}] ${e.kind}: ${e.message}${e.file ? ' (' + e.file + ':' + e.line + ')' : ''}${e.stack ? '\n    ' + e.stack : ''}`); }
    if (S.consoleErrors?.length) L.push('console.error: ' + S.consoleErrors.slice(-5).join(' | '));
    if (S.tail?.length) L.push('Últimas líneas del juego:', ...S.tail.map((l) => '  ' + l));
    if (S.previous?.tail?.length) L.push('Últimas líneas del juego (sesión anterior):', ...S.previous.tail.map((l) => '  ' + l));
    L.push('Eventos:'); for (const e of S.events.slice(-60)) L.push(`  ${e.t} ${e.what}`);
    return L.join('\n');
  }
  async function copy() { try { await navigator.clipboard.writeText(text() + '\n\n' + JSON.stringify(S)); ev('informe copiado'); } catch (e) { fail('copiar', e.message); } }
  async function share() { try { await navigator.share({ title: 'GH3 diagnóstico', text: text() }); } catch (e) { if (e.name !== 'AbortError') copy(); } }
  S.text = text;
  if (S.previous) S.events.push({ t: 0, what: 'anterior: ' + S.previous.verdict });
  save(true);
  if (document.body) ui(); else addEventListener('DOMContentLoaded', ui);
})();
