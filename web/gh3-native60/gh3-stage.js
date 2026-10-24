// Claude 2026-10-12: señales de etapa del motor GH3 para la carga por etapas (contrato con Codex).
// Lee las aperturas de archivos que el motor ya escribe en el log ([g1-file] path=...) y el reloj de canción.
// Eventos (window, 'gh3stage', detail = {stage, song, at, gameT, file, seq}):
//   preview         se abrió music\<x>.fsb.xen          -> tema resaltado en la lista (song = <x>)
//   loadStart       se abrió movies\bik\loading_flying  -> empieza la carga del nivel (song = último preview; puede ser null)
//   levelConfirmed  1ª apertura de songs\<x>_song.pak   -> nivel confirmado (song exacto)
//   songPlaying     gh3Song.clock() >= 0, SOLO si antes hubo levelConfirmed y luego el reloj pasó por < 0 (retry=true: mismo nivel reiniciado, sin nuevo pak)
// Uso: incluir antes de que la página cree el Worker del juego (engancha window.Worker), o llamar gh3Stage.feed(texto, gameT)
// desde el onmessage propio y poner window.gh3StageNoWrap = true antes de cargar este archivo.
(() => {
  if (window.gh3Stage) return;
  const st = { events: [], seq: 0, preview: null, cycle: 'idle', song: null, loadSeen: false };
  const emit = (stage, song, extra = {}) => {
    const detail = { stage, song: song || null, at: performance.timeOrigin + performance.now(), seq: ++st.seq, ...extra };
    st.events.push(detail); if (st.events.length > 500) st.events.shift();
    try { window.dispatchEvent(new CustomEvent('gh3stage', { detail })); } catch {}
  };
  const reFile = /\[g1-file\] path=(?:GAME|game):\\(\S+)/;
  function feed(text, gameT) {
    const m = reFile.exec(text); if (!m) return;
    const file = m[1].toLowerCase().replace(/\//g, '\\');
    let x;
    if ((x = /^data\\music\\([a-z0-9_]+)\.fsb\.xen$/.exec(file))) {
      // Una preview nueva después de una canción abre otro ciclo.
      if (st.cycle !== 'idle' && st.cycle !== 'preview') { st.cycle = 'idle'; st.song = null; st.loadSeen = false; }
      st.preview = x[1]; st.cycle = 'preview'; emit('preview', x[1], { gameT, file });
    } else if (/^data\\movies\\bik\\loading_flying\.bik\.xen$/.test(file)) {
      if (st.loadSeen) return;  // el motor lo registra dos veces (GAME:\ y game:\)
      st.loadSeen = true; st.cycle = 'loading'; emit('loadStart', st.preview, { gameT, file });
    } else if ((x = /^data\\compressed\\songs\\([a-z0-9_]+)_song\.pak\.xen$/.exec(file))) {
      if (st.cycle === 'confirmed' || st.cycle === 'playing') { if (st.song === x[1]) return; }  // 2ª apertura del mismo pak
      st.song = x[1]; st.cycle = 'confirmed'; st.retry = false; st.armed = false; emit('levelConfirmed', x[1], { gameT, file, previewMatch: st.preview === x[1] });
    }
  }
  // Reloj de canción: songPlaying una vez por ciclo; si el reloj vuelve muy atrás (reintento), se vuelve a avisar.
  let lastClock = null;
  setInterval(() => {
    const c = window.gh3Song?.clock?.(); if (typeof c !== 'number' || !isFinite(c)) return;
    if (st.cycle === 'playing' && lastClock !== null && c < lastClock - 1000) { st.cycle = 'confirmed'; st.retry = true; st.armed = false; }
    if (st.cycle === 'confirmed' && c < 0) st.armed = true;  // cuenta regresiva vista: el reloj ya es de este nivel
    if (st.cycle === 'confirmed' && st.armed && c >= 0) { st.cycle = 'playing'; emit('songPlaying', st.song, { clock: c, retry: !!st.retry }); }
    lastClock = c;
  }, 100);
  if (!window.gh3StageNoWrap && window.Worker) {
    const W = window.Worker;
    window.Worker = function (url, ...rest) {
      const w = new W(url, ...rest);
      if (/gh3-web\.js/.test(String(url))) w.addEventListener('message', (e) => { const d = e.data; if (d && d.type === 'log' && typeof d.text === 'string') feed(d.text, d.t); });
      return w;
    };
    window.Worker.prototype = W.prototype;
  }
  window.gh3Stage = { feed, state: st, get events() { return st.events; } };
})();
