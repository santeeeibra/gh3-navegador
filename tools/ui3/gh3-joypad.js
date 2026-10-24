// Claude 2026-10-14 (ui3): botonera "joystick" para el celular, a pedido de Santi (los trastes táctiles clásicos
// quedan justo donde pasan las notas). Cinco botones redondos de colores en abanico a la derecha (pulgar), fuera de la
// autopista; el rasgueo y el poder estelar de gh3-touch.js pasan a la izquierda. Apretar un color rasguea solo a los
// 20 ms (un acorde entra junto), como el mando; la zona RASGUEO sigue funcionando. Se elige en el panel táctil
// ("Botonera") y se guarda en localStorage gh3pad = clasica|joystick. Se suma a gh3Input.setTouch (no lo reemplaza).
(() => {
  const BTN_DOWN = 0x0002, COLORS = ['#2ecc40', '#ff3b30', '#ffd60a', '#0a84ff', '#ff9500'];
  const NAMES = ['Verde', 'Rojo', 'Amarillo', 'Azul', 'Naranja'];
  let mode = 'clasica'; try { mode = localStorage.getItem('gh3pad') || 'clasica'; } catch {}
  const css = `
#gh3Joy{position:fixed;inset:0;z-index:51;pointer-events:none;display:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
body.gh3Joy #gh3Joy{display:block}
/* Claude 2026-10-16 (Santi: «se ven feos y molestan; formato joystick»): botones planos tipo mando, en rombo como
   A/B/X/Y de Xbox (verde abajo, rojo derecha, amarillo arriba, azul izquierda) y el naranja como gatillo (LB) arriba
   a la izquierda del rombo. Aro de color sobre fondo oscuro translúcido; al apretar se llenan de color. */
#gh3Joy .jb{position:absolute;pointer-events:auto;touch-action:none;border-radius:50%;box-sizing:border-box;
  background:radial-gradient(circle,color-mix(in srgb,var(--c) 70%,transparent) 0 36%,rgba(10,10,14,.5) 39%);
  border:2.5px solid color-mix(in srgb,var(--c) 80%,transparent);box-shadow:0 2px 8px rgba(0,0,0,.35);
  opacity:.62;transform:translateZ(0);transition:transform .05s,opacity .05s,background-color .05s}
#gh3Joy .jb.lb{border-radius:14px}
#gh3Joy .jb.on{opacity:1;transform:scale(.93);background:var(--c);border-color:#fff;box-shadow:0 0 16px var(--c)}
body.gh3Joy #gh3Touch .frets{display:none!important}
body.gh3Joy #gh3Touch .strum{right:auto!important;left:calc(env(safe-area-inset-left) + 8px)!important;top:auto!important;bottom:calc(env(safe-area-inset-bottom) + 8px)!important;width:22vw!important;height:46vh!important}
/* Claude 2026-10-16: estrella = botón redondo chico abajo a la izquierda (antes óvalo gigante encima de la cruceta). */
body.gh3Joy #gh3Touch .star{right:auto!important;left:calc(env(safe-area-inset-left) + 10px)!important;top:auto!important;bottom:calc(env(safe-area-inset-bottom) + 10px)!important;width:56px!important;height:56px!important;border-radius:50%!important;font-size:22px!important}
@media (orientation:portrait){#gh3Joy{display:none!important}}
/* Celular: con el panel ☰ abierto los controles táctiles (z-index propio) quedaban encima y tapaban sus pestañas. */
body.gh3DrawerOpen #gh3Touch,body.gh3DrawerOpen #gh3Joy{display:none!important}
@media (orientation:portrait){html.gh3Mobile #gh3MenuBtn{left:auto!important;right:calc(env(safe-area-inset-right) + 8px)!important;transform:none!important}html.gh3Mobile body.gh3DrawerOpen #gh3MenuBtn{right:auto!important;left:calc(env(safe-area-inset-left) + 4px)!important;width:36px!important}}
#gh3PadPick{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}
#gh3PadPick button{flex:1 1 0;min-width:120px;padding:8px;border-radius:8px;border:1px solid #555;background:#222;color:#eee;font:600 13px system-ui}
#gh3PadPick button[aria-pressed=true]{background:#ffd23f;color:#111;border-color:#ffd23f}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  let root = null, btns = [], frets = 0, autoUntil = 0, last = { f: 0, b: 0 }, orig = null;
  const pointers = new Map();
  function layout() {
    if (!root) return;
    const W = innerWidth, H = innerHeight, s = Math.min(H * .15, W * .075, 58), g = s * .94;  // g: centro → botón
    const ins = window.gh3Touch?.insets?.() || { right: 0, bottom: 0 };  // muesca del iPhone en horizontal
    const cx = W - ins.right - g - s * .6, cy = H - ins.bottom - g - s * .6;
    // verde abajo, rojo derecha, amarillo arriba, azul izquierda (como A/B/Y/X); naranja = gatillo arriba a la izquierda.
    const pos = [[0, g], [g, 0], [0, -g], [-g, 0]];
    btns.forEach((b, i) => {
      if (i === 4) {
        const w = s * 1.2, h = s * .6, x = cx - g - s * .15, y = cy - g - s * .35;
        b.classList.add('lb'); Object.assign(b.style, { width: w + 'px', height: h + 'px', left: (x - w / 2) + 'px', top: (y - h / 2) + 'px' });
        return;
      }
      const [dx, dy] = pos[i];
      Object.assign(b.style, { width: s + 'px', height: s + 'px', left: (cx + dx - s / 2) + 'px', top: (cy + dy - s / 2) + 'px' });
    });
  }
  function push() {
    if (!orig) return;
    const strum = performance.now() < autoUntil ? BTN_DOWN : 0;
    orig(last.f | frets, last.b | strum);
  }
  function recompute() {
    let f = 0; for (const i of pointers.values()) if (i >= 0) f |= 1 << i;
    const nw = f & ~frets; frets = f;
    btns.forEach((b, i) => b.classList.toggle('on', !!(f & (1 << i))));
    // Claude 2026-10-16 (Santi: «el toque llega tarde»): rasgueo en el MISMO envío que el color (antes esperaba 20 ms).
    // Un acorde con el segundo dedo unos ms después sigue entrando: el rasgueo queda apretado 50 ms.
    if (nw && window.gh3Input?.songMode?.()) { autoUntil = performance.now() + 50; setTimeout(push, 55); }
    push();
  }
  const hit = (x, y) => { const el = document.elementFromPoint(x, y); const i = btns.indexOf(el); return i; };
  function build() {
    root = document.createElement('div'); root.id = 'gh3Joy'; root.setAttribute('aria-label', 'Botonera de colores');
    btns = COLORS.map((c, i) => { const b = document.createElement('div'); b.className = 'jb'; b.style.setProperty('--c', c); b.setAttribute('aria-label', NAMES[i]); root.appendChild(b); return b; });
    root.addEventListener('pointerdown', (e) => { const i = btns.indexOf(e.target); if (i < 0) return; e.preventDefault(); pointers.set(e.pointerId, i); recompute(); });
    addEventListener('pointermove', (e) => { if (!pointers.has(e.pointerId)) return; const i = hit(e.clientX, e.clientY); if (i >= 0 && i !== pointers.get(e.pointerId)) { pointers.set(e.pointerId, i); recompute(); } }, { passive: true });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => { if (pointers.delete(e.pointerId)) recompute(); });
    const clear = () => { if (pointers.size) { pointers.clear(); recompute(); } };
    addEventListener('blur', clear); document.addEventListener('visibilitychange', clear); addEventListener('orientationchange', clear);
    document.body.appendChild(root); layout(); addEventListener('resize', layout);
  }
  function apply() {
    const touchOn = !!window.gh3Touch?.enabled?.();
    document.body.classList.toggle('gh3Joy', mode === 'joystick' && touchOn);
    if (mode !== 'joystick' && pointers.size) { pointers.clear(); recompute(); }
  }
  function picker() {
    const panel = document.getElementById('gh3TouchPanel');
    if (!panel || document.getElementById('gh3PadPick')) return;
    const d = document.createElement('div'); d.id = 'gh3PadPick';
    d.innerHTML = '<span style="width:100%;font:700 13px system-ui">Botonera</span><button data-m="clasica">Clásica (sobre la autopista)</button><button data-m="joystick">Joystick (rombo al costado)</button>';
    const sync = () => d.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.m === mode)));
    d.addEventListener('click', (e) => { const m = e.target?.dataset?.m; if (!m) return; mode = m; try { localStorage.setItem('gh3pad', m); } catch {} sync(); apply(); });
    sync(); panel.prepend(d);
  }
  const boot = setInterval(() => {
    if (!document.body || !window.gh3Input?.setTouch) return;
    if (!orig) {
      orig = window.gh3Input.setTouch;
      window.gh3Input.setTouch = (f, b) => { last = { f, b }; push(); };
      window.gh3Joypad = { setMode: (m) => { mode = m; apply(); }, mode: () => mode, stats: () => ({ frets, pointers: pointers.size }) };
    }
    if (!root) build();
    apply(); picker();
  }, 300);
  void boot;
})();
