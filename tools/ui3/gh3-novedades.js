// Cartel de novedades y consejos al entrar (Claude 2026-10-16, pedido de Santi). Se muestra una vez por versión
// (localStorage gh3-novedades); se cierra con «Entendido», Escape o tocando afuera. window.gh3Novedades.show() lo reabre.
(() => {
  const VERSION = '2026-10-16-rasgueo';
  const NOVEDADES = [
    ['Rasgueo más preciso', 'Cada rasgueo cuenta aunque toques muy rápido, y el juego usa el momento exacto en que tocaste.'],
    ['Más fluido', 'La calidad «Muy liviana» viene por defecto. Si tu compu es potente, podés subirla en ☰ › Gráficos.'],
    ['Prueba de retraso', 'En ☰ › Notas y sonido › «Probar retraso (30 s)» para que notas y música vayan juntas.'],
    ['Celular', 'Controles nuevos: joystick en rombo y botón de estrella.'],
  ];
  const CONSEJOS = [
    'Jugá en Edge o Chrome. Brave atrasa el sonido.',
    'Mejor auriculares con cable: los bluetooth atrasan el sonido.',
    'Cerrá otras pestañas y programas pesados.',
    'Teclado: 1–5 (o A S D F G) trastes, flechas ↑ ↓ (o K) rasguear, Enter pausa, Espacio estrella.',
  ];
  const leer = () => { try { return localStorage.getItem('gh3-novedades'); } catch { return null; } };
  const guardar = () => { try { localStorage.setItem('gh3-novedades', VERSION); } catch {} };
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c]));
  let caja = null;
  function cerrar() {
    if (!caja) return;
    guardar(); caja.remove(); caja = null;
    removeEventListener('keydown', tecla, true);
  }
  function tecla(e) {
    if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); cerrar(); }
  }
  function show() {
    if (caja) return;
    caja = document.createElement('div');
    caja.id = 'gh3Novedades';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-labelledby', 'gh3NovTitulo');
    caja.style.cssText = 'position:fixed;inset:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;' +
      'padding:16px;background:rgba(0,0,0,.6);box-sizing:border-box';
    const item = 'margin:0 0 10px;line-height:1.35';
    caja.innerHTML =
      '<div style="width:min(520px,100%);max-height:calc(100dvh - 32px);overflow:auto;box-sizing:border-box;padding:20px 20px 16px;' +
      'border-radius:14px;background:var(--box,#202020);color:var(--fg,#ececea);border:1px solid var(--line,#333);' +
      'box-shadow:0 12px 40px rgba(0,0,0,.5);font:15px/1.4 system-ui,sans-serif">' +
      '<div id="gh3NovTitulo" style="font:600 30px/1 Teko,system-ui,sans-serif;letter-spacing:.5px;margin:0 0 12px">NOVEDADES</div>' +
      NOVEDADES.map(([t, d]) => '<p style="' + item + '"><b>' + esc(t) + ':</b> ' + esc(d) + '</p>').join('') +
      '<div style="font:600 22px/1 Teko,system-ui,sans-serif;letter-spacing:.5px;margin:16px 0 8px">CONSEJOS</div>' +
      '<ul style="margin:0 0 14px;padding-left:20px">' + CONSEJOS.map((c) => '<li style="margin:0 0 6px">' + esc(c) + '</li>').join('') + '</ul>' +
      '<button type="button" id="gh3NovOk" style="display:block;width:100%;min-height:44px;border:0;border-radius:10px;' +
      'background:#e8b400;color:#111;font:600 20px/1 Teko,system-ui,sans-serif;letter-spacing:.5px;cursor:pointer">ENTENDIDO</button></div>';
    caja.addEventListener('click', (e) => { if (e.target === caja) cerrar(); });
    caja.querySelector('#gh3NovOk').addEventListener('click', cerrar);
    addEventListener('keydown', tecla, true);
    document.body.appendChild(caja);
    caja.querySelector('#gh3NovOk').focus({preventScroll: true});
  }
  window.gh3Novedades = {show, version: VERSION};
  // Robots de prueba (navigator.webdriver) no lo ven, salvo ?novedades=1.
  const forzar = new URLSearchParams(location.search).has('novedades');
  const iniciar = () => { if (forzar || (leer() !== VERSION && !navigator.webdriver)) show(); };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
