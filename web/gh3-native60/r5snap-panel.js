// Panel de ajustes (Claude, r5pipe; pestañas y colchón hasta 400 ms 2026-10-12): a la derecha de la imagen del juego. Teclas, sonido, sincronía,
// partida guardada y gráficos. Todo queda guardado en este navegador (localStorage, si está disponible).
(() => {
  const css = `
  main { max-width: 1340px !important; }
  #gh3Row { display: flex; gap: 12px; align-items: flex-start; }
  #gh3Row > #r5Box { flex: 1 1 auto; min-width: 0; margin: 0; }
  #gh3Panel { flex: 0 0 300px; position: sticky; top: 8px; max-height: calc(100vh - 16px); overflow: auto; }
  #gh3Panel .tabs { display: flex; gap: 4px; margin: 8px 0 6px; border-bottom: 1px solid var(--line); }
  #gh3Panel .tabs button { flex: 1 1 auto; font-size: 12px !important; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted); font: inherit; font-size: 13px; padding: 6px 2px; cursor: pointer; border-radius: 0; min-height: 0; }
  #gh3Panel .tabs button[aria-selected=true] { color: var(--fg); border-bottom-color: var(--ok); font-weight: 600; }
  #gh3Panel section[hidden] { display: none; }
  #gh3Panel > h3 { display: none; }  /* el cargador renombra el primer h3; acá no se muestra */
  #gh3Panel #controllerGuide { margin: 0; padding: 0; border: 0; box-shadow: none; background: none; }
  #gh3Panel #controllerGuide .eyebrow, #gh3Panel #controllerGuide h2 { display: none; }
  #gh3Panel .top { display: flex; gap: 8px; } #gh3Panel .top button { flex: 1; }
  #gh3Panel table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
  #gh3Panel td:first-child { width: 36%; }
  #gh3Panel td { padding: 2px 2px; }
  #gh3Panel td button { width: 100%; font-size: 12px; padding: 3px 4px; min-height: 26px; }
  #gh3Panel button.wait { outline: 2px solid var(--ok); }
  #gh3Panel .row { display: flex; align-items: center; gap: 8px; font-size: 13px; margin: 4px 0; }
  #gh3Panel input[type=range] { flex: 1; }
  #gh3Panel .soon { color: var(--muted); font-size: 12px; margin: 4px 0; }
  body.gh3fit #r5Canvas { width: auto !important; max-width: 100%; max-height: calc(100vh - 24px); display: block; margin: 0 auto; }
  #gh3Panel select { font: inherit; font-size: 13px; }
  #gh3GfxApply { display: none; }
  /* guía compacta: todos los controles sin scrollear */
  #gh3Panel .guideRow { padding: 2px 4px; gap: 6px; }
  #gh3Panel .guideAction { display: flex; align-items: center; justify-content: space-between; flex: 1; gap: 6px; }
  #gh3Panel .keycaps { margin-top: 0; }
  #gh3Panel .padGlyph, #gh3Panel .xb-A, #gh3Panel .xb-B, #gh3Panel .xb-X, #gh3Panel .xb-Y, #gh3Panel .ps-A, #gh3Panel .ps-B, #gh3Panel .ps-X, #gh3Panel .ps-Y { min-width: 24px; min-height: 24px; width: auto; height: 24px; padding: 0 4px; }
  #gh3Panel .xb-A, #gh3Panel .xb-B, #gh3Panel .xb-X, #gh3Panel .xb-Y, #gh3Panel .ps-A, #gh3Panel .ps-B, #gh3Panel .ps-X, #gh3Panel .ps-Y { width: 24px; padding: 0; }
  #gh3Panel .guideContext, #gh3Panel .guideSwitch { margin: 2px 0; }
  #gh3Panel #controllerGuide { padding-bottom: 4px; } #gh3Panel #controllerGuide > .note, #gh3Panel .guideHint { margin: 4px 0 0; font-size: 11px; }
  @media (max-width: 900px) { #gh3Row { flex-direction: column; } #gh3Panel { flex-basis: auto; width: 100%; position: static; max-height: none; } }`;
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? d; } catch { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  const keyName = (c) => !c ? '—' : ARROWS[c] || c.replace(/^Key|^Digit/, '');

  function build() {
    const box = document.getElementById('r5Box');
    if (!box || document.getElementById('gh3Panel') || !window.gh3Input?.actions) return false;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    const row = document.createElement('div'); row.id = 'gh3Row';
    box.before(row); row.append(box);
    const p = document.createElement('aside'); p.id = 'gh3Panel'; p.className = 'card'; row.append(p);
    p.innerHTML = `<h3>Ajustes</h3><div class="top"><button id="gh3Back">◀ Volver</button><button id="gh3Start">Start</button><button id="gh3Full2" title="Pantalla completa">⛶ Pantalla completa</button></div>
      <div class="tabs" role="tablist"><button role="tab" data-tab="ctrl">Controles</button><button role="tab" data-tab="keys">Teclas</button><button role="tab" data-tab="sound">Sonido</button><button role="tab" data-tab="gfx">Gráficos</button><button role="tab" data-tab="save">Partida</button></div>
      <section data-tab="ctrl"><p class="soon" id="gh3CtrlWait">Cargando la guía de controles…</p></section>
      <section data-tab="keys"><table id="gh3Keys"></table>
        <div class="row"><button id="gh3KeysReset">Restablecer teclas</button></div>
        <p class="soon">Tocá un casillero y apretá la tecla nueva (Esc cancela, Retroceso lo vacía).</p></section>
      <section data-tab="sound">
        <div class="row">Volumen <input id="gh3Vol" type="range" min="0" max="150" step="5"> <span id="gh3VolTxt"></span></div>
        <div class="row"><label><input id="gh3Mute" type="checkbox"> Silenciar</label></div>
        <div class="row">Colchón de sonido <input id="gh3Lat" type="range" min="30" max="400" step="10"> <span id="gh3LatTxt"></span></div>
        <p class="soon">Si el sonido se traba o corta, subilo (en celular conviene 300–400 ms). Más bajo = la música llega antes. Se aplica al instante; si lo cambiás mucho, recalibrá en las Opciones del juego.</p></section>
      <section data-tab="gfx">
        <div class="row"><label><input id="gh3Fit" type="checkbox"> Imagen entera</label> <button id="gh3Full">Pantalla completa</button></div>
        <div class="row">Calidad <select id="gh3Quality"><option value="auto">Automática</option><option value="completo">Completa (muy lenta)</option><option value="liviano">Liviana</option><option value="muy">Muy liviana (la más rápida)</option></select></div>
        <p class="soon" id="gh3QualityTxt"></p>
        <div class="row">Cuadros en vuelo <select id="gh3Inflight"><option value="1">1 (menos retraso)</option><option value="2">2 (más fluido)</option><option value="3">3</option></select></div>
        <p class="soon">Completa muestra el escenario pero es lenta. Se aplica al reiniciar.</p>
        <div class="row"><button id="gh3GfxApply">Aplicar y reiniciar</button></div></section>
      <section data-tab="save"><p class="soon" id="gh3SaveTxt">Se guarda sola en este navegador.</p>
        <div class="row"><button id="gh3SaveDel">Borrar partida guardada</button></div>
        <label class="row"><input type="checkbox" id="gh3SkipIntro"> Saltear videos de inicio (al abrir el juego)</label>
        <div class="row"><button id="gh3CheatSongs">Desbloquear todas las canciones</button></div>
        <p class="soon" id="gh3CheatTxt">Usalo desde el menú principal, con Career marcado. Tarda ~15 s (en celular ~35 s): no toques nada.</p></section>`;
    setupTabs(p);
    guide(row, p);
    const adopt = setInterval(() => {
      const g = document.getElementById('controllerGuide'), sec = p.querySelector('section[data-tab="ctrl"]');
      if (!g || !sec || g.parentElement !== p) return;
      document.getElementById('gh3CtrlWait')?.remove(); sec.append(g); clearInterval(adopt);
    }, 200);
    setTimeout(() => clearInterval(adopt), 120000);
    drawKeys(); setupSound(); setupSync(); setupGfx();
    document.getElementById('gh3Back').onclick = (e) => { e.currentTarget.blur(); gh3Input.tap('b'); };
    document.getElementById('gh3Start').onclick = (e) => { e.currentTarget.blur(); gh3Input.tap('start'); };
    // Claude 2026-10-12: truco "Unlock All Songs" de GH3 X360 en un toque, desde el menú principal (cursor en Career):
    // Options (6.º) → Cheats (9.º) → "enter cheat" (último: arriba da la vuelta) → acordes → Start → volver.
    // Comprobado: en "enter cheat" el juego lee los trastes con el esquema de canción (LT/LB/RB/RT/A), no el de menú.
    document.getElementById('gh3CheatSongs').onclick = async (e) => {
      const btn = e.currentTarget, txt = document.getElementById('gh3CheatTxt'); btn.blur();
      if (btn.disabled || !window.gh3Input?.setTouch) return;
      const C = { G: 1, R: 2, Y: 4, B: 8, O: 16 }, seq = 'YO RB RO GB RY YO RY RB GY GY YB YB YO YO YB Y R RY R Y O'.split(' ');
      const slow = window.gh3IsMobile ? 2.5 : 1, nap = (ms) => new Promise((r) => setTimeout(r, ms * slow)), DOWN = 0x0002, G = gh3Input, sm = G.songMode;  // celular: el juego procesa los toques más lento
      const go = async (keys, label, last = 1100) => { txt.textContent = label; for (const [i, k] of keys.entries()) { G.tap(k); await nap(i === keys.length - 1 ? last : 260); } };  // mover = rápido; entrar a pantalla = espera
      btn.disabled = true;
      try {
        await go(['down', 'down', 'down', 'down', 'down', 'a'], 'Yendo a Options…');
        await go(['down', 'down', 'down', 'down', 'down', 'down', 'down', 'down', 'a'], 'Yendo a Cheats…');
        await go(['up', 'a'], 'Entrando a enter cheat…');
        G.songMode = () => true;
        for (const [i, chord] of seq.entries()) {
          const f = [...chord].reduce((n, c) => n | C[c], 0);
          txt.textContent = `Escribiendo el truco… ${i + 1}/${seq.length}`;
          G.setTouch(f, 0); await nap(60);
          G.setTouch(f, DOWN); await nap(60);
          G.setTouch(f, 0); await nap(40);
          G.setTouch(0, 0); await nap(80);
        }
        G.setTouch(0, 0); G.songMode = sm; await nap(600);
        for (const k of ['start', 'b', 'b']) await go([k], 'Volviendo al menú…');  // cada pantalla espera su transición
        txt.textContent = 'Listo: si el juego mostró "unlocked all songs", están todas en Partida rápida. Si no, volvé al menú principal y probá de nuevo.';
      } finally { G.setTouch(0, 0); G.songMode = sm; btn.disabled = false; }
    };
    { const sk = document.getElementById('gh3SkipIntro'); try { sk.checked = localStorage.getItem('gh3skipintro') === '1'; } catch {}
      sk.onchange = () => { try { localStorage.setItem('gh3skipintro', sk.checked ? '1' : '0'); } catch {} }; }
    document.getElementById('gh3SaveDel').onclick = () => {
      if (!confirm('¿Borrar la partida guardada (progreso, opciones y calibración)? Se aplica al recargar la página.')) return;
      try { indexedDB.deleteDatabase('gh3-data'); document.getElementById('gh3SaveTxt').textContent = 'Borrada. Recargá la página antes de volver a jugar.'; } catch {}
    };
    setInterval(() => {
      const m = window.gh3Save; if (!m) return;
      document.getElementById('gh3SaveTxt').textContent = m.what === 'partida restaurada'
        ? `Restaurada al arrancar: ${m.restored} archivo(s).` : `Guardada · ${m.saved} escrituras · última: ${new Date(m.at).toLocaleTimeString()}`;
    }, 1000);
    document.getElementById('gh3KeysReset').onclick = () => { gh3Input.resetBinds(); drawKeys(); };
    return true;
  }

  // Pestañas: una sección visible por vez (la última elegida queda guardada).
  // Claude 2026-10-12 (pedido de Santi): guía corta arriba del juego. Explica que la calidad se eligió a propósito
  // (celular = la más fluida) y que calidad y controles se pueden cambiar, con botones que llevan a cada lugar.
  function guide(row, p) {
    if (load('gh3guide1', false)) return;
    const gq = window.gh3Quality || {}, cel = !!gq.mobile, auto = gq.chosen === 'auto' || !gq.chosen;
    const g = document.createElement('div'); g.id = 'gh3Guide'; g.className = 'card';
    g.style.cssText = 'font-size:14px;line-height:1.4;margin:8px 0;border-color:var(--ok)';
    const calidad = cel
      ? (auto ? '<b>Celular detectado:</b> activamos <b>a propósito</b> la calidad <b>«Muy liviana»</b> para que el juego vaya más fluido. No muestra las colas de las notas largas ni las llamaradas.' : 'Calidad elegida por vos.')
      : (auto ? 'Calidad automática: <b>«Liviana»</b> (notas, colas de notas largas y llamaradas). Si va lento, probá «Muy liviana».' : 'Calidad elegida por vos.');
    const ctrl = cel
      ? 'Los <b>controles táctiles se pueden cambiar</b>: cuando arranca el juego, tocá <b>«Ajustes táctiles»</b> (arriba) para mover, agrandar o achicar las zonas de los trastes. Con teclado o mando: pestaña <b>Teclas</b> del panel.'
      : 'Las <b>teclas y el mando se pueden cambiar</b> en la pestaña <b>Teclas</b> del panel (la guía de botones está en <b>Controles</b>).';
    g.innerHTML = `<div>${calidad} Para cambiarla: pestaña <b>Gráficos</b> del panel ${cel ? '(abajo del juego)' : '(al costado del juego)'}, opción <b>Calidad</b>, y después «Aplicar y reiniciar».</div><div style="margin-top:6px">${ctrl}</div>
      <div class="row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button data-g="gfx">Ir a Gráficos</button><button data-g="${cel ? 'touch' : 'keys'}">${cel ? 'Ajustes táctiles' : 'Ir a Teclas'}</button><button data-g="ok">Entendido</button></div>`;
    // Debajo de la tarjeta de Jugar (se ve antes de jugar); si no está, arriba del juego.
    const play = document.getElementById('loaderPlay'), card = play && (play.closest('section, article, .card') || play.parentElement);
    if (card && card !== row && !row.contains(card)) card.after(g); else row.before(g);
    g.addEventListener('click', (e) => {
      const a = e.target?.dataset?.g; if (!a) return;
      if (a === 'ok') { store('gh3guide1', true); g.remove(); return; }
      if (a === 'touch') { const b = document.querySelector('button.settings[aria-controls="gh3TouchPanel"]'); if (b && b.offsetParent !== null) { b.click(); return; } e.target.textContent = 'Aparece al arrancar el juego'; return; }
      p.querySelector(`.tabs button[data-tab="${a}"]`)?.click(); p.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function setupTabs(p) {
    const tabs = [...p.querySelectorAll('.tabs button')], secs = [...p.querySelectorAll('section[data-tab]')];
    const show = (id) => { for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === id)); for (const x of secs) x.hidden = x.dataset.tab !== id; store('gh3tab', id); };
    for (const t of tabs) t.onclick = (e) => { e.currentTarget.blur(); show(t.dataset.tab); };
    const last = load('gh3tab', 'ctrl'); show(tabs.some((t) => t.dataset.tab === last) ? last : 'ctrl');
  }

  function drawKeys() {
    const G = window.gh3Input, b = G.getBinds(), t = document.getElementById('gh3Keys');
    t.innerHTML = '';
    for (const a of G.actions) {
      const tr = document.createElement('tr'), td = document.createElement('td');
      td.textContent = a; tr.append(td);
      for (const slot of [0, 1]) {
        const c = document.createElement('td'), btn = document.createElement('button');
        btn.textContent = keyName(b[a][slot]);
        btn.onclick = () => {
          btn.textContent = 'apretá…'; btn.classList.add('wait');
          G.capture(a, slot, () => drawKeys());
        };
        c.append(btn); tr.append(c);
      }
      t.append(tr);
    }
  }

  // Volumen: un GainNode entre el AudioWorklet del juego (r6node) y los parlantes.
  let gain = null;
  const vol = load('gh3vol', { v: 100, mute: false });
  function applyVol() {
    document.getElementById('gh3VolTxt').textContent = vol.v + '%';
    if (gain) gain.gain.value = vol.mute ? 0 : vol.v / 100;
    store('gh3vol', vol);
  }
  function setupSound() {
    const r = document.getElementById('gh3Vol'), m = document.getElementById('gh3Mute');
    r.value = vol.v; m.checked = vol.mute;
    r.oninput = () => { vol.v = +r.value; applyVol(); };
    m.onchange = () => { vol.mute = m.checked; applyVol(); };
    applyVol();
    const hook = setInterval(() => {
      const ctx = window.r6ctx, node = window.r6node;
      if (!ctx || !node || gain) return;
      gain = ctx.createGain();
      try { node.disconnect(ctx.destination); } catch {}
      node.connect(gain); gain.connect(ctx.destination); applyVol(); clearInterval(hook);
    }, 250);
  }

  // Sincronía: cuánto sonido guarda la página antes de reproducir (antes fijo en 200 ms).
  const sync = load('gh3sync', { ms: matchMedia('(pointer:coarse)').matches ? 300 : 200 });  // celular: más colchón por defecto
  let syncSent = null;
  function sendSync() {
    document.getElementById('gh3LatTxt').textContent = sync.ms + ' ms';
    store('gh3sync', sync);
    if (window.r6node) { window.r6node.port.postMessage({ type: 'target', samples: sync.ms * 48 }); syncSent = window.r6node; }
  }
  function setupSync() {
    const r = document.getElementById('gh3Lat');
    r.value = sync.ms; r.oninput = () => { sync.ms = +r.value; sendSync(); };
    sendSync();
    setInterval(() => { if (window.r6node && syncSent !== window.r6node) sendSync(); }, 250);  // audio nuevo al reiniciar
  }

  // Gráficos: tamaño de la imagen (al instante) y opciones del renderer (en la URL, al reiniciar; ver index.html).
  const gfx = load('gh3gfx', { fit: true, scene: false, lite: true, inflight: 2 });
  function setupGfx() {
    const $ = (id) => document.getElementById(id), q = new URLSearchParams(location.search);
    const fit = $('gh3Fit'), qsel = $('gh3Quality'), inf = $('gh3Inflight'), apply = $('gh3GfxApply');
    const applyFit = () => { document.body.classList.toggle('gh3fit', gfx.fit); };
    fit.checked = gfx.fit !== false; gfx.fit = fit.checked; applyFit();
    fit.onchange = () => { gfx.fit = fit.checked; applyFit(); store('gh3gfx', gfx); if (gfx.fit) $('r5Canvas').scrollIntoView({ block: 'nearest' }); };
    const shown = setInterval(() => { if (!$('r5Box').hidden) { clearInterval(shown); if (gfx.fit) $('gh3Row').scrollIntoView({ block: 'start' }); } }, 500);
    $('gh3Full').onclick = (e) => { e.currentTarget.blur(); $('r5Canvas').requestFullscreen?.().catch(() => {}); }; $('gh3Full2').onclick = $('gh3Full').onclick;
    // Lo que está corriendo ahora (según la URL), para avisar si hay cambios sin aplicar.
    const names = { completo: 'Completa', liviano: 'Liviana', muy: 'Muy liviana' }, gq = window.gh3Quality || { chosen: 'auto' };
    const c = q.get('r5liveconsumer') || '', running = /scene/.test(c) ? 'completo' : /colas/.test(c) ? 'liviano' : 'muy';
    const now = { quality: gq.chosen, inflight: Number(q.get('r5inflight')) || 2 };
    qsel.value = now.quality; inf.value = String(now.inflight);
    $('gh3QualityTxt').textContent = 'Ahora: ' + names[running] + (gq.chosen === 'auto' ? (gq.mobile ? ' (automática: en celular se elige a propósito la más fluida; podés cambiarla acá)' : ' (automática)') : '');
    const changed = () => {
      try { localStorage.setItem('gh3q', qsel.value); } catch {}
      gfx.inflight = Number(inf.value); store('gh3gfx', gfx);
      apply.style.display = (qsel.value !== now.quality || gfx.inflight !== now.inflight) ? 'inline-block' : 'none';
    };
    qsel.onchange = inf.onchange = changed;
    apply.onclick = () => {
      if (!confirm('Se reinicia el juego y se reutilizan los archivos preparados. La partida guardada se conserva. ¿Seguir?')) return;
      const u = new URLSearchParams(location.search); u.delete('gfx');
      // Claude 2026-10-12: cerrar el juego antes de recargar para que el iPhone libere su memoria (si no: Out of memory).
      try { window.g1worker && window.g1worker.terminate(); } catch {} try { window.r6ctx && window.r6ctx.close(); } catch {}
      apply.disabled = true; apply.textContent = 'Reiniciando…'; setTimeout(() => location.replace(location.pathname+'?' + u), 1500);
    };
  }

  const t = setInterval(() => { if (build()) clearInterval(t); }, 200);
})();
