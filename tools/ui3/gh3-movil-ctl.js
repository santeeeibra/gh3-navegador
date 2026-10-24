// Claude 2026-10-16 (pedido de Santi): controles del celular menos invasivos + registro de parpadeos.
// - Durante la canción, la cruceta y Volver/Start/Controles quedan tenues (siguen funcionando; al tocarlos se ven).
// - Zona de RASGUEO (modo manual) como franja suave con borde punteado, en vez de un recuadro gris grande.
// - En Joystick con rasgueo manual, durante la canción la cruceta se oculta y su lugar es el rasgueo.
// - Registro: cuándo y por qué se apagó la autopista (window.hw60.hides) y cuándo se ocultaron los controles táctiles,
//   visible en el panel ☰ («Parpadeos») para que Santi lo lea en el celular.
(() => {
  const css = `
body.gh3EnCancion #gh3Touch .dpad,body.gh3EnCancion #gh3Touch .nav,body.gh3EnCancion #gh3Touch .settings{opacity:.22!important;transition:opacity .4s}
body.gh3EnCancion #gh3Touch .dpad:active,body.gh3EnCancion #gh3Touch .nav:active,body.gh3EnCancion #gh3Touch .settings:active{opacity:.9!important;transition:none}
body.gh3EnCancion.gh3Joy #gh3Touch:not(.autoStrum) .dpad{display:none!important}
#gh3Touch .strum{border:1.5px dashed rgba(255,255,255,.28)!important;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.06))!important;border-radius:22px!important;opacity:.55!important;font-size:11px!important;letter-spacing:.14em;color:rgba(255,255,255,.7)}
#gh3Touch .strum.on{opacity:.9!important;background:rgba(255,255,255,.22)!important}
#gh3Touch.autoStrum .star{width:56px!important;height:56px!important;font-size:22px!important;opacity:.6!important}
#gh3MovilDiag{margin:10px 0;padding:10px;border:1px solid rgba(255,255,255,.18);border-radius:10px;font:13px system-ui,sans-serif;color:#eee}
#gh3MovilDiag ol{margin:6px 0 0;padding-left:18px;font-size:12px;opacity:.85;max-height:140px;overflow:auto}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  // Canción en curso: el mismo evento que usa el monitor.
  addEventListener('gh3stage', ({ detail }) => document.body?.classList.toggle('gh3EnCancion', detail?.stage === 'songPlaying'));

  // Controles táctiles: anotar cada vez que dejan de verse (atributo hidden, display none o algo encima de la cruceta).
  const touchLog = []; window.gh3TouchHides = touchLog;
  let wasVisible = null, hideAt = 0;
  const why = (t) => {
    if (t.hidden) return 'controles apagados';
    const cs = getComputedStyle(t); if (cs.display === 'none') return 'ocultos por ' + ([...document.body.classList].filter((c) => /Drawer|Rot|Mem|Load/.test(c)).join(', ') || 'estilo');
    const pad = t.querySelector('.dpad'); if (!pad) return null;
    const r = pad.getBoundingClientRect(); if (!r.width) return 'cruceta sin tamaño';
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && !t.contains(top)) return 'tapados por ' + (top.id ? '#' + top.id : top.tagName.toLowerCase() + (top.className ? '.' + String(top.className).split(' ')[0] : ''));
    return null;
  };
  setInterval(() => {
    const t = document.getElementById('gh3Touch'); if (!t || !document.body.classList.contains('gh3EnCancion')) { wasVisible = null; return; }
    const w = why(t), vis = !w;
    if (wasVisible === true && !vis) { touchLog.push({ at: Date.now(), why: w, ms: null }); hideAt = performance.now(); if (touchLog.length > 30) touchLog.shift(); }
    if (wasVisible === false && vis && touchLog.length) touchLog[touchLog.length - 1].ms = Math.round(performance.now() - hideAt);
    wasVisible = vis;
  }, 100);

  // Claude 2026-10-16 (Santi: «desaparecen autopista y cruceta juntas y no queda nada anotado»): si las dos se van a la
  // vez y la página sigue diciendo «visibles», el apagón es del navegador al dibujar, no de nuestro código. Se anotan
  // los sucesos de la página que suelen provocarlo, para ver cuál coincide con el parpadeo.
  const pageLog = []; window.gh3PageEvents = pageLog;
  const note = (why) => { if (!document.body?.classList.contains('gh3EnCancion')) return; pageLog.push({ at: Date.now(), why, ms: null }); if (pageLog.length > 30) pageLog.shift(); };
  // 1) Página trabada: entre dos cuadros del navegador pasaron > 150 ms (en ese rato no se redibuja nada).
  let lastRaf = 0;
  const raf = (t) => { if (lastRaf && t - lastRaf > 150 && document.visibilityState === 'visible') note(`página trabada ${Math.round(t - lastRaf)} ms`); lastRaf = t; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  // 2) Cambio de tamaño de la imagen del juego, de la pantalla visible o de orientación (el navegador rearma capas).
  let lastGame = '';
  setInterval(() => {
    const g = document.getElementById('r5Canvas'); if (!g) return;
    const k = `${g.width}x${g.height}|${Math.round(g.getBoundingClientRect().width)}`;
    if (lastGame && k !== lastGame) note(`imagen del juego cambió de tamaño (${lastGame} → ${k})`); lastGame = k;
  }, 100);
  visualViewport?.addEventListener('resize', () => note(`pantalla visible cambió (${Math.round(visualViewport.width)}×${Math.round(visualViewport.height)})`));
  addEventListener('orientationchange', () => note('giro de pantalla'));
  document.addEventListener('visibilitychange', () => note(document.visibilityState === 'visible' ? 'página volvió a primer plano' : 'página en segundo plano'));
  // 3) El dibujo de la autopista perdió la placa de video (el navegador la libera, p. ej. por memoria).
  const hookGl = () => { for (const c of document.querySelectorAll('canvas')) if (!c.dataset.gh3Lost) { c.dataset.gh3Lost = 1; c.addEventListener('webglcontextlost', () => note(`placa de video perdida (${c.id || 'capa autopista'})`)); c.addEventListener('webglcontextrestored', () => note(`placa de video recuperada (${c.id || 'capa autopista'})`)); } };
  setInterval(hookGl, 2000);
  // 4) Algo encima que no recibe toques (elementFromPoint no lo ve): elemento fijo grande, visible, por arriba de z 50.
  setInterval(() => {
    if (!document.body?.classList.contains('gh3EnCancion')) return;
    for (const e of document.body.children) {
      if (e.id === 'gh3Touch' || e.id === 'gh3Joy' || e.tagName === 'SCRIPT' || e.tagName === 'STYLE') continue;
      const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05 || (parseInt(cs.zIndex) || 0) <= 50) continue;
      const r = e.getBoundingClientRect(); if (r.width * r.height < innerWidth * innerHeight * 0.5) continue;
      const k = e.id || e.className; if (e.dataset.gh3Cover !== '1') { e.dataset.gh3Cover = '1'; note(`capa grande encima: ${e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(k).split(' ')[0]}`); }
      return;
    }
    for (const e of document.querySelectorAll('[data-gh3-cover="1"]')) delete e.dataset.gh3Cover;
  }, 100);

  // Panel ☰: «Parpadeos» con los últimos registros de ambos.
  const hora = (t) => new Date(t).toLocaleTimeString('es-AR', { hour12: false });
  setInterval(() => {
    const panel = document.getElementById('gh3Panel'); if (!panel) return;
    let box = document.getElementById('gh3MovilDiag');
    if (!box) { box = document.createElement('div'); box.id = 'gh3MovilDiag'; panel.appendChild(box); }
    if (!panel.offsetParent && box.dataset.n) return; // panel cerrado: no redibujar
    const a = (window.hw60?.hides || []).map((h) => ({ ...h, que: 'Autopista' })), c = touchLog.map((h) => ({ ...h, que: 'Controles' })), p = pageLog.map((h) => ({ ...h, que: 'Página' }));
    const all = [...a, ...c, ...p].sort((x, y) => y.at - x.at).slice(0, 20);
    box.dataset.n = all.length;
    box.innerHTML = '<div style="font-weight:600">Parpadeos (diagnóstico)</div><div style="opacity:.75;font-size:12px">Si la autopista o los controles desaparecen un momento, queda anotado acá con el motivo.</div>';
    const ol = document.createElement('ol');
    if (!all.length) ol.append(Object.assign(document.createElement('li'), { textContent: 'Ninguno por ahora.' }));
    for (const h of all) ol.append(Object.assign(document.createElement('li'), { textContent: `${hora(h.at)} · ${h.que}: ${h.why}${h.ms != null ? ` · volvió en ${h.ms} ms` : ''}` }));
    box.append(ol);
  }, 1000);
})();
