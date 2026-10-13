// Claude 2026-10-12: "cinta" de botones al lado de la ventana del juego. Muestra en tiempo real los trastes
// (verde, rojo, amarillo, azul, naranja) y el rasgueo; lo nuevo entra abajo y sube. Solo lee gh3Input.stats
// (no toca el juego). Se prende/apaga con la casilla "Cinta de botones" (Gráficos); en celular arranca apagada.
(() => {
  const KEY = 'gh3tape', COLORS = ['#3fc35b', '#e5463f', '#f2d33c', '#3e8ef0', '#f39a2e'], STRUM = '#e8ecf3';
  const LANE = 13, GAPX = 2, W = 6 * LANE + 7 * GAPX, SPEED = 120;  // px por segundo
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let on = !mobile; try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (typeof v === 'boolean') on = v; } catch {}
  let cv = null, ctx = null, last = 0, acc = 0;
  const css = `#gh3Tape{flex:0 0 ${W}px;width:${W}px;align-self:flex-start;background:#11141a;border:1px solid #2a2f3a;border-radius:8px;image-rendering:pixelated}
  #gh3Tape[hidden]{display:none} @media (max-width:900px){#gh3Tape{display:none}}`;
  const lanes = () => {
    const s = window.gh3Input?.stats; if (!s || s.buttons < 0) return 0;
    const b = s.buttons | 0, song = !!window.gh3Input.songMode?.();
    const f = song ? (s.frets | 0) : (b & 0x1000 ? 1 : 0) | (b & 0x2000 ? 2 : 0) | (b & 0x8000 ? 4 : 0) | (b & 0x4000 ? 8 : 0) | (b & 0x0100 ? 16 : 0);
    return f | (b & 0x3 ? 32 : 0);  // cruceta arriba/abajo = rasgueo
  };
  function frame(t) {
    requestAnimationFrame(frame);
    if (!on || !ctx) { last = t; return; }
    acc += Math.min(100, t - last) * SPEED / 1000; last = t;
    const dy = Math.floor(acc); if (!dy) return; acc -= dy;
    const h = cv.height;
    ctx.drawImage(cv, 0, dy, W, h - dy, 0, 0, W, h - dy);  // corre la cinta hacia arriba
    ctx.fillStyle = '#11141a'; ctx.fillRect(0, h - dy, W, dy);
    const m = lanes();
    for (let i = 0; i < 6; i++) if (m & (1 << i)) { ctx.fillStyle = i < 5 ? COLORS[i] : STRUM; ctx.fillRect(GAPX + i * (LANE + GAPX), h - dy, LANE, dy); }
    // guía de carriles
    ctx.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 6; i++) ctx.fillRect(GAPX + i * (LANE + GAPX) + (LANE >> 1), h - dy, 1, dy);
  }
  function mount() {
    const row = document.getElementById('gh3Row'), box = document.getElementById('r5Box');
    if (!row || !box) return false;
    const st = document.createElement('style'); st.textContent = css; document.head.append(st);
    cv = document.createElement('canvas'); cv.id = 'gh3Tape'; cv.width = W; cv.title = 'Botones que vas tocando';
    box.after(cv); ctx = cv.getContext('2d');
    const fit = () => { const h = Math.max(120, Math.round(box.getBoundingClientRect().height)); if (cv.height !== h) { cv.height = h; cv.style.height = h + 'px'; } };
    new ResizeObserver(fit).observe(box); fit(); cv.hidden = !on;
    const gfx = document.querySelector('#gh3Panel section[data-tab="gfx"]');
    if (gfx) {
      const r = document.createElement('div'); r.className = 'row';
      r.innerHTML = '<label><input id="gh3TapeOn" type="checkbox"> Cinta de botones</label>';
      gfx.prepend(r); const c = r.querySelector('input'); c.checked = on;
      c.onchange = () => { on = c.checked; cv.hidden = !on; try { localStorage.setItem(KEY, JSON.stringify(on)); } catch {} c.blur(); };
    }
    requestAnimationFrame(t => { last = t; frame(t); });
    return true;
  }
  const wait = setInterval(() => { if (document.getElementById('gh3Panel') && mount()) clearInterval(wait); }, 300);
  window.gh3Tape = { enabled: () => on };
})();
