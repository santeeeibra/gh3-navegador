// Claude 2026-10-12: ayudas para celular.
// 1) iPhone sin memoria: recargar NO libera la memoria del juego anterior (hay que cerrar la app/pestaña del todo).
//    - "Aplicar y reiniciar" → "Guardar" (sin recargar) + cartel "cerrá y volvé a abrir".
//    - Error de memoria (Out of memory / WORKERFS después) → cartel claro en vez del mensaje técnico.
//    - Si la sesión anterior terminó por memoria → recordatorio arriba al abrir.
// 2) Botón ☰ que abre el panel como menú deslizable (también en pantalla completa).
(() => {
  const ua = navigator.userAgent, isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  window.gh3IsIOS = isIOS;
  const OOM = /Out of memory|WORKERFS\.stream_ops/;
  const css = document.createElement('style');
  css.textContent = `
#gh3MemCard,#gh3GpuCard{position:fixed;inset:0;z-index:2147483600;background:rgba(10,8,14,.94);display:flex;align-items:center;justify-content:center;padding:24px;font:16px/1.45 system-ui,sans-serif;color:#f2eef8}
#gh3MemCard div,#gh3GpuCard div{max-width:460px;background:#1b1622;border:1px solid #4a3d5c;border-radius:14px;padding:20px}
#gh3MemCard h3,#gh3GpuCard h3{margin:0 0 8px;font-size:20px}#gh3MemCard ol,#gh3GpuCard ol{margin:8px 0 14px;padding-left:20px}
#gh3MemCard button,#gh3GpuCard button{font:inherit;padding:8px 14px;border-radius:9px;border:1px solid #5a4b6e;background:#2a2233;color:inherit}
#gh3MemTip{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 6px);transform:translateX(-50%);z-index:2147483500;background:#3a2a10;color:#ffe3a6;border:1px solid #7a5a20;border-radius:10px;padding:6px 12px;font:13px system-ui,sans-serif;max-width:92vw}
#gh3MenuBtn{display:none;position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 6px);transform:translateX(-50%);z-index:2147483470;width:46px;height:34px;border-radius:9px;border:1px solid rgba(255,255,255,.25);background:rgba(20,16,26,.55);color:#fff;font-size:20px;line-height:1}
html.gh3Mobile body.loaderStarted #gh3MenuBtn{display:block}
html.gh3Mobile body.gh3DrawerReady #gh3Panel{position:fixed!important;top:0!important;right:0!important;left:auto!important;bottom:auto!important;height:100dvh!important;width:min(380px,88vw)!important;max-width:none!important;max-height:none!important;box-sizing:border-box;overflow:auto;z-index:2147483450;margin:0;border-radius:14px 0 0 14px;transform:translateX(105%);transition:transform .22s ease;box-shadow:-8px 0 30px rgba(0,0,0,.5);background:#14111a;padding-top:calc(env(safe-area-inset-top) + 8px)}
html.gh3Mobile body.gh3DrawerOpen #gh3Panel{transform:none}
#gh3DrawerShade{display:none;position:fixed;inset:0;z-index:2147483440;background:rgba(0,0,0,.35)}
html.gh3Mobile body.gh3DrawerOpen #gh3DrawerShade{display:block}
body.gh3PseudoFull{overflow:hidden}body.gh3PseudoFull #r5Canvas{position:fixed!important;inset:0!important;width:100vw!important;height:100dvh!important;max-width:none!important;z-index:40;background:#000;object-fit:contain;border-radius:0!important;margin:0!important}`;
  document.head.appendChild(css);

  const steps = '<ol><li>Cerrá la app del todo: deslizá desde abajo, mantené un momento y tirá GH3 hacia arriba (en Safari: cerrá la pestaña).</li><li>Esperá unos segundos y abrila de nuevo.</li><li>Si vuelve a pasar: reiniciá el iPhone y abrí solo el juego.</li></ol>';
  function card(title, text, closable) {
    if (document.getElementById('gh3MemCard')) return;
    const c = document.createElement('div'); c.id = 'gh3MemCard';
    c.innerHTML = `<div><h3>${title}</h3><p>${text}</p>${steps}${closable ? '<button>Entendido</button>' : ''}</div>`;
    c.querySelector('button')?.addEventListener('click', () => c.remove());
    document.body.appendChild(c);
  }
  window.gh3MemNotice = (kind) => kind === 'apply'
    ? card('Ajustes guardados', 'Para aplicarlos en el iPhone hay que cerrar y volver a abrir el juego (recargar no libera la memoria).', true)
    : card('El iPhone se quedó sin memoria', 'El juego no pudo reservar memoria. Recargar no sirve: el iPhone recién la suelta al cerrar la app.', false);

  // Aviso WebGPU (Claude 2026-10-13): sin adaptador el juego no puede dibujar (p. ej. Opera con aceleración apagada).
  const gpuHelp = () => {
    const opera = /OPR\//.test(ua), firefox = /Firefox\//.test(ua) && !/Seamonkey/.test(ua), brave = !!navigator.brave;
    const where = opera ? 'Opera: Configuración → Sistema → «Usar aceleración por hardware cuando esté disponible».'
      : firefox ? 'Firefox todavía no sirve para este juego: abrilo en Chrome o Edge.'
      : isIOS ? 'iPhone: actualizá iOS a la última versión (WebGPU viene con Safari nuevo).'
      : (brave ? 'Brave' : 'Chrome/Edge') + ': Configuración → Sistema → «Usar aceleración de gráficos cuando esté disponible».';
    return `<ol><li>${where}</li><li>Reiniciá el navegador (cerralo del todo y abrilo de nuevo).</li><li>Si sigue igual, probá con Chrome o Edge actualizados.</li></ol>`;
  };
  function gpuCard(closable) {
    if (document.getElementById('gh3GpuCard')) return;
    const c = document.createElement('div'); c.id = 'gh3MemCard'; c.setAttribute('data-gpu', '1');
    c.innerHTML = `<div><h3>Falta la aceleración de gráficos</h3><p>Tu navegador no tiene WebGPU activo, y el juego lo necesita para dibujar.</p>${gpuHelp()}${closable ? '<button>Entendido</button>' : ''}</div>`;
    c.id = 'gh3GpuCard';
    c.querySelector('button')?.addEventListener('click', () => c.remove());
    document.body.appendChild(c);
  }
  window.gh3GpuCard = gpuCard;
  const onReady = (fn) => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', fn) : fn();
  onReady(() => {
    // Recordatorio si la sesión anterior terminó por memoria.
    const prev = window.gh3Diag?.previous;
    if (isIOS && prev?.errors?.some((e) => OOM.test(e.message || ''))) {
      const tip = document.createElement('div'); tip.id = 'gh3MemTip';
      tip.textContent = 'La vez anterior el iPhone se quedó sin memoria. Si falla de nuevo: cerrá la app del todo y volvé a abrirla.';
      document.body.appendChild(tip); setTimeout(() => tip.remove(), 12000);
    }
    // WebGPU: revisar al abrir (antes de Jugar) y ante el error del renderer.
    (async () => { let ok = false; try { ok = !!(navigator.gpu && await navigator.gpu.requestAdapter()); } catch {} if (!ok) gpuCard(true); })();
    const gw = setInterval(() => { const errs = window.gh3Diag?.errors || []; if (errs.some((e) => /WebGPU sin adaptador|navigator\.gpu/.test(e.message || ''))) { clearInterval(gw); gpuCard(false); } }, 700);
    // Error de memoria ahora → cartel (solo iPhone; en PC el mensaje técnico sigue igual).
    const watch = setInterval(() => {
      const errs = window.gh3Diag?.errors || [], le = window.gh3Loader?.error || '';
      if (isIOS && (OOM.test(le) || errs.some((e) => OOM.test(e.message || '')))) { clearInterval(watch); window.gh3MemNotice('oom'); }
    }, 500);
    // "Aplicar y reiniciar" → "Guardar" en iPhone.
    const hookApply = setInterval(() => {
      const b = document.getElementById('gh3GfxApply'); if (!b) return; clearInterval(hookApply);
      if (!isIOS) return;
      b.textContent = 'Guardar';
      b.onclick = (e) => { e.preventDefault(); e.currentTarget.style.display = 'none'; window.gh3MemNotice('apply'); };
    }, 300);
    // Menú deslizable (celular).
    const btn = document.createElement('button'); btn.id = 'gh3MenuBtn'; btn.textContent = '☰'; btn.setAttribute('aria-label', 'Menú');
    const shade = document.createElement('div'); shade.id = 'gh3DrawerShade';
    document.body.append(shade, btn);
    const toggle = (open) => { document.body.classList.toggle('gh3DrawerOpen', open); btn.textContent = open ? '✕' : '☰'; };
    btn.addEventListener('click', (e) => { e.stopPropagation(); btn.blur(); toggle(!document.body.classList.contains('gh3DrawerOpen')); });
    shade.addEventListener('click', () => toggle(false));
    const hookPanel = setInterval(() => {
      const p = document.getElementById('gh3Panel'); if (!p) return; clearInterval(hookPanel);
      document.body.classList.add('gh3DrawerReady');
      // Pantalla completa en celular = toda la página (si fuera solo el lienzo, el menú y los controles no se verían).
      for (const id of ['gh3Full', 'gh3Full2']) { const f = document.getElementById(id); if (f) f.onclick = (e) => { e.currentTarget.blur(); if (!document.documentElement.classList.contains('gh3Mobile')) return document.getElementById('r5Canvas').requestFullscreen?.().catch(() => {}); if (isIOS || !document.documentElement.requestFullscreen) { document.body.classList.toggle('gh3PseudoFull'); toggle(false); return; }  // Safari iPhone: sin API de pantalla completa → la arma la página
        (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {}); }; }
    }, 300);
  });
})();
