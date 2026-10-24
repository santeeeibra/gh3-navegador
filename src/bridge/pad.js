// Mando en pantalla (multitáctil) + teclado. Genera el estado de un mando de Xbox 360 y lo entrega con enviar(estado).
const BIT = {UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, START: 0x10, BACK: 0x20, LB: 0x100, RB: 0x200, A: 0x1000, B: 0x2000, X: 0x4000, Y: 0x8000};
const TECLAS = { // teclado de escritorio
  ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
  KeyQ: 'LB', KeyW: 'LT', KeyE: 'RB', KeyR: 'RT', Space: 'A', Enter: 'START', Backspace: 'BACK',
  KeyI: 'STICK_UP', KeyK: 'STICK_DOWN',
};
const MAX = 32767;
const lim = v => Math.max(-1, Math.min(1, v));

export function montarMando(raiz, enviar) {
  const e = {btn: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0};
  const cuenta = {}; // cuántos dedos/teclas sostienen cada botón
  let ultimo = '';
  const push = () => { const s = JSON.stringify(e); if (s !== ultimo) { ultimo = s; enviar({...e}); } };
  const set = (b, down) => {
    cuenta[b] = Math.max(0, (cuenta[b] || 0) + (down ? 1 : -1));
    const on = cuenta[b] > 0;
    if (b === 'LT') e.lt = on ? 255 : 0;
    else if (b === 'RT') e.rt = on ? 255 : 0;
    else if (b === 'STICK_UP' || b === 'STICK_DOWN') e.ry = (cuenta.STICK_UP > 0 ? MAX : 0) - (cuenta.STICK_DOWN > 0 ? MAX : 0);
    else if (on) e.btn |= BIT[b]; else e.btn &= ~BIT[b];
    push();
  };
  const mk = (b, txt, cls, color) => {
    const x = document.createElement('button');
    x.className = 'pb ' + cls; x.textContent = txt; x.dataset.b = b;
    if (color) x.style.background = color;
    return x;
  };
  const caja = (cls, ...hijos) => { const d = document.createElement('div'); d.className = cls; d.append(...hijos); return d; };
  raiz.innerHTML = '';
  const izq = caja('col',
    caja('row', mk('LT', 'L2', 'trig', '#5a5a66'), mk('LB', 'L1', 'trig', '#5a5a66')),
    caja('dpad', mk('UP', '▲', 'd up', '#444'), mk('LEFT', '◀', 'd lf', '#444'), mk('RIGHT', '▶', 'd rg', '#444'), mk('DOWN', '▼', 'd dn', '#444')));
  const centro = caja('mid', mk('BACK', 'Back', 'small', '#444'), mk('START', 'Pausa', 'small', '#444'));
  const stick = caja('stick');
  stick.innerHTML = '<div class="knob"></div><span>rasguear ↕</span>';
  const der = caja('col',
    caja('row', mk('RB', 'R1', 'trig', '#5a5a66'), mk('RT', 'R2', 'trig', '#5a5a66')),
    stick,
    caja('face', mk('Y', 'Y', 'f', '#e8c71c'), mk('X', 'X', 'f', '#2f6fe0'), mk('B', 'B', 'f', '#e0352b'), mk('A', 'A', 'f', '#2fbf4f')));
  raiz.append(izq, centro, der);

  // botones: un dedo = un botón; multitáctil
  const activos = new Map();
  raiz.addEventListener('pointerdown', ev => {
    const t = ev.target.closest('.pb'); if (!t) return;
    ev.preventDefault(); t.setPointerCapture(ev.pointerId);
    activos.set(ev.pointerId, t.dataset.b); t.classList.add('on'); set(t.dataset.b, true);
  });
  const soltar = ev => {
    const b = activos.get(ev.pointerId); if (!b) return;
    activos.delete(ev.pointerId); set(b, false);
    if (![...activos.values()].includes(b)) raiz.querySelectorAll('.pb[data-b="' + b + '"]').forEach(x => x.classList.remove('on'));
  };
  raiz.addEventListener('pointerup', soltar); raiz.addEventListener('pointercancel', soltar);

  // stick derecho: arrastrar el dedo; el eje vertical rasguea
  const knob = stick.querySelector('.knob'); let sid = null;
  const mover = ev => {
    const r = stick.getBoundingClientRect();
    const dx = lim((ev.clientX - (r.left + r.width / 2)) / (r.width / 2));
    const dy = lim((ev.clientY - (r.top + r.height / 2)) / (r.height / 2));
    e.rx = Math.round(dx * MAX); e.ry = Math.round(-dy * MAX);
    knob.style.transform = 'translate(' + dx * 40 + '%, ' + dy * 40 + '%)'; push();
  };
  stick.addEventListener('pointerdown', ev => { ev.preventDefault(); sid = ev.pointerId; stick.setPointerCapture(sid); mover(ev); });
  stick.addEventListener('pointermove', ev => { if (ev.pointerId === sid) mover(ev); });
  const finStick = ev => { if (ev.pointerId !== sid) return; sid = null; e.rx = 0; e.ry = 0; knob.style.transform = ''; push(); };
  stick.addEventListener('pointerup', finStick); stick.addEventListener('pointercancel', finStick);
  raiz.addEventListener('contextmenu', ev => ev.preventDefault());

  const teclas = new Set();
  addEventListener('keydown', ev => { const b = TECLAS[ev.code]; if (!b || ev.repeat || teclas.has(ev.code)) return; ev.preventDefault(); teclas.add(ev.code); set(b, true); });
  addEventListener('keyup', ev => { const b = TECLAS[ev.code]; if (!b || !teclas.delete(ev.code)) return; ev.preventDefault(); set(b, false); });
  addEventListener('blur', () => { for (const c of [...teclas]) set(TECLAS[c], false); teclas.clear(); });
}
