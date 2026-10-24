// Claude 2026-10-14 (ui3): animación de "Preparando" al tocar JUGAR. Antes la barra (.gh3Neck de gh3-pro.js) quedaba
// oculta mientras preparaba (regla body:not(.loaderStarted) …) y sólo se veía con error. Ahora: mástil de guitarra
// dibujado en canvas (madera con veta, trastes de níquel, incrustaciones de nácar, cuerdas metálicas) que se ilumina
// hasta el porcentaje, con púa encendida, chispas y cuerdas vibrando. Lee #loaderProgress / #loaderBytes / #loaderStatus.
// Sólo dibuja mientras prepara (body.gh3Prep) y la pestaña está visible. También empareja los botones de la fila.
(() => {
  const css = `
body.gh3Prep #loaderPanel .gh3Neck{display:none!important}
#gh3LoadFx{display:none;position:relative;width:100%;max-width:820px;margin:4px auto 30px;align-self:center}
body.gh3Prep #gh3LoadFx{display:block}
#gh3LoadFx canvas{display:block;width:100%;height:clamp(96px,17vw,150px);border-radius:10px;background:#120a06;
  box-shadow:0 0 0 1px #6b5b44,0 0 0 4px #000,0 16px 44px rgba(0,0,0,.65),0 0 60px rgba(255,170,60,.08)}
#gh3LoadFx .lfx{position:absolute;left:4px;right:4px;bottom:-26px;display:flex;justify-content:space-between;align-items:baseline;
  font:600 16px/1 var(--rock,Teko,system-ui),system-ui;letter-spacing:.06em;color:#d9cdb4;text-transform:uppercase}
#gh3LoadFx .lfx b{font-size:24px;color:#ffd23f;text-shadow:0 0 12px rgba(255,190,60,.55)}
#loaderPanel .row{display:flex!important;gap:12px!important;align-items:stretch!important;justify-content:center!important;flex-wrap:nowrap!important}
#loaderPanel .row>button{flex:1 1 0!important;min-width:0!important;max-width:340px!important;height:58px!important;margin:0!important;
  padding:0 12px!important;box-sizing:border-box!important;font-size:clamp(14px,2.2vw,22px)!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@media (prefers-reduced-motion:reduce){#gh3LoadFx canvas{box-shadow:0 0 0 1px #6b5b44,0 0 0 4px #000}}`;
  const st = document.createElement('style'); st.id = 'gh3LoadFxStyle'; st.textContent = css; document.head.appendChild(st);

  const COLORS = ['#2ecc40', '#ff3b30', '#ffd60a', '#0a84ff', '#ff9500'];
  let box = null, cv = null, ctx = null, txt = null, base = null, W = 0, H = 0, dpr = 1, raf = 0, shown = 0, t0 = 0;
  const sparks = [];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Posición de los trastes como en una guitarra real: distancia a la cejuela = L·(1 − 2^(−n/12)), estirada al ancho.
  const fretX = (n, w) => { const last = 1 - Math.pow(2, -22 / 12); return 14 + (w - 28) * (1 - Math.pow(2, -n / 12)) / last; };
  const rnd = (a) => { let s = a >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  function paintBase() {
    base = document.createElement('canvas'); base.width = W; base.height = H;
    const g = base.getContext('2d'), r = rnd(1979);
    // Madera (palisandro): base + vetas largas + poro fino.
    const wood = g.createLinearGradient(0, 0, 0, H);
    wood.addColorStop(0, '#2b1409'); wood.addColorStop(.5, '#3a1d0e'); wood.addColorStop(1, '#22100a');
    g.fillStyle = wood; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      const y = r() * H, a = .03 + r() * .09, dark = r() < .55;
      g.strokeStyle = dark ? `rgba(10,4,2,${a})` : `rgba(120,64,30,${a * .8})`; g.lineWidth = (.6 + r() * 2.4) * dpr;
      g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= W; x += 40 * dpr) g.lineTo(x, y + Math.sin(x / (90 * dpr) + i) * (2 + r() * 3) * dpr);
      g.stroke();
    }
    const img = g.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * 14; d[i] += n; d[i + 1] += n * .8; d[i + 2] += n * .6; }
    g.putImageData(img, 0, 0);
    // Bordes del diapasón (binding) y sombra interna.
    const edge = g.createLinearGradient(0, 0, 0, H);
    edge.addColorStop(0, 'rgba(0,0,0,.75)'); edge.addColorStop(.12, 'rgba(0,0,0,0)'); edge.addColorStop(.88, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,.8)');
    g.fillStyle = edge; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e9e2cf'; g.fillRect(0, 0, W, 2 * dpr); g.fillRect(0, H - 2 * dpr, W, 2 * dpr);
    // Incrustaciones de nácar (3,5,7,9,15,17,19,21 y doble en 12).
    const inlay = (x, y, rad) => {
      const p = g.createRadialGradient(x - rad * .3, y - rad * .3, rad * .1, x, y, rad);
      p.addColorStop(0, '#ffffff'); p.addColorStop(.35, '#e6f0ff'); p.addColorStop(.6, '#f3e3ff'); p.addColorStop(.85, '#cfe9e4'); p.addColorStop(1, '#8f9b9a');
      g.fillStyle = p; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = dpr; g.stroke();
    };
    const rad = Math.min(H * .07, 9 * dpr);
    for (const n of [3, 5, 7, 9, 12, 15, 17, 19, 21]) {
      const x = (fretX(n - 1, W) + fretX(n, W)) / 2;
      if (n === 12) { inlay(x, H * .3, rad); inlay(x, H * .7, rad); } else inlay(x, H / 2, rad);
    }
    // Trastes de níquel.
    for (let n = 0; n <= 22; n++) {
      const x = fretX(n, W), w = (n === 0 ? 6 : 3) * dpr;
      const m = g.createLinearGradient(x - w, 0, x + w, 0);
      if (n === 0) { m.addColorStop(0, '#bdb59b'); m.addColorStop(.5, '#fff8e3'); m.addColorStop(1, '#8d8670'); }
      else { m.addColorStop(0, '#4a4a4a'); m.addColorStop(.45, '#f4f4f4'); m.addColorStop(.6, '#cfcfcf'); m.addColorStop(1, '#3a3a3a'); }
      g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x + w * .6, 0, 2 * dpr, H);
      g.fillStyle = m; g.fillRect(x - w / 2, 0, w, H);
    }
    // Cuerdas (6): las graves entorchadas, más gruesas.
    for (let s = 0; s < 6; s++) {
      const y = H * (.14 + s * .144), th = (0.9 + s * .42) * dpr;
      g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y + th + dpr, W, th * .8);
      const m = g.createLinearGradient(0, y - th, 0, y + th);
      m.addColorStop(0, s > 2 ? '#7a6a4a' : '#8a8a8a'); m.addColorStop(.45, s > 2 ? '#f6e3b0' : '#ffffff'); m.addColorStop(1, s > 2 ? '#4a3a22' : '#4d4d4d');
      g.fillStyle = m; g.fillRect(0, y - th / 2, W, th);
      if (s > 2) { g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < W; x += 3 * dpr) g.fillRect(x, y - th / 2, dpr * .8, th); }
    }
  }

  function size() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w && h && (w !== W || h !== H)) { W = cv.width = w; H = cv.height = h; paintBase(); }
  }

  function frame(t) {
    raf = 0; if (!document.body.classList.contains('gh3Prep') || document.hidden) return;
    size(); if (!W) { raf = requestAnimationFrame(frame); return; }
    const pr = document.getElementById('loaderProgress');
    const target = Math.max(0, Math.min(1, (pr?.value || 0) / (pr?.max || 1)));
    shown += (target - shown) * (reduce ? 1 : .08); if (Math.abs(target - shown) < .001) shown = target;
    const time = (t - t0) / 1000, px = 14 * dpr + (W - 28 * dpr) * shown;
    ctx.drawImage(base, 0, 0);
    // Zona sin preparar: apagada.
    const dark = ctx.createLinearGradient(px - 30 * dpr, 0, px + 60 * dpr, 0);
    dark.addColorStop(0, 'rgba(6,3,2,0)'); dark.addColorStop(1, 'rgba(6,3,2,.5)');
    ctx.fillStyle = dark; ctx.fillRect(px - 30 * dpr, 0, W, H);
    ctx.fillStyle = 'rgba(6,3,2,.5)'; ctx.fillRect(px + 60 * dpr, 0, W, H);
    // Zona preparada: luz de escenario cálida que respira.
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const warm = ctx.createLinearGradient(0, 0, px, 0);
    warm.addColorStop(0, 'rgba(255,120,30,0.04)'); warm.addColorStop(1, `rgba(255,190,80,${.16 + .05 * Math.sin(time * 3)})`);
    ctx.fillStyle = warm; ctx.fillRect(0, 0, px, H);
    // Cuerdas vibrando en la zona preparada (brillo que recorre cada cuerda con su color de traste).
    for (let s = 0; s < 6; s++) {
      const y = H * (.14 + s * .144), amp = (reduce ? 0 : (1.2 + s * .35)) * dpr * Math.sin(time * (38 + s * 7));
      const c = COLORS[s % 5], gl = ctx.createLinearGradient(0, 0, px, 0);
      gl.addColorStop(0, 'rgba(0,0,0,0)'); gl.addColorStop(.75, c + '33'); gl.addColorStop(1, c + 'aa');
      ctx.strokeStyle = gl; ctx.lineWidth = (1 + s * .3) * dpr; ctx.beginPath();
      for (let x = 0; x <= px; x += 8 * dpr) { const k = Math.sin(Math.PI * x / Math.max(px, 1)); ctx.lineTo(x, y + amp * k); }
      ctx.stroke();
    }
    // Púa/nota encendida en el frente de carga.
    const pulse = 1 + .08 * Math.sin(time * 6), R = H * .2 * pulse, cy = H / 2;
    const halo = ctx.createRadialGradient(px, cy, 0, px, cy, R * 3.2);
    halo.addColorStop(0, 'rgba(255,230,140,.75)'); halo.addColorStop(.35, 'rgba(255,170,40,.28)'); halo.addColorStop(1, 'rgba(255,120,0,0)');
    ctx.fillStyle = halo; ctx.fillRect(px - R * 3.2, cy - R * 3.2, R * 6.4, R * 6.4);
    ctx.restore();
    const gem = ctx.createRadialGradient(px - R * .3, cy - R * .4, R * .05, px, cy, R);
    gem.addColorStop(0, '#ffffff'); gem.addColorStop(.3, '#ffe27a'); gem.addColorStop(.75, '#e09a00'); gem.addColorStop(1, '#5a3a00');
    ctx.fillStyle = gem; ctx.beginPath(); ctx.ellipse(px, cy, R * 1.15, R, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2 * dpr; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.ellipse(px, cy, R * 1.15 + 2 * dpr, R + 2 * dpr, 0, 0, Math.PI * 2); ctx.stroke();
    // Chispas.
    if (!reduce && shown < 1 && Math.random() < .7) for (let i = 0; i < 2; i++)
      sparks.push({ x: px, y: cy + (Math.random() - .5) * R, vx: (-.5 - Math.random() * 2.5) * dpr, vy: (Math.random() - .7) * 2.4 * dpr, life: 1, c: COLORS[(Math.random() * 5) | 0] });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += .06 * dpr; p.life -= .025;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.fillStyle = p.c; ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 * dpr * p.life + .5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // Brillo especular general (vidrio de vitrina) para que no se vea plano.
    const sheen = ctx.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(255,255,255,.07)'); sheen.addColorStop(.35, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = sheen; ctx.fillRect(0, 0, W, H);
    // Texto.
    const bytes = document.getElementById('loaderBytes')?.textContent?.trim() || '';
    txt.innerHTML = `<span>${bytes ? bytes.replace(/</g, '&lt;') : 'Preparando canciones'}</span><b>${Math.round(shown * 100)}%</b>`;
    raf = requestAnimationFrame(frame);
  }

  function ensure() {
    if (box) return true;
    const row = document.querySelector('#loaderPanel .row'); if (!row) return false;
    box = document.createElement('div'); box.id = 'gh3LoadFx'; box.setAttribute('aria-hidden', 'true');
    box.innerHTML = '<canvas></canvas><div class="lfx"></div>';
    row.after(box); cv = box.firstChild; ctx = cv.getContext('2d'); txt = box.lastChild;
    return true;
  }
  function tick() {
    if (!ensure()) return;
    const b = document.body, pause = document.getElementById('loaderPause');
    const on = !b.classList.contains('loaderStarted') && !b.classList.contains('loaderError') && !!pause && pause.offsetParent !== null;
    if (on !== b.classList.contains('gh3Prep')) { b.classList.toggle('gh3Prep', on); if (on) { shown = 0; t0 = performance.now(); } }
    if (on && !raf && !document.hidden) raf = requestAnimationFrame(frame);
  }
  setInterval(tick, 150);
})();
