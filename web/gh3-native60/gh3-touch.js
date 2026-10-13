// Zonas alineadas con los receptores de la autopista original (1280×720).
// Basado en el controlador táctil entregado en artifacts/d1-wasm/touch.
// Cinco zonas sobre los círculos, rasgueo y estrella a la derecha, pausa a la izquierda.
// Varios dedos a la vez, sostenidas y deslizamiento; liberar al cancelar, perder foco o redimensionar.
// Salida: window.gh3Input.setTouch(trastes, botones) (gh3-input.js con soporte táctil); el mismo mando que teclado
// y joystick, así GH3 juzga y puntúa igual. Se activa solo en pantallas táctiles; ?touch=1 lo fuerza, ?touch=0 lo apaga.
(() => {
  const BTN = { up: 0x0001, down: 0x0002, start: 0x0010, back: 0x0020 };
  const STRUM_MS = 45, SWIPE_PX = 24;
  const q = new URLSearchParams(location.search).get('touch');
  // Celular/tablet: por sistema (iPadOS se presenta como Mac con varios toques) o puntero principal táctil sin mouse.
  // Una PC con pantalla táctil y mouse queda como PC (antes mostraba los cuadrados).
  const UA = navigator.userAgent;
  const coarse = /Android|iPhone|iPad|iPod|Mobile/i.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1) ||
    (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
  window.gh3IsMobile = coarse;
  const markDevice = () => document.documentElement.classList.add(coarse ? 'gh3Mobile' : 'gh3Pc');
  markDevice();
  const pointers = new Map();  // pointerId -> { role, fret, anchorY }
  let strumBits = 0, root = null, zones = null, enabled = false, lastKey = -1;
  const st = { downs: 0, ups: 0, cancels: 0, strums: 0, maxPointers: 0, releases: {}, frets: 0, buttons: 0 };
  const T = window.gh3Touch = { stats: st, enabled: () => enabled };
  const DEFAULTS = { offset: 0, width: 100, height: 18, auto: 1 };  // auto = tocar el color rasguea solo (Claude 2026-10-12)
  const STORAGE = 'gh3TouchZones.v1';
  let settings = { ...DEFAULTS }, panel, resizeObserver;
  const clamp = (v, lo, hi, fallback) => Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
  function normalize(v = {}) {
    return { offset: clamp(v?.offset, -20, 20, 0), width: clamp(v?.width, 60, 100, 100), height: clamp(v?.height, 8, 35, 18), auto: v?.auto === 0 ? 0 : 1 };
  }
  try { settings = normalize(JSON.parse(localStorage.getItem(STORAGE) || '{}')); } catch {}
  T.getSettings = () => ({ ...settings });
  T.setSettings = (value) => {
    releaseAll('settings'); settings = normalize({ ...settings, ...value });
    let saved = true;
    try { localStorage.setItem(STORAGE, JSON.stringify(settings)); } catch { saved = false; }
    syncSettings(); layout();
    if (panel) panel.querySelector('[role=status]').textContent = saved ? 'Guardado en este navegador.' : 'No se pudo guardar. Los ajustes duran esta sesión.';
  };
  T.resetSettings = () => T.setSettings(DEFAULTS);
  function syncSettings() {
    if (!panel) return;
    panel.querySelector('[name=auto]').checked = !!settings.auto; root?.classList.toggle('autoStrum', !!settings.auto);
    for (const key of ['offset', 'width', 'height']) {
      panel.querySelector(`[name=${key}]`).value = settings[key];
      panel.querySelector(`[data-value=${key}]`).textContent = settings[key] + '%';
    }
  }
  // object-fit: contain deja bandas negras. Usar la imagen visible, no la caja CSS.
  function layout() {
    if (!root) return;
    const canvas = document.getElementById('r5Canvas');
    const rect = canvas?.getBoundingClientRect();
    let w = innerWidth, h = innerHeight, x = 0, y = 0;
    if (rect?.width && rect?.height) {
      const ratio = (canvas.width || 1280) / (canvas.height || 720);
      w = Math.min(rect.width, rect.height * ratio); h = w / ratio;
      x = rect.left + (rect.width - w) / 2; y = rect.top + (rect.height - h) / 2;
    }
    const step = w * .08, zoneW = step * settings.width / 100;
    const zoneH = Math.min(innerHeight, Math.max(44, h * settings.height / 100));
    const cy = y + h * (.885 + settings.offset / 100);
    zones.frets.forEach((z, i) => {
      const cx = x + w * (.34 + i * .08);
      Object.assign(z.style, { left: Math.max(0, Math.min(innerWidth - zoneW, cx - zoneW / 2)) + 'px',
        top: Math.max(0, Math.min(innerHeight - zoneH, cy - zoneH / 2)) + 'px', width: zoneW + 'px', height: zoneH + 'px' });
    });
    if (canvas && !resizeObserver) { resizeObserver = new ResizeObserver(() => { releaseAll('resize'); layout(); }); resizeObserver.observe(canvas); }
  }
  function showSettings(open) {
    releaseAll('panel'); panel.hidden = !open; root.classList.toggle('preview', open);
    const button = root.querySelector('.settings'); button.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('input').focus(); else button.focus();
  }


  const css = `
#gh3Touch{position:fixed;inset:0;z-index:50;pointer-events:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;font:600 14px system-ui,sans-serif;color:#fff}
#gh3Touch .z{position:absolute;pointer-events:auto;touch-action:none;box-sizing:border-box;border:2px solid rgba(255,255,255,.35);border-radius:14px;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;opacity:var(--gh3-touch-opacity,.75)}
#gh3Touch .frets{position:absolute;inset:0;pointer-events:none}
#gh3Touch .frets .z{position:absolute;border-radius:10px}
#gh3Touch .f0{--c:#2ecc40}#gh3Touch .f1{--c:#ff3b30}#gh3Touch .f2{--c:#ffd60a}#gh3Touch .f3{--c:#0a84ff}#gh3Touch .f4{--c:#ff9500}
#gh3Touch .frets .z{border:0;background:transparent}
html body.gh3Play #gh3Touch .frets .z:not(.on){background:transparent}
#gh3Touch .frets .z.on{background:color-mix(in srgb,var(--c) 35%,transparent);opacity:1}
#gh3Touch .strum{right:calc(env(safe-area-inset-right) + 8px);bottom:calc(env(safe-area-inset-bottom) + 8px);width:20vw;height:50dvh}
#gh3Touch .star{right:calc(env(safe-area-inset-right) + 8px);top:calc(env(safe-area-inset-top) + 8px);width:20vw;height:calc(42dvh - 32px);font-size:22px}
#gh3Touch .pause{display:none}
#gh3Touch.autoStrum .strum{display:none}
#gh3Touch.autoStrum .star{top:auto;bottom:calc(env(safe-area-inset-bottom) + 14px);right:calc(env(safe-area-inset-right) + 14px);width:68px;height:68px;border-radius:50%;font-size:26px;background:rgba(80,160,255,.18);border-color:rgba(140,200,255,.6)}
#gh3Touch .panel .chk{display:flex;gap:8px;align-items:center}#gh3Touch .panel .chk input{width:auto;min-height:0}
#gh3Touch .nav{position:absolute;top:calc(env(safe-area-inset-top) + 8px);pointer-events:auto;touch-action:manipulation;min-width:84px;min-height:48px;font-size:16px;opacity:.85}
#gh3Touch .nav.back{left:calc(env(safe-area-inset-left) + 8px)}#gh3Touch .nav.start{left:calc(env(safe-area-inset-left) + 100px)}
#gh3Touch .z.on{background:rgba(255,255,255,.45);opacity:.95}
#gh3Touch .rot{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.7);font-size:20px;text-align:center;padding:24px}

body.gh3TouchActive #r5Canvas{touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
body.gh3TouchActive.gh3Play{overscroll-behavior:none}
#gh3Touch .settings{position:absolute;left:calc(env(safe-area-inset-left) + 192px);top:calc(env(safe-area-inset-top) + 8px);pointer-events:auto;min-height:44px;touch-action:manipulation}
#gh3Touch button{font:inherit;color:white;background:#222;border:1px solid #777;border-radius:8px;padding:8px 12px}
#gh3Touch .panel{position:absolute;left:calc(env(safe-area-inset-left) + 8px);top:calc(env(safe-area-inset-top) + 60px);width:min(340px,calc(100vw - 32px));max-height:calc(100dvh - 150px);overflow:auto;box-sizing:border-box;padding:12px;border:1px solid #666;border-radius:12px;background:#171717;pointer-events:auto;touch-action:pan-y;font-weight:400}
#gh3Touch .panel[hidden]{display:none}
#gh3Touch .panel label{display:block;margin:8px 0}
#gh3Touch .panel input{width:100%;min-height:32px;touch-action:pan-x}
#gh3Touch .panel p{font-size:12px;margin:8px 0}
#gh3Touch.preview .frets .z{opacity:1!important;background:color-mix(in srgb,var(--c) 30%,transparent)!important;border:2px dashed var(--c)}
#gh3Touch .frets .z span{display:none}#gh3Touch.preview .frets .z span{display:block;color:white;text-shadow:0 1px 3px black}
#gh3Touch .rot{pointer-events:none}
#gh3Touch .dpad{position:absolute;left:calc(env(safe-area-inset-left) + 10px);top:50%;transform:translateY(-35%);display:grid;grid-template-columns:repeat(3,54px);grid-template-rows:repeat(3,54px);gap:4px;pointer-events:none}
#gh3Touch .dpad button{pointer-events:auto;touch-action:none;padding:0;font-size:22px;border-radius:12px;background:rgba(30,32,40,.7);border:1px solid rgba(255,255,255,.45);opacity:.85}
#gh3Touch .dpad button.on{background:rgba(255,255,255,.45)}
#gh3Touch .dpad .up{grid-area:1/2}#gh3Touch .dpad .left{grid-area:2/1}#gh3Touch .dpad .right{grid-area:2/3}#gh3Touch .dpad .down{grid-area:3/2}
#gh3Touch.inSong .dpad{display:none}
@media (orientation:portrait){#gh3Touch .strum{height:20vh;width:18vw}#gh3Touch .star{height:60px;width:18vw}}
`;

  function build() {
    const style = document.createElement('style'); style.id = 'gh3TouchStyle'; style.textContent = css; document.head.appendChild(style);
    root = document.createElement('div'); root.id = 'gh3Touch';
    root.innerHTML = '<div class="frets">' + [0, 1, 2, 3, 4].map((i) => `<div class="z f${i}" data-role="fret" data-fret="${i}" aria-label="${['Verde','Rojo','Amarillo','Azul','Naranja'][i]}"><span>${i + 1}</span></div>`).join('') + '</div>' +
      '<div class="z strum" data-role="strum">RASGUEO<br>↑ ↓</div><div class="z star" data-role="star">★</div>' +
      '<div class="z pause" data-role="pause">❚❚</div><div class="rot">Girá el teléfono a horizontal para jugar</div>';
    root.insertAdjacentHTML('beforeend', `<button class="nav back">◀ Volver</button><button class="nav start">Start</button><div class="dpad" aria-label="Cruceta">${[['up','▲','Arriba'],['left','◀','Izquierda'],['right','▶','Derecha'],['down','▼','Abajo']].map(([d,t,l])=>`<button class="${d}" data-d="${d}" aria-label="${l}">${t}</button>`).join('')}</div><button class="settings" aria-expanded="false" aria-controls="gh3TouchPanel">Ajustes táctiles</button>
      <section class="panel" id="gh3TouchPanel" aria-label="Ajustes táctiles" hidden>
        <label class="chk"><input name="auto" type="checkbox"> Tocar el color rasguea solo</label>
        <b>Zonas de los cinco círculos</b>
        <label>Altura: arriba (−), círculos (0), debajo (+) <output data-value="offset"></output><input name="offset" type="range" min="-20" max="20" step="1"></label>
        <label>Ancho de cada zona <output data-value="width"></output><input name="width" type="range" min="60" max="100" step="1"></label>
        <label>Tamaño vertical <output data-value="height"></output><input name="height" type="range" min="8" max="35" step="1"></label>
        <button class="reset">Restablecer</button> <button class="close">Listo</button><p role="status" aria-live="polite">Se guarda automáticamente en este navegador.</p>
      </section>`);
    document.body.appendChild(root);
    panel = root.querySelector('.panel');
    // Volver = B y Start = pulso corto, igual que los botones del panel en PC (gh3Input.tap).
    for (const [cls, name] of [['back', 'b'], ['start', 'start']]) {
      const b = root.querySelector('.nav.' + cls);
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (enabled) window.gh3Input?.tap?.(name); });
      b.addEventListener('click', (e) => e.preventDefault());
    }
    // Claude 2026-10-12: cruceta para los menús (se oculta en la canción). Toque = un paso; mantener = repite.
    for (const b of root.querySelectorAll('.dpad button')) {
      let rep = null;
      const stopRep = () => { clearTimeout(rep); clearInterval(rep); rep = null; b.classList.remove('on'); };
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation(); if (!enabled) return;
        try { b.setPointerCapture(e.pointerId); } catch {}
        const d = b.dataset.d; window.gh3Input?.tap?.(d); b.classList.add('on'); st.buttons++;
        stopRep(); b.classList.add('on'); rep = setTimeout(() => { rep = setInterval(() => window.gh3Input?.tap?.(d), 170); }, 450);
      });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, stopRep);
      b.addEventListener('click', (e) => e.preventDefault());
    }
    setInterval(() => root.classList.toggle('inSong', !!window.gh3Input?.songMode?.()), 250);
    root.querySelector('.settings').addEventListener('click', () => showSettings(panel.hidden));
    panel.querySelector('.close').addEventListener('click', () => showSettings(false));
    panel.querySelector('.reset').addEventListener('click', T.resetSettings);
    panel.addEventListener('input', e => { if (e.target.name === 'auto') T.setSettings({ auto: e.target.checked ? 1 : 0 }); else if (e.target.name in DEFAULTS) T.setSettings({ [e.target.name]: Number(e.target.value) }); });
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') showSettings(false); });
    syncSettings();
    zones = { frets: [...root.querySelectorAll('[data-role=fret]')], strum: root.querySelector('.strum'), star: root.querySelector('.star'), pause: root.querySelector('.pause') };
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', (e) => end(e, 'up'));
    root.addEventListener('pointercancel', (e) => end(e, 'cancel'));
    root.addEventListener('lostpointercapture', (e) => end(e, 'lost'));
    layout();
    // Safari: sin esto un toque puede hacer zoom, mover la página, abrir la lupa o generar clics.
    const stop = (e) => { if (e.target.closest('.panel,.settings,.nav,.dpad')) return; if (e.cancelable) e.preventDefault(); };
    root.addEventListener('touchstart', stop, { passive: false });
    root.addEventListener('touchmove', stop, { passive: false });
    root.addEventListener('touchend', (e) => { stop(e); if (!e.touches.length && pointers.size) releaseAll('touchend-sync'); }, { passive: false });
    root.addEventListener('touchcancel', (e) => { stop(e); releaseAll('touchcancel'); }, { passive: false });
    root.addEventListener('contextmenu', stop);
    for (const ev of ['gesturestart', 'gesturechange', 'dblclick']) root.addEventListener(ev, stop, { passive: false });
  }

  // Traste por posición horizontal: un dedo que se corre un poco no suelta la nota sostenida y deslizar cambia de traste.
  function fretAt(x) {
    const a = zones.frets[0].getBoundingClientRect(), b = zones.frets[4].getBoundingClientRect();
    const first = a.left + a.width / 2, last = b.left + b.width / 2;
    return Math.max(0, Math.min(4, Math.round((x - first) / ((last - first) / 4))));
  }
  function down(e) {
    const role = e.target.closest('[data-role]')?.dataset.role;
    if (!role || !enabled || !panel.hidden) return;
    if (e.cancelable) e.preventDefault();
    try { e.target.setPointerCapture(e.pointerId); } catch {}
    const p = { role, fret: role === 'fret' ? Number(e.target.closest('[data-fret]').dataset.fret) : -1, anchorY: e.clientY };
    pointers.set(e.pointerId, p); st.downs++; st.maxPointers = Math.max(st.maxPointers, pointers.size);
    if (role === 'strum') strum(BTN.down);
    push();
    if (role === 'fret' && settings.auto && window.gh3Input?.songMode?.()) autoStrum();
  }
  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (p.role === 'fret') { const f = fretAt(e.clientX); if (f !== p.fret) { p.fret = f; push(); } }
    else if (p.role === 'strum') {  // deslizar arriba/abajo = otro rasgueo
      const dy = e.clientY - p.anchorY;
      if (Math.abs(dy) >= SWIPE_PX) { p.anchorY = e.clientY; strum(dy < 0 ? BTN.up : BTN.down); }
    }
  }
  function end(e, why) {
    if (!pointers.delete(e.pointerId)) return;
    if (why === 'up') st.ups++; else st.cancels++;
    push();
  }
  // Rasgueo = pulso corto. El juego consulta el mando cada pocos ms: para que vea un rasgueo nuevo, la misma
  // dirección tiene que haber estado suelta al menos GAP_MS. En canción se prueba la otra dirección (GH3 acepta
  // ambas); si tampoco está libre, el rasgueo se demora lo justo (nunca se pierde).
  const GAP_MS = 40, pressedAt = {}, releasedAt = {};
  let pending = [];
  const wait = (bit, now) => ((strumBits & bit) ? pressedAt[bit] + STRUM_MS - now + GAP_MS : releasedAt[bit] + GAP_MS - now);
  function strum(bit) {
    const now = performance.now(), other = bit === BTN.down ? BTN.up : BTN.down;
    if (wait(bit, now) > 0 && window.gh3Input?.songMode?.() && !(wait(other, now) > 0)) bit = other;
    const w = wait(bit, now);
    if (w > 0) { const id = setTimeout(() => { pending = pending.filter((x) => x !== id); strum(bit); }, w); pending.push(id); return; }
    strumBits |= bit; pressedAt[bit] = now; st.strums++; push();
    setTimeout(() => {
      if (!(strumBits & bit) || pressedAt[bit] !== now) return;  // releaseAll ya lo soltó
      strumBits &= ~bit; releasedAt[bit] = performance.now(); push();
    }, STRUM_MS);
  }
  // Rasgueo automático: espera unos ms para que dos dedos casi juntos cuenten como un acorde (un solo rasgueo).
  const CHORD_MS = 30; let autoTimer = 0;
  function autoStrum() { if (autoTimer) return; autoTimer = setTimeout(() => { autoTimer = 0; if ([...pointers.values()].some((p) => p.role === 'fret')) strum(BTN.down); }, CHORD_MS); }
  function releaseAll(why) {
    st.releases[why] = (st.releases[why] || 0) + 1;
    pointers.clear(); strumBits = 0; pending.forEach(clearTimeout); pending = []; push();
  }
  function push() {
    let frets = 0, buttons = strumBits;
    for (const p of pointers.values()) {
      if (p.role === 'fret') frets |= 1 << p.fret;
      else if (p.role === 'star') buttons |= BTN.back;
      else if (p.role === 'pause') buttons |= BTN.start;
    }
    st.frets = frets; st.buttons = buttons;
    if (zones) {
      zones.frets.forEach((z, i) => z.classList.toggle('on', !!(frets & (1 << i))));
      zones.strum.classList.toggle('on', !!(strumBits));
      zones.star.classList.toggle('on', !!(buttons & BTN.back));
      zones.pause.classList.toggle('on', !!(buttons & BTN.start));
    }
    const key = frets | (buttons << 5);
    if (key === lastKey) return;
    lastKey = key;
    window.gh3Input?.setTouch?.(frets, buttons);
  }

  addEventListener('blur', () => releaseAll('blur'));
  addEventListener('pagehide', () => releaseAll('pagehide'));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState !== 'visible') releaseAll('hidden'); });
  const portrait = matchMedia('(orientation: portrait)');
  const blockCanvasGesture = (e) => {
    if (enabled && e.target.id === 'r5Canvas' && e.cancelable) e.preventDefault();
  };
  for (const event of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange', 'dblclick', 'contextmenu'])
    document.addEventListener(event, blockCanvasGesture, { passive: false });
  portrait.addEventListener?.('change', () => { releaseAll('orientation'); requestAnimationFrame(layout); });
  addEventListener('resize', () => { releaseAll('resize'); layout(); });
  addEventListener('scroll', layout, { passive: true });
  window.visualViewport?.addEventListener('resize', layout);
  window.visualViewport?.addEventListener('scroll', layout);
  // landscape mode changes the canvas CSS after Jugar; observe the class too.
  const observeBody = () => { new MutationObserver(layout).observe(document.body, { attributes: true, attributeFilter: ['class'] }); };
  if (document.body) observeBody(); else addEventListener('DOMContentLoaded', observeBody);


  T.enable = () => { if (!root) build(); root.hidden = false; enabled = true; document.body.classList.add('gh3TouchActive'); layout(); };
  T.disable = () => { releaseAll('disable'); enabled = false; document.body.classList.remove('gh3TouchActive'); if (root) root.hidden = true; };
  T.releaseAll = releaseAll;
  // window.gh3TouchDeferred = true (p. ej. gh3-diag.js): no se activa sola; la página llama gh3Touch.enable().
  const start = () => { if (!window.gh3TouchDeferred && (q === '1' || (q !== '0' && coarse))) T.enable(); };
  if (document.body) start(); else addEventListener('DOMContentLoaded', start);
})();
