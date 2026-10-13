// Claude 2026-10-13 (pedido de Santi, docs/nube/PEDIDO-CONTROLES-TACTILES.md): aviso y prueba de controles ANTES de Jugar.
// - En el panel de inicio: «Controles táctiles activados», explicación corta (tocar al llegar al aro, mantener en notas
//   largas, varios dedos para acordes, rasgueo según el ajuste) y botones «Probar controles» / «Controles».
// - «Probar controles» abre una vista de la imagen del juego (16:9, como en horizontal) con los cinco colores en el orden
//   original, en el mismo lugar y tamaño que tendrán en la canción (gh3Touch.computeZones). Responden al toque con varios
//   dedos, sostenidas y deslizamiento, y los ajustes (tamaño, altura, visibilidad, rasgueo) se cambian y guardan acá mismo.
// - La prueba NO arranca el wasm, NO pide archivos del juego y NO escribe en el mando (nunca llama a gh3Input).
//   «Jugar» cierra la prueba y toca el mismo botón Jugar del cargador.
// - Sin trabajo por cuadro ni animaciones: todo cambia sólo en respuesta a toques o a un cambio de tamaño.
// Se muestra en celular/tablet (gh3IsMobile) o con ?touch=1; ?touch=0 lo apaga. Necesita gh3-touch.js cargado antes.
(() => {
  const T = window.gh3Touch;
  const q = new URLSearchParams(location.search).get('touch');
  if (!T || q === '0' || !(q === '1' || window.gh3IsMobile)) return;
  const COLORS = T.COLORS, NAMES = T.NAMES;
  const st = { opened: 0, downs: 0, ups: 0, cancels: 0, maxPointers: 0, chords: 0, strums: 0, releases: {} };
  const api = window.gh3TouchTest = { stats: st, open: () => open(false), close: () => close(), isOpen: () => !!overlay && !overlay.hidden };

  const css = `
#gh3TouchIntro{margin:12px auto 0;max-width:520px;width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:rgba(255,255,255,.05);font:14px/1.4 system-ui,sans-serif;text-align:left;color:inherit}
#gh3TouchIntro b{display:block;font-size:15px}
#gh3TouchIntro .dots{display:flex;gap:6px;margin:6px 0 4px}#gh3TouchIntro .dots i{width:18px;height:18px;border-radius:50%;border:2px solid var(--c);box-sizing:border-box}
#gh3TouchIntro p{margin:4px 0;opacity:.9}
#gh3TouchIntro .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
#gh3TouchIntro button,#gh3TouchTest button{font:600 15px system-ui,sans-serif;min-height:44px;padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.35);background:#24202c;color:#fff;touch-action:manipulation}
body.loaderStarted #gh3TouchIntro{display:none!important}
#gh3TouchTest{position:fixed;inset:0;z-index:2147483300;background:#07060a;color:#fff;font:14px/1.35 system-ui,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;touch-action:none;overscroll-behavior:none}
#gh3TouchTest[hidden]{display:none}
#gh3TouchTest .stage{position:absolute;background:#121018;overflow:hidden}
#gh3TouchTest .lane{position:absolute;inset:0;background:linear-gradient(180deg,#1a1622,#2a2433);clip-path:polygon(44% 4%,56% 4%,71% 100%,29% 100%)}
#gh3TouchTest .ring{position:absolute;border-radius:50%;border:3px solid var(--c);box-sizing:border-box;transform:translate(-50%,-50%)}
#gh3TouchTest .tz{position:absolute;box-sizing:border-box;border-radius:10px;border:2px solid color-mix(in srgb,var(--c) var(--gh3-edge,45%),transparent);touch-action:none}
#gh3TouchTest .tz.on{background:color-mix(in srgb,var(--c) 35%,transparent);border-color:var(--c)}
#gh3TouchTest .tstrum{position:absolute;right:calc(env(safe-area-inset-right) + 8px);bottom:calc(env(safe-area-inset-bottom) + 8px);width:20vw;height:50dvh;box-sizing:border-box;border:2px solid rgba(255,255,255,.35);border-radius:14px;background:rgba(255,255,255,.06);display:flex;align-items:center;justify-content:center;text-align:center;font-weight:600;touch-action:none}
#gh3TouchTest .tstrum.on{background:rgba(255,255,255,.4)}
#gh3TouchTest.auto .tstrum{display:none}
#gh3TouchTest .bar{position:absolute;left:calc(env(safe-area-inset-left) + 8px);right:calc(env(safe-area-inset-right) + 8px);top:calc(env(safe-area-inset-top) + 6px);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#gh3TouchTest .bar .msg{flex:1;min-width:140px;font-weight:600}
#gh3TouchTest .bar .play{background:linear-gradient(180deg,#ffb347,#e8473f);color:#160806;border:0}
#gh3TouchTest .bar .play:disabled{opacity:.5}
#gh3TouchTest .help{position:absolute;left:calc(env(safe-area-inset-left) + 10px);right:calc(env(safe-area-inset-right) + 10px);top:calc(env(safe-area-inset-top) + 58px);font-size:13px;opacity:.85;pointer-events:none}
#gh3TouchTest .tpanel{position:absolute;left:calc(env(safe-area-inset-left) + 8px);top:calc(env(safe-area-inset-top) + 58px);width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 80px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid #666;border-radius:12px;background:#171717;touch-action:pan-y}
#gh3TouchTest .tpanel[hidden]{display:none}
#gh3TouchTest .tpanel div{margin:8px 0}#gh3TouchTest .tpanel input[type=range]{width:100%;min-height:32px;touch-action:pan-x}
#gh3TouchTest .tpanel .chk{display:flex;gap:8px;align-items:center}
#gh3TouchTest .tpanel small{display:block;opacity:.75;margin-top:6px}
#gh3TouchTest .rot{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 8px);text-align:center;font-size:13px;opacity:.8;pointer-events:none;display:none}
@media (orientation:portrait){#gh3TouchTest .rot{display:block}}`;

  let card = null, overlay = null, els = null, playWatch = null;
  function addStyle() { if (document.getElementById('gh3TouchTestStyle')) return; const s = document.createElement('style'); s.id = 'gh3TouchTestStyle'; s.textContent = css; document.head.appendChild(s); }
  const pointers = new Map();  // pointerId -> { role, fret }
  let strumOn = 0, strumTimer = 0;

  function helpText() { return 'Tocá el color cuando la nota llega al aro. Mantenelo apretado en las notas largas. Varios dedos a la vez para los acordes.'; }
  function syncTexts() {
    if (card) card.querySelector('.strum').textContent = T.strumHelp();
    if (!overlay) return;
    const s = T.getSettings();
    overlay.classList.toggle('auto', !!s.auto);
    overlay.style.setProperty('--gh3-edge', s.alpha + '%');
    els.help.textContent = T.strumHelp();
    for (const k of ['offset', 'width', 'height', 'alpha']) { els.panel.querySelector(`[name=${k}]`).value = s[k]; els.panel.querySelector(`[data-v=${k}]`).textContent = s[k] + '%'; }
    els.panel.querySelector('[name=auto]').checked = !!s.auto;
  }

  function buildCard(host, after) {
    card = document.createElement('section'); card.id = 'gh3TouchIntro'; card.setAttribute('aria-label', 'Controles táctiles');
    card.innerHTML = `<b>Controles táctiles activados</b><div class="dots" aria-hidden="true">${COLORS.map((c) => `<i style="--c:${c}"></i>`).join('')}</div>
      <p>${helpText()}</p><p class="strum"></p>
      <div class="acts"><button type="button" class="try">Probar controles</button><button type="button" class="ctl">Controles</button></div>`;
    after ? after.after(card) : host.append(card);
    card.querySelector('.try').addEventListener('click', () => open(false));
    card.querySelector('.ctl').addEventListener('click', () => open(true));
    syncTexts();
  }

  function buildOverlay() {
    addStyle();
    overlay = document.createElement('div'); overlay.id = 'gh3TouchTest'; overlay.hidden = true;
    overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-label', 'Probar controles');
    overlay.innerHTML = `<div class="stage" aria-hidden="true"><div class="lane"></div>${COLORS.map((c) => `<div class="ring" style="--c:${c}"></div>`).join('')}</div>
      ${COLORS.map((c, i) => `<div class="tz" data-tf="${i}" style="--c:${c}" aria-label="${NAMES[i]}"></div>`).join('')}
      <div class="tstrum" data-tstrum="1">RASGUEO<br>↑ ↓</div>
      <div class="bar"><span class="msg" role="status" aria-live="polite"></span><button type="button" class="adj" aria-expanded="false">Ajustes</button><button type="button" class="back">Volver</button><button type="button" class="play">Jugar</button></div>
      <p class="help"></p>
      <section class="tpanel" aria-label="Ajustes de los controles" hidden>
        <div class="chk"><input id="gh3TtAuto" name="auto" type="checkbox"><span>Tocar el color rasguea solo</span></div>
        <div>Altura: arriba (−), aros (0), abajo (+) <output data-v="offset"></output><input name="offset" type="range" min="-20" max="20" step="1" aria-label="Altura"></div>
        <div>Ancho de cada zona <output data-v="width"></output><input name="width" type="range" min="60" max="100" step="1" aria-label="Ancho"></div>
        <div>Tamaño vertical <output data-v="height"></output><input name="height" type="range" min="8" max="35" step="1" aria-label="Tamaño vertical"></div>
        <div>Visibilidad de los bordes <output data-v="alpha"></output><input name="alpha" type="range" min="0" max="100" step="5" aria-label="Visibilidad"></div>
        <button type="button" class="reset">Restablecer</button> <button type="button" class="done">Listo</button>
        <small class="saved">Se guarda en este dispositivo y vale también dentro de la canción.</small>
      </section>
      <div class="rot">En el juego, girá el teléfono a horizontal: las zonas quedan como acá.</div>`;
    document.body.appendChild(overlay);
    els = { stage: overlay.querySelector('.stage'), rings: [...overlay.querySelectorAll('.ring')], zones: [...overlay.querySelectorAll('.tz')],
      strum: overlay.querySelector('.tstrum'), msg: overlay.querySelector('.msg'), help: overlay.querySelector('.help'), panel: overlay.querySelector('.tpanel'),
      adj: overlay.querySelector('.adj'), play: overlay.querySelector('.play') };
    els.adj.addEventListener('click', () => showPanel(els.panel.hidden));
    overlay.querySelector('.done').addEventListener('click', () => showPanel(false));
    overlay.querySelector('.back').addEventListener('click', () => close());
    overlay.querySelector('.reset').addEventListener('click', () => T.resetSettings());
    els.play.addEventListener('click', () => { const b = document.getElementById('loaderPlay'); close(); if (b && !b.disabled) b.click(); });
    els.panel.addEventListener('input', (e) => {
      const n = e.target.name; if (!n) return;
      const saved = T.setSettings(n === 'auto' ? { auto: e.target.checked ? 1 : 0 } : { [n]: Number(e.target.value) });
      overlay.querySelector('.saved').textContent = saved ? 'Guardado en este dispositivo. Vale también dentro de la canción.' : 'No se pudo guardar: los ajustes duran esta sesión.';
    });
    overlay.addEventListener('pointerdown', down);
    overlay.addEventListener('pointermove', move);
    overlay.addEventListener('pointerup', (e) => end(e, 'up'));
    overlay.addEventListener('pointercancel', (e) => end(e, 'cancel'));
    overlay.addEventListener('lostpointercapture', (e) => end(e, 'lost'));
    // Safari: sin esto un toque puede hacer zoom, mover la página, abrir la lupa o generar clics.
    const stop = (e) => { if (e.target.closest('.tpanel,.bar')) return; if (e.cancelable) e.preventDefault(); };
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu']) overlay.addEventListener(ev, stop, { passive: false });
    overlay.addEventListener('touchcancel', () => releaseAll('touchcancel'));
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!els.panel.hidden) showPanel(false); else close(); } });
  }

  function showPanel(show) {
    releaseAll('panel'); els.panel.hidden = !show; els.adj.setAttribute('aria-expanded', String(show));
    els.help.hidden = show; if (show) els.panel.querySelector('input').focus();
  }

  // La imagen del juego en horizontal ocupa la pantalla con proporción 16:9 (gh3-landscape.js + object-fit: contain).
  function layout() {
    if (!overlay || overlay.hidden) return;
    const view = { w: innerWidth, h: innerHeight }, box = T.fitBox({ left: 0, top: 0, width: view.w, height: view.h }, 16 / 9);
    Object.assign(els.stage.style, { left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px' });
    const zones = T.computeZones(box, T.getSettings(), view, T.insets()), ring = box.w * .055;
    zones.forEach((r, i) => {
      Object.assign(els.zones[i].style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      Object.assign(els.rings[i].style, { left: (r.cx - box.x) + 'px', top: (r.cy - box.y) + 'px', width: ring + 'px', height: ring * .45 + 'px' });
    });
  }

  function open(withSettings) {
    if (document.body.classList.contains('loaderStarted')) return;
    if (!overlay) buildOverlay();
    st.opened++; overlay.hidden = false; syncTexts(); layout(); render();
    showPanel(!!withSettings);
    const b = document.getElementById('loaderPlay');
    const syncPlay = () => { els.play.disabled = !b || b.disabled; els.play.textContent = els.play.disabled ? 'Jugar (preparando…)' : 'Jugar'; };
    syncPlay(); playWatch?.disconnect();
    if (b) { playWatch = new MutationObserver(syncPlay); playWatch.observe(b, { attributes: true, attributeFilter: ['disabled'] }); }
    if (!withSettings) els.adj.focus();
  }
  function close() {
    if (!overlay || overlay.hidden) return;
    releaseAll('close'); overlay.hidden = true; playWatch?.disconnect(); playWatch = null;
    card?.querySelector('.try')?.focus();
  }

  // Misma lógica de dedos que gh3-touch.js (traste por posición, varios dedos), pero el resultado sólo se muestra.
  function fretAt(x) {
    const a = els.zones[0].getBoundingClientRect(), b = els.zones[4].getBoundingClientRect();
    const first = a.left + a.width / 2, last = b.left + b.width / 2;
    return Math.max(0, Math.min(4, Math.round((x - first) / ((last - first) / 4))));
  }
  function down(e) {
    if (!els.panel.hidden) return;
    const z = e.target.closest('[data-tf],[data-tstrum]'); if (!z) return;
    if (e.cancelable) e.preventDefault();
    try { z.setPointerCapture(e.pointerId); } catch {}
    const strum = !!z.dataset.tstrum;
    pointers.set(e.pointerId, { role: strum ? 'strum' : 'fret', fret: strum ? -1 : Number(z.dataset.tf), anchorY: e.clientY });
    st.downs++; st.maxPointers = Math.max(st.maxPointers, pointers.size);
    if (strum) flashStrum();
    render();
  }
  function move(e) {
    const p = pointers.get(e.pointerId); if (!p) return;
    if (p.role === 'fret') { const f = fretAt(e.clientX); if (f !== p.fret) { p.fret = f; render(); } }
    else if (Math.abs(e.clientY - p.anchorY) >= 24) { p.anchorY = e.clientY; flashStrum(); }
  }
  function end(e, why) { if (!pointers.delete(e.pointerId)) return; why === 'up' ? st.ups++ : st.cancels++; render(); }
  function flashStrum() {
    st.strums++; strumOn = 1; clearTimeout(strumTimer);
    strumTimer = setTimeout(() => { strumOn = 0; render(); }, 120);
  }
  function releaseAll(why) {
    if (!pointers.size && !strumOn) return;
    st.releases[why] = (st.releases[why] || 0) + 1; pointers.clear(); strumOn = 0; clearTimeout(strumTimer); render();
  }
  let lastKey = -1;
  function render() {
    if (!els) return;
    let mask = 0; for (const p of pointers.values()) if (p.role === 'fret') mask |= 1 << p.fret;
    els.zones.forEach((z, i) => z.classList.toggle('on', !!(mask & (1 << i))));
    els.strum.classList.toggle('on', !!strumOn);
    const key = mask | (strumOn << 5); if (key === lastKey) return;
    const names = NAMES.filter((_, i) => mask & (1 << i)), n = names.length;
    if (n > 1 && mask !== (lastKey & 31)) st.chords++;
    lastKey = key;
    st.mask = mask;
    els.msg.textContent = n === 0 ? 'Probar controles: tocá los colores' : (n > 1 ? 'Acorde: ' : '') + names.join(' + ') + (strumOn ? ' · rasgueo' : '');
  }

  addEventListener('blur', () => releaseAll('blur'));
  addEventListener('pagehide', () => releaseAll('pagehide'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') releaseAll('hidden'); });
  addEventListener('resize', () => { releaseAll('resize'); layout(); });
  matchMedia('(orientation: portrait)').addEventListener?.('change', () => { releaseAll('orientation'); requestAnimationFrame(layout); });
  window.visualViewport?.addEventListener('resize', layout);
  T.onSettings(() => { syncTexts(); layout(); });

  // El panel del cargador lo arma r5snap-loader-ui.js (módulo, se ejecuta después de este script).
  function mount() {
    if (card) return true;
    const host = document.getElementById('loaderPanel'); if (!host) return false;
    addStyle();
    buildCard(host, document.getElementById('loaderPlay')?.closest('.row'));
    // Al tocar Jugar (por cualquier botón) la prueba se cierra: los controles de la canción son los de gh3-touch.js.
    new MutationObserver(() => { if (document.body.classList.contains('loaderStarted')) close(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return true;
  }
  const start = () => { if (mount()) return; let n = 0; const t = setInterval(() => { if (mount() || ++n > 75) clearInterval(t); }, 200); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start); else start();
})();
