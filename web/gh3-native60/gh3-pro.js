// Claude 2026-10-12: capa visual "profesional" (pedido de Santi): logo Las Vegas + HERO 3, poco texto,
// pantalla de inicio = logo + Jugar + progreso; en juego solo imagen + panel. No cambia la lógica del cargador:
// solo oculta/reubica elementos. ?diag=1 vuelve a mostrar los detalles técnicos.
(() => {
  const diag = new URLSearchParams(location.search).has('diag');
  document.title = 'Las Vegas · HERO 3';
  const css = document.createElement('style');
  css.textContent = `
:root{--pro-accent:#e8473f;--pro-accent2:#ffb347}
body{background:radial-gradient(1200px 600px at 50% -200px,#2a1630 0%,transparent 70%),#0c0a10!important}
header.hero.pro{display:flex;align-items:center;justify-content:center;gap:18px;padding:28px 0 18px;margin:0;text-align:center}
header.hero.pro img{height:clamp(54px,9vw,96px);width:auto;filter:drop-shadow(0 2px 10px rgba(232,71,63,.35))}
header.hero.pro .h3{font:900 italic clamp(34px,6vw,64px)/1 system-ui,'Segoe UI',sans-serif;letter-spacing:.04em;background:linear-gradient(180deg,#fff 10%,var(--pro-accent2) 55%,var(--pro-accent) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;transform:skew(-6deg);filter:drop-shadow(0 3px 0 rgba(0,0,0,.6))}
body.loaderStarted header.hero.pro{padding:10px 0 8px;gap:10px}
body.loaderStarted header.hero.pro img{height:40px}body.loaderStarted header.hero.pro .h3{font-size:28px}
#loaderPanel .eyebrow,#loaderPanel .intro,#loaderPanel .note,#loaderPanel h2,#loaderPanel .trackList,#loaderPanel label{display:none!important}
#loaderPanel{text-align:center;padding:28px 24px!important}
#loaderPanel .row{justify-content:center}
#loaderPanel #loaderPlay{font-size:20px;font-weight:800;padding:14px 56px;border-radius:999px;background:linear-gradient(180deg,var(--pro-accent2),var(--pro-accent));color:#160806;border:0;box-shadow:0 6px 24px rgba(232,71,63,.35);letter-spacing:.06em;text-transform:uppercase}
#loaderPanel #loaderPlay:disabled{opacity:.45;box-shadow:none}
#loaderPanel #loaderPause:disabled,#loaderPanel #loaderPrepare[hidden]{display:none}
#loaderPanel .loadNumbers{max-width:520px;margin:18px auto 6px}#loaderPanel progress{max-width:520px;margin:0 auto;display:block}
#loaderPanel #loaderStatus{font-size:13px;opacity:.75;margin-top:8px}
body.loaderStarted:not(.loaderError) #loaderPanel{display:none!important}
.proHide{display:none!important}
${diag ? '' : 'main > details{display:none!important}'}
html.gh3Mobile body:not(.loaderStarted) #loaderLobby > :not(#loaderPanel){display:none!important}
#gh3Panel .soon{font-size:12px;opacity:.7}
body:not(.loaderStarted):not(.loaderError) #loaderPanel :is(.loadNumbers,progress,#loaderStatus){display:none!important}
#loaderLobby .eyebrow,#gh3Guide{display:none!important}
#loaderPanel{display:flex;flex-direction:column;justify-content:center;min-height:180px}`;
  document.head.appendChild(css);

  const onReady = (fn) => document.readyState === 'loading' ? addEventListener('DOMContentLoaded', fn) : fn();
  onReady(() => {
    const brand = () => {
      const h = document.querySelector('header.hero'); if (!h) return false;
      h.classList.add('pro');
      h.innerHTML = '<img src="logo-lasvegas.png" alt="Las Vegas" onerror="this.remove()"><span class="h3">HERO 3</span>';
      return true;
    };
    const tb = setInterval(() => { if (brand()) clearInterval(tb); }, 100);
    // Textos de prueba en la vista del juego: título "imagen original parcial" y estado de al lado.
    const tidy = () => {
      for (const el of document.querySelectorAll('main span, main p')) {
        if (/imagen original parcial/.test(el.textContent) && el.children.length === 0) (el.parentElement.children.length <= 3 ? el.parentElement : el).classList.add('proHide');
      }
    };
    setInterval(tidy, 1000);
  });
})();
