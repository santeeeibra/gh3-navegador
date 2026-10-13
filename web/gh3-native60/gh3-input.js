// C1 (Claude): controles de la página -> mando del GH3 wasm. Teclado y Gamepad API (mando de PS4/Xbox,
// guitarra XInput) se juntan en un solo mando de Xbox y se escriben directo en la memoria compartida del
// juego (estado en vivo de tools/d1-wasm/g1e_input.cpp), sin pasar por mensajes al worker.
// Disposición en ptr: Int32 [0] seq, [1] botones, [2] gatillos (izq | der << 8), [3..6] lx ly rx ry,
// [7] origen (1 teclado, 2 mando, 3 ambos); Float64 en ptr+32 = hora de escritura (ms, timeOrigin+now);
// Int32 [10] = botones apretados desde la última lectura del juego (así un toque corto no se pierde).
// El calendario ?press= sigue funcionando aparte (diagnósticos) y se suma a esto.
// Táctil (Claude, copia artifacts/d1-wasm/touch): gh3-touch.js llama G.setTouch(trastes, botones); los trastes
// táctiles siguen el mismo esquema que el teclado (canción: LT/LB/RB/RT/A; menús: A/B/Y/X/LB). Origen [7] |= 4.
(() => {
  const BTN = { up: 0x0001, down: 0x0002, left: 0x0004, right: 0x0008, start: 0x0010, back: 0x0020,
    ls: 0x0040, rs: 0x0080, lb: 0x0100, rb: 0x0200, a: 0x1000, b: 0x2000, x: 0x4000, y: 0x8000 };
  // Teclado: el mismo esquema que el nativo (gh3.toml de luisxl15) + A S D F G como trastes alternativos.
  // Panel (r5pipe): acciones reasignables; se guardan en localStorage 'gh3keys'.
  const ACTIONS = [['verde', 'a'], ['rojo', 'b'], ['amarillo', 'y'], ['azul', 'x'], ['naranja', 'lb'],
    ['rasgueo arriba', 'up'], ['rasgueo abajo', 'down'], ['izquierda', 'left'], ['derecha', 'right'],
    ['Start / pausa', 'start'], ['Poder estelar', 'back'], ['Volver (menú)', 'b']];
  const DEFAULT_BINDS = { verde: ['Digit1', 'KeyA'], rojo: ['Digit2', 'KeyS'], amarillo: ['Digit3', 'KeyD'],
    azul: ['Digit4', 'KeyF'], naranja: ['Digit5', 'KeyG'], 'rasgueo arriba': ['ArrowUp'], 'rasgueo abajo': ['ArrowDown'],
    izquierda: ['ArrowLeft'], derecha: ['ArrowRight'], 'Start / pausa': ['Enter', 'NumpadEnter'], 'Poder estelar': ['Tab', 'Space'], 'Volver (menú)': ['Escape', 'Backspace'] };
  let binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
  try { const saved = JSON.parse(localStorage.getItem('gh3keys') || 'null'); if (saved) for (const [a] of ACTIONS) if (Array.isArray(saved[a])) binds[a] = saved[a].slice(0, 2); } catch {}
  let tapBits = 0;  // botones del panel (Volver/Start): toque corto de ~120 ms
  let touchFrets = 0, touchBits = 0;  // gh3-touch.js: máscara de 5 trastes + botones Xbox
  let KEYS = {}, SONG_FRETS = [];
  function rebuild() {
    KEYS = {}; for (const [a, b] of ACTIONS) for (const k of binds[a]) if (k) KEYS[k] = b;
    SONG_FRETS = ['verde', 'rojo', 'amarillo', 'azul', 'naranja'].map((a) => binds[a].filter(Boolean));
  }
  rebuild();
  // Gamepad API con mapeo estándar (índice -> botón Xbox). En un mando de PS4: Cruz=A, Círculo=B,
  // Cuadrado=X, Triángulo=Y, L1=LB, R1=RB, Share=BACK, Options=START. Guitarra XInput: verde A, rojo B,
  // amarillo Y, azul X, naranja LB, rasgueo = cruceta, whammy = palanca derecha.
  const PAD = ['a', 'b', 'x', 'y', 'lb', 'rb', null, null, 'back', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right'];
  const NAMES = Object.fromEntries(Object.entries(BTN).map(([k, v]) => [v, k.toUpperCase()]));

  let i32 = null, f64 = null;
  const kb = new Set();
  const st = { buttons: 0, triggers: 0, axes: [0, 0, 0, 0], source: 0, writes: 0, pad: null, mapping: '' };
  const G = window.gh3Input = { stats: st, attached: false };

  const ax = (v) => Math.max(-32768, Math.min(32767, Math.round((Math.abs(v) < 0.08 ? 0 : v) * 32767)));
  function readPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const p = pads[0];
    if (!p) { st.pad = null; return { b: 0, tr: 0, axes: [0, 0, 0, 0] }; }
    st.pad = p.id; st.mapping = p.mapping || 'no estándar';
    let b = 0;
    p.buttons.forEach((x, i) => { if (PAD[i] && (x.pressed || x.value > 0.5)) b |= BTN[PAD[i]]; });
    const t = (i) => Math.round(Math.min(1, Math.max(0, p.buttons[i]?.value || 0)) * 255);
    const a = p.axes;  // XInput: arriba = positivo; Gamepad API: arriba = negativo
    return { b, tr: t(6) | (t(7) << 8), axes: [ax(a[0] || 0), ax(-(a[1] || 0)), ax(a[2] || 0), ax(-(a[3] || 0))] };
  }
  // Canción: GH3 con mando común usa verde LT, rojo LB, amarillo RB, azul RT, naranja A (comprobado con imagen
  // en el nativo). Si la página define G.songMode() y devuelve true, los trastes del teclado van a ese esquema.
  function update() {
    let kbBits = 0, kbTr = 0;
    const song = !!(G.songMode && G.songMode());
    for (const k of kb) {
      const f = song ? SONG_FRETS.findIndex((c) => c.includes(k)) : -1;
      if (f === 0) kbTr |= 255; else if (f === 1) kbBits |= BTN.lb; else if (f === 2) kbBits |= BTN.rb;
      else if (f === 3) kbTr |= 255 << 8; else if (f === 4) kbBits |= BTN.a; else kbBits |= BTN[KEYS[k]];
    }
    let tcBits = touchBits, tcTr = 0;
    for (let f = 0; f < 5; f++) if (touchFrets & (1 << f)) {
      if (!song) tcBits |= BTN[['a', 'b', 'y', 'x', 'lb'][f]];
      else if (f === 0) tcTr |= 255; else if (f === 1) tcBits |= BTN.lb; else if (f === 2) tcBits |= BTN.rb;
      else if (f === 3) tcTr |= 255 << 8; else tcBits |= BTN.a;
    }
    kbTr |= tcTr;
    const p = readPad();
    const padOn = !!(p.b || p.tr || p.axes.some((v) => v));
    p.tr = Math.max(p.tr & 255, kbTr & 255) | (Math.max(p.tr >> 8, kbTr >> 8) << 8);
    const buttons = kbBits | tcBits | p.b | tapBits, source = (kbBits || (kbTr & ~tcTr) ? 1 : 0) | (padOn ? 2 : 0) | (tcBits || tcTr ? 4 : 0);
    st.frets = song ? ((p.tr & 255) > 128 ? 1 : 0) | (buttons & BTN.lb ? 2 : 0) | (buttons & BTN.rb ? 4 : 0) | ((p.tr >> 8) > 128 ? 8 : 0) | (buttons & BTN.a ? 16 : 0) : 0;
    const same = buttons === st.buttons && p.tr === st.triggers && source === st.source && p.axes.every((v, i) => v === st.axes[i]);
    if (same) return;
    st.prev = st.buttons < 0 ? 0 : st.buttons;
    Object.assign(st, { buttons, triggers: p.tr, axes: p.axes, source });
    if (i32) {
      const pressed = buttons & ~(st.prev | 0);
      if (pressed) Atomics.or(i32, 10, pressed);
      Atomics.store(i32, 1, buttons); Atomics.store(i32, 2, p.tr);
      for (let i = 0; i < 4; i++) Atomics.store(i32, 3 + i, p.axes[i]);
      Atomics.store(i32, 7, source);
      f64[0] = performance.timeOrigin + performance.now();
      Atomics.add(i32, 0, 1);  // último: el juego relee todo al ver seq nuevo
      st.writes++;
    }
    show();
  }
  function show() {
    const el = document.getElementById('c1Input');
    if (!el) return;
    const held = Object.keys(NAMES).filter((v) => st.buttons & v).map((v) => NAMES[v]).join(' ') || '—';
    el.textContent = `Controles: ${G.attached ? 'conectados al juego' : 'esperando al juego'} · teclado: ver panel · mando: ${st.pad ? st.pad + ' (' + st.mapping + ')' : 'ninguno (apretá un botón)'} · apretado: ${held}`;
  }
  const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');
  let capture = null;
  G.actions = ACTIONS.map(([a]) => a);
  G.getBinds = () => JSON.parse(JSON.stringify(binds));
  const save = () => { rebuild(); try { localStorage.setItem('gh3keys', JSON.stringify(binds)); } catch {} };
  G.resetBinds = () => { binds = JSON.parse(JSON.stringify(DEFAULT_BINDS)); save(); };
  // Próxima tecla apretada = nueva tecla de esa acción (Escape cancela, Backspace borra el casillero).
  G.capture = (action, slot, done) => { capture = { action, slot, done }; };
  G.setTouch = (frets, bits) => { touchFrets = frets & 31; touchBits = bits & 0xFFFF; update(); };
  G.tap = (name) => { const bit = BTN[name]; if (!bit) return; tapBits |= bit; update(); setTimeout(() => { tapBits &= ~bit; update(); }, 120); };
  addEventListener('keydown', (e) => {
    if (capture) {
      e.preventDefault(); e.stopPropagation();
      const c = capture; capture = null;
      if (e.code !== 'Escape') {
        const code = e.code === 'Backspace' ? '' : e.code;
        if (code) for (const a of Object.keys(binds)) binds[a] = binds[a].map((k) => (k === code ? '' : k));  // sin teclas repetidas
        binds[c.action][c.slot] = code; save();
      }
      c.done && c.done(); return;
    }
  }, true);
  addEventListener('keydown', (e) => {
    if (!KEYS[e.code] || typing(e)) return;
    e.preventDefault();
    if (document.activeElement?.tagName === 'BUTTON') document.activeElement.blur();  // Enter/Espacio no "clickean" botones
    if (!kb.has(e.code)) { kb.add(e.code); update(); }
  });
  addEventListener('keyup', (e) => { if (kb.delete(e.code)) { e.preventDefault(); update(); } });
  addEventListener('blur', () => { if (kb.size) { kb.clear(); update(); } });  // sin teclas trabadas
  addEventListener('gamepadconnected', () => { update(); show(); });
  addEventListener('gamepaddisconnected', () => { update(); show(); });
  setInterval(update, 8);  // la Gamepad API no avisa cambios: se consulta cada 8 ms
  G.attach = (sab, ptr) => {
    i32 = new Int32Array(sab, ptr, 11); f64 = new Float64Array(sab, ptr + 32, 1);
    G.attached = true; st.buttons = -1; update(); show();
  };
  addEventListener('DOMContentLoaded', show);
})();
