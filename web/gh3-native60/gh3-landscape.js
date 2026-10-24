// Modo horizontal para celular (Claude, copia aislada mobilediag). Al tocar Jugar (body.loaderStarted), en pantalla
// táctil y horizontal, el recuadro del juego (#r5Box: imagen + pantalla de carga de Codex) ocupa toda la pantalla y
// los controles táctiles quedan encima. En vertical se ve la página normal y los controles piden girar el teléfono.
// Solo CSS sobre elementos existentes: no toca renderer ni cargador. ?landscape=0 lo apaga.
(() => {
  if (new URLSearchParams(location.search).get('landscape') === '0') return;
  const css = `@media (orientation:landscape){
body.gh3Play{overflow:hidden!important;background:#000!important}
body.gh3Play #r5Box{position:fixed!important;inset:0!important;z-index:40;margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:#000!important;display:flex!important;align-items:center;justify-content:center;min-height:0!important}
body.gh3Play #r5Canvas{width:100vw!important;height:100vh!important;height:100dvh!important;max-height:none!important;object-fit:contain}
body.gh3Play #r5Stat{display:none!important}}
/* Sobre la imagen: trastes sin relleno (sólo el borde tenue de gh3-touch.js) para que se vean las notas que llegan a los aros. */
body.gh3Play #gh3Touch{--gh3-touch-opacity:.6}
body.gh3Play #gh3Touch .z:not(.on):not(.frets .z){background:rgba(255,255,255,.04)}`;
  const coarse = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 || new URLSearchParams(location.search).get('touch') === '1';
  const on = () => {
    if (!coarse || !document.body) return;
    if (!document.getElementById('gh3LandStyle')) { const s = document.createElement('style'); s.id = 'gh3LandStyle'; s.textContent = css; document.head.appendChild(s); }
    const play = document.body.classList.contains('loaderStarted');
    if (play !== document.body.classList.contains('gh3Play')) { document.body.classList.toggle('gh3Play', play); scrollTo(0, 0); }
  };
  setInterval(on, 500);
  addEventListener('orientationchange', () => setTimeout(() => scrollTo(0, 0), 300));
})();
