// C1 (Claude): controles de la página -> mando del GH3 wasm. Teclado y Gamepad API (mando de PS4/Xbox,
// guitarra XInput) se juntan en un solo mando de Xbox y se escriben directo en la memoria compartida del
// juego (estado en vivo de tools/d1-wasm/g1e_input.cpp), sin pasar por mensajes al worker.
// Disposición en ptr: Int32 [0] seq, [1] botones, [2] gatillos (izq | der << 8), [3..6] lx ly rx ry,
// [7] origen (1 teclado, 2 mando, 3 ambos); Float64 en ptr+32 = hora de escritura (ms, timeOrigin+now);
// Int32 [10] = botones apretados desde la última lectura del juego (así un toque corto no se pierde).
// El calendario ?press= sigue funcionando aparte (diagnósticos) y se suma a esto.
(() => {
  const BTN = { up: 0x0001, down: 0x0002, left: 0x0004, right: 0x0008, start: 0x0010, back: 0x0020,
    ls: 0x0040, rs: 0x0080, lb: 0x0100, rb: 0x0200, a: 0x1000, b: 0x2000, x: 0x4000, y: 0x8000 };
  // Teclado: el mismo esquema que el nativo (gh3.toml de luisxl15) + A S D F G como trastes alternativos.
  const KEYS = {
    Digit1: 'a', KeyA: 'a',      // verde (confirmar en menús)
    Digit2: 'b', KeyS: 'b',      // rojo (volver en menús)
    Digit3: 'y', KeyD: 'y',      // amarillo
    Digit4: 'x', KeyF: 'x',      // azul
    Digit5: 'lb', KeyG: 'lb',    // naranja
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',  // rasgueo y menú
    Enter: 'start', NumpadEnter: 'start',
    Tab: 'back', Space: 'back',  // BACK = poder estelar
  };
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
  function isGuitar(gamepad) {
    // Detectar guitarra por nombre o patrón de botones
    if (/guitar|gh3|rock band/i.test(gamepad?.id || '')) return true;
    // Guitarra típicamente tiene 10-12 botones (menos que un mando normal)
    if (gamepad?.buttons?.length >= 10 && gamepad?.buttons?.length <= 12) return true;
    return false;
  }
  function readPad() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const p = pads[0];
    if (!p) { st.pad = null; return { b: 0, tr: 0, axes: [0, 0, 0, 0] }; }
    st.pad = p.id; st.mapping = p.mapping || 'no estándar';
    const guitar = isGuitar(p);
    if (guitar && st.mapping === 'no estándar') st.mapping = 'Guitarra (auto-detectada)';
    let b = 0;
    p.buttons.forEach((x, i) => { if (PAD[i] && (x.pressed || x.value > 0.5)) b |= BTN[PAD[i]]; });
    const t = (i) => Math.round(Math.min(1, Math.max(0, p.buttons[i]?.value || 0)) * 255);
    const a = p.axes;  // XInput: arriba = positivo; Gamepad API: arriba = negativo
    return { b, tr: t(6) | (t(7) << 8), axes: [ax(a[0] || 0), ax(-(a[1] || 0)), ax(a[2] || 0), ax(-(a[3] || 0))], guitar };
  }
  // Canción: GH3 con mando común usa verde LT, rojo LB, amarillo RB, azul RT, naranja A (comprobado con imagen
  // en el nativo). Si la página define G.songMode() y devuelve true, los trastes del teclado van a ese esquema.
  const SONG_FRETS = [['Digit1', 'KeyA'], ['Digit2', 'KeyS'], ['Digit3', 'KeyD'], ['Digit4', 'KeyF'], ['Digit5', 'KeyG']];
  function update() {
    let kbBits = 0, kbTr = 0;
    const song = !!(G.songMode && G.songMode());
    for (const k of kb) {
      const f = song ? SONG_FRETS.findIndex((c) => c.includes(k)) : -1;
      if (f === 0) kbTr |= 255; else if (f === 1) kbBits |= BTN.lb; else if (f === 2) kbBits |= BTN.rb;
      else if (f === 3) kbTr |= 255 << 8; else if (f === 4) kbBits |= BTN.a; else kbBits |= BTN[KEYS[k]];
    }
    const p = readPad();
    p.tr = Math.max(p.tr & 255, kbTr & 255) | (Math.max(p.tr >> 8, kbTr >> 8) << 8);
    const buttons = kbBits | p.b, source = (kbBits || kbTr ? 1 : 0) | (p.b || p.tr || p.axes.some((v) => v) ? 2 : 0);
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
    el.textContent = `Controles: ${G.attached ? 'conectados al juego' : 'esperando al juego'} · teclado 1-5 / A S D F G, flechas, Enter, Tab · mando: ${st.pad ? st.pad + ' (' + st.mapping + ')' : 'ninguno (apretá un botón)'} · apretado: ${held}`;
  }
  const typing = (e) => /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '');
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
