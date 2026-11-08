// Barra bajo el juego (Claude 2026-10-16, pedido de Santi): «Preguntas frecuentes» a la izquierda (arreglos, pendientes y guía)
// y «Comentar / calificar» a la derecha (movido desde el panel). Saca el recuadro «Parpadeos».
// 2026-10-22 (pedido de Santi): la sección NOTAS pasa a PREGUNTAS FRECUENTES, con lo ya arreglado y las dudas frecuentes.
(() => {
  const ARREGLADO = [
    'Teclas en PC (21/10): las notas se tocan con A, S, D, F y G. El rasgueo es J y K, y se pueden cambiar en la pestaña TECLAS.',
    'Casilla «Una tecla por nota» en TECLAS (21/10): el rasgueo se hace solo. Si preferís rasguear a mano, desmarcala.',
    'Notas y música juntas (17/10): el juego usa el reloj del sonido para juzgar los toques y dibujar las notas.',
    'Autopista a 60 cuadros por segundo (20/10), con el reloj del sonido.',
    'Calidad «Liviana» por defecto (17/10): va más fluida en notebooks y celulares.',
    'Calidad «Completa» más fluida (22/10). Igual, en equipos modestos conviene «Liviana» o «Muy liviana».',
    'Botones Notas, Novedades y Apoyo debajo del juego (21/10), también en la portada del celular.',
  ];
  const PENDIENTE = [
    'Escenario y personajes: se siguen mejorando sin perder fluidez.',
    'iPhone: todavía se está bajando el uso de memoria y de procesador.',
    'Brave agrega unos 0,3 s de atraso al sonido. Por ahora jugá en Edge o Chrome.',
    'Videos (cinemáticas): a veces el sonido tiene saltos.',
  ];
  // Icono de cada pregunta (2026-10-22, pedido de Santi): para reconocer el problema de un vistazo. Se elige por palabras de la pregunta.
  const IC = {
    navegador: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    calidad: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    teclado: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h1M11 10h1M15 10h1M7 14h10"/>',
    rasgueo: '<path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4"/>',
    guitarra: '<path d="M14 10l6-6M18 3l3 3"/><circle cx="9" cy="15" r="5"/><circle cx="9" cy="15" r="1.2"/>',
    mando: '<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.9 3.1l-1.6 7A3 3 0 0 0 4 19a3 3 0 0 0 2.2-1l1.8-2h8l1.8 2A3 3 0 0 0 20 19a3 3 0 0 0 2.8-3.9l-1.6-7A4 4 0 0 0 17.3 5z"/>',
    celular: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
    mover: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    sonido: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1"/><rect x="17" y="14" width="4" height="6" rx="1"/>',
    reloj: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M10 3h4"/>',
    lento: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-5"/><circle cx="12" cy="16" r="1.2"/>',
    descarga: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    guardar: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    corazon: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
    novedades: '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    online: '<circle cx="8" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M15 15c3 0 6 1.5 6 5"/>',
    memoria: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
    ayuda: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  };
  const ICONO_DE = [[/navegador/i, 'navegador'], [/duelo|online/i, 'online'], [/guitarra o mando|cambio los botones|no responde|mando se desconfigura/i, 'mando'],
    [/mover los botones|mover.*lugar/i, 'mover'], [/men[uú]s/i, 'menu'], [/celular.*(cierra|carga)|memoria/i, 'memoria'], [/celular/i, 'celular'],
    [/puntúo|rasgue|una tecla/i, 'rasgueo'], [/teclado/i, 'teclado'], [/colch|no coinciden|desfas/i, 'reloj'], [/lento|saltos|calidad|completa/i, 'calidad'],
    [/tarda|primera vez/i, 'descarga'], [/ajustes|guardan/i, 'guardar'], [/apoyo/i, 'corazon'], [/novedades/i, 'novedades']];
  const iconoPregunta = (q, c) => {
    const k = (ICONO_DE.find(([re]) => re.test(q)) || [0, 'ayuda'])[1];
    return '<svg class="ntI" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC[k] + '</svg>';
  };
  const FAQ = [
    ['¿Qué navegador uso?', 'Edge o Chrome de escritorio, en versiones recientes. Brave no conviene porque agrega atraso al sonido.'],
    ['¿Por qué no aparece la calidad «Completa» o va muy lenta?', 'Esa calidad necesita WebGPU. Si tu navegador o tu placa de video no lo soportan, usá «Liviana» o «Muy liviana» (☰ › Gráficos › Calidad).'],
    ['¿Cómo juego con teclado?', 'Notas: A, S, D, F y G. Rasgueo: J y K. Todo se puede cambiar en la pestaña TECLAS.'],
    ['¿Qué es «Una tecla por nota»?', 'Con esa casilla marcada, el rasgueo se hace solo al tocar cada nota. Si la desmarcás, rasgueás a mano con J y K.'],
    ['Las notas no coinciden con la música', 'Jugá en Edge o Chrome (no Brave). Calibrá una sola vez en el juego: Options › Calibrate. Si igual va desfasado, usá ☰ › Notas y sonido › «Probar retraso (30 s)».'],
    ['¿Puedo jugar con guitarra o mando?', 'Sí. Conectá la guitarra USB o el mando y apretá un botón con la página abierta para que el navegador lo detecte. Viene con el esquema original: L1, L2, R1, R2 y X para las notas (en Xbox: LB, LT, RB, RT y A) y la cruceta para rasguear. Si algún botón no coincide, lo cambiás en el remapeo.'],
    ['¿Cómo cambio los botones del mando o la guitarra?', 'Entrá a ☰ › Teclas y tocá «Remapear botones del mando». Tocás «Cambiar» en la acción que quieras y apretás el botón nuevo en tu mando. «Volver a los botones originales» deja todo como en la consola.'],
    ['¿Cómo juego en el celular?', 'Poné el celular en horizontal y, en Controles, elegí la botonera «Mando» (L1, L2, R1, R2 y X como en un joystick). Si lo tenés vertical aparece un aviso: girá el celular o usá pantalla completa.'],
    ['¿Puedo mover los botones del celular de lugar?', 'Sí. En Controles tocá «Ubicar los botones a mi gusto» y arrastrá cada botón donde te quede cómodo. «Restablecer» los devuelve a su lugar original. Queda guardado en tu navegador.'],
    ['¿Cómo me muevo por los menús en el celular?', 'Como en el juego original: la cruceta mueve la selección, X acepta y el círculo vuelve atrás. Dentro de una canción, X es la nota naranja y el círculo no hace nada.'],
    ['Mi mando se mueve solo, se desconfigura o los botones no coinciden', 'Steam Input puede interferir con algunos mandos y guitarras. 1) Cerrá Steam por completo, también desde el área de notificaciones de Windows (al lado del reloj: clic derecho en Steam › Salir). 2) Desconectá y volvé a conectar el joystick o la guitarra. 3) Recargá la página. Si sigue igual, ajustalo en ☰ › Teclas › «Remapear botones del mando» o contanos desde «Comentar / calificar».'],
    ['¿Por qué no puntúo aunque toque bien?', 'Las notas necesitan rasguearse: con J o K, o con la casilla «Una tecla por nota» marcada (en TECLAS), que rasguea sola. En el celular, el mando rasguea solo al apretar un color.'],
    ['¿Cómo hago un duelo online?', 'Todavía no está disponible. Es lo próximo que viene: jugar contra un amigo con solo compartir un link.'],
    ['¿Qué es el «Colchón de sonido»?', 'Es un margen de audio. Si el sonido se corta o se traba, subilo (en celular, 300 a 400 ms) en ☰ › Sonido. Cerrá otras pestañas.'],
    ['El juego va lento o a los saltos', 'Bajá la calidad a «Muy liviana» en ☰ › Gráficos › Calidad y tocá «Aplicar y reiniciar». Queda guardado.'],
    ['Mi mando o guitarra no responde', 'Apretá un botón con la página abierta y en primer plano. Si sigue igual, probá otro cable o puerto USB, desconectalo, volvé a conectarlo y recargá la página. Usá Edge o Chrome. Si un botón no coincide, cambialo en ☰ › Teclas › «Remapear botones del mando».'],
    ['En el celular se cierra al cargar la canción', 'Falta memoria: cerrá las otras apps y pestañas, y probá de nuevo.'],
    ['¿Por qué tarda tanto la primera vez?', 'Porque baja archivos grandes. Con una conexión lenta puede demorar bastante.'],
    ['¿Se guardan mis ajustes?', 'Sí, quedan guardados en este navegador. Si borrás los datos del sitio, se pierden.'],
    ['¿Cómo apoyo el proyecto?', 'Con los links de Mercado Pago que están en la barra debajo del juego (también se ven al jugar).'],
    ['¿Dónde veo las novedades?', 'En el botón «Novedades», debajo del juego.'],
  ];
  // Estilo del juego para la barra de abajo y sus ventanas (2026-10-21, pedido de Santi): metal oscuro, Teko, dorado #ffd23f.
  const STEEL = 'linear-gradient(180deg,#5b5b66 0%,#2a2a31 48%,#17171c 52%,#3a3a44 100%)';
  const st = document.createElement('style');
  st.textContent =
    '#gh3BarraAbajo button,#gh3BarraAbajo .gh3FeedbackOpen,#gh3Notas button,body #gh3Feedback button{font:600 19px/1.1 Teko,system-ui,sans-serif!important;letter-spacing:.07em;text-transform:uppercase;color:#f1ecf6!important;background:' + STEEL + '!important;border:1px solid #000!important;border-radius:9px!important;box-shadow:0 0 0 1px #7a7a8666 inset,0 3px 0 #000!important;min-height:44px;margin:0!important;cursor:pointer}' +
    // Botones secundarios más discretos: solo «Apoyar el proyecto» queda destacado (2026-10-22, pedido de Santi).
    '#gh3BarraAbajo button:not(#gh3ApoyoBtn),#gh3BarraAbajo .gh3FeedbackOpen{font-size:16px!important;opacity:.82;background:#1c1724!important;box-shadow:0 0 0 1px #4a4a5666 inset!important}' +
    '#gh3BarraAbajo button:not(#gh3ApoyoBtn):hover,#gh3BarraAbajo .gh3FeedbackOpen:hover{opacity:1}' +
    '#gh3BarraAbajo button:hover,#gh3BarraAbajo .gh3FeedbackOpen:hover,#gh3Notas button:hover,body #gh3Feedback button:hover{filter:brightness(1.18)}' +
    '#gh3BarraAbajo button:active,#gh3BarraAbajo .gh3FeedbackOpen:active,#gh3Notas button:active,body #gh3Feedback button:active{transform:translateY(1px)}' +
    'body #gh3Feedback button[type=submit]{background:linear-gradient(180deg,#ffcf6b,#e8473f 60%,#9d1f19)!important;color:#1a0806!important}' +
    '#gh3Notas .nt{width:min(620px,100%);max-height:90vh;overflow:auto;box-sizing:border-box;position:relative;padding:22px 20px 18px;border:1px solid #6b5b44;border-radius:12px;background:linear-gradient(160deg,#211a26,#110e16);box-shadow:inset 0 0 0 3px #0009,0 14px 44px rgba(0,0,0,.65);color:#ece6f2;font:15px/1.45 system-ui,sans-serif}' +
    '#gh3Notas .nt::before{content:"";position:absolute;left:14px;right:14px;top:0;height:2px;background:linear-gradient(90deg,transparent,#c9a45c,transparent)}' +
    '#gh3Notas .ntH{display:flex;justify-content:space-between;align-items:center;gap:12px}' +
    '#gh3Notas .ntT{font:600 38px/1 Teko,system-ui,sans-serif;letter-spacing:.06em;color:#ffd23f;text-shadow:0 2px 0 #000,0 0 18px rgba(255,210,63,.35)}' +
    '#gh3Notas h3{font:600 24px/1 Teko,system-ui,sans-serif;letter-spacing:.08em;color:#ffd23f;margin:16px 0 8px}' +
    '#gh3Notas ul{margin:0;padding:0;list-style:none}#gh3Notas li{position:relative;margin:0 0 7px;padding-left:18px;color:#cfc9d8;font-size:14px}' +
    '#gh3Notas li::before{content:"";position:absolute;left:2px;top:.5em;width:7px;height:7px;border-radius:50%;background:#c9a45c;box-shadow:0 0 6px #c9a45c88}' +
    '#gh3Notas details{margin:6px 0;padding:9px 12px;border-radius:9px;background:linear-gradient(180deg,#221d27,#16121a);border-left:4px solid var(--c,#c9a45c);box-shadow:0 2px 0 #000}' +
    '#gh3Notas summary{display:flex;align-items:center;gap:10px;cursor:pointer;font:600 20px/1.1 Teko,system-ui,sans-serif;letter-spacing:.05em;text-transform:uppercase;color:#fff}' +
    '#gh3Notas summary .ntI{flex:none}#gh3Notas details div{margin-top:6px;color:#cfc9d8;font-size:14px}' +
    'body #gh3Feedback{border:1px solid #6b5b44!important;border-radius:12px!important;background:linear-gradient(160deg,#211a26,#110e16)!important;box-shadow:inset 0 0 0 3px #0009,0 14px 44px rgba(0,0,0,.65)}' +
    'body #gh3Feedback h2{font:600 34px/1 Teko,system-ui,sans-serif!important;letter-spacing:.06em;color:#ffd23f;text-shadow:0 2px 0 #000}' +
    // En la portada del celular gh3-pro.js oculta todo lo que no sea #loaderPanel; la barra se muestra igual que al jugar (2026-10-21, pedido de Santi).
    'html.gh3Mobile body:not(.loaderStarted) #loaderLobby>div#gh3BarraAbajo{display:flex!important}';
  document.head.appendChild(st);
  // Celular (2026-10-22, pedido de Santi): la barra en dos columnas, con botones que llenan su celda.
  const stMovil = document.createElement('style');
  stMovil.textContent = '@media (max-width:600px){#gh3BarraAbajo{display:grid!important;grid-template-columns:1fr 1fr;gap:8px!important}#gh3BarraAbajo button,#gh3BarraAbajo .gh3FeedbackOpen{width:100%!important;font-size:17px!important;padding:0 8px!important}#gh3BarraAbajo #gh3PadDot{display:none!important}}';
  document.head.appendChild(stMovil);
  // Brave (2026-10-22, pedido de Santi): aviso debajo de la barra, cerrable (se recuerda en esta pestaña).
  let braveDetectado = false;
  navigator.brave?.isBrave?.().then((v) => { braveDetectado = !!v; }).catch(() => {});
  const avisoBrave = () => {
    if (sessionStorage.getItem('gh3AvisoBrave') === '1') return null;
    const b = document.createElement('div'); b.id = 'gh3AvisoBrave';
    b.style.cssText = 'margin:10px 0 0;padding:6px 6px 6px 12px;border-radius:9px;border:1px solid #6b5b44;background:#211a26;color:#ece6f2;font:14px/1.4 system-ui,sans-serif;display:flex;gap:10px;align-items:center';
    const t = document.createElement('span'); t.style.flex = '1';
    t.textContent = 'Estás usando Brave: el sonido puede llegar con unos 0,3 s de atraso. Para jugar mejor, usá Edge o Chrome.';
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Cerrar aviso');
    x.style.cssText = 'min-width:44px;min-height:44px';
    x.addEventListener('click', () => { try { sessionStorage.setItem('gh3AvisoBrave', '1'); } catch {} b.remove(); });
    b.append(t, x); return b;
  };
  // Íconos SVG de la barra (2026-10-22, pedido de Santi): reemplazan los emojis; toman el color del texto.
  const SVG = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-3px;margin-right:6px">';
  const ICONO_AYUDA = SVG + '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const ICONO_NOVEDADES = SVG + '<path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const ICONO_COMENTAR = SVG + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7l1.2 2.5 2.8.4-2 2 .5 2.7L12 13.3 9.5 14.6l.5-2.7-2-2 2.8-.4z"/></svg>';
  const ICONO_CALIBRAR = SVG + '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/></svg>';
  const css = 'min-height:44px;padding:0 20px;border-radius:10px;border:1px solid rgba(255,255,255,.25);background:#221a2d;color:#fff;font:600 15px system-ui,sans-serif;cursor:pointer';
  function openNotas() {
    if (document.getElementById('gh3Notas')) return;
    const d = document.createElement('div'); d.id = 'gh3Notas';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:rgba(4,2,8,.78);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';
    const fr = ['#3fd65a', '#e8473f', '#ffd23f', '#3d8bff', '#ff8a2b'];
    d.innerHTML = '<div class="nt">'
      + '<div class="ntH"><div class="ntT">PREGUNTAS FRECUENTES</div><button type="button" id="gh3NotasX">Cerrar</button></div>'
      + '<h3>Lo que ya arreglamos</h3><ul>' + ARREGLADO.map((t) => '<li>' + t + '</li>').join('') + '</ul>'
      + '<h3>Lo que todavía estamos arreglando</h3><ul>' + PENDIENTE.map((t) => '<li>' + t + '</li>').join('') + '</ul>'
      + '<h3>Preguntas frecuentes</h3>' + FAQ.map(([q, a], i) => '<details style="--c:' + fr[i % 5] + '"><summary>' + iconoPregunta(q, fr[i % 5]) + '<span>' + q + '</span></summary><div>' + a + '</div></details>').join('')
      + '</div>';
    d.addEventListener('click', (e) => { if (e.target === d || e.target.id === 'gh3NotasX') d.remove(); });
    document.body.appendChild(d);
  }
  const tick = () => {
    document.getElementById('gh3MovilDiag')?.remove();
    // Abajo de la ventana del juego; en la portada, abajo de la tarjeta del juego (2026-10-21, pedido de Santi).
    const box = document.getElementById('r5Box'), lobby = document.getElementById('loaderPanel');
    const anchor = [box, lobby].find((e) => e && e.offsetParent !== null) || box || lobby;
    if (!anchor) return;
    let bar = document.getElementById('gh3BarraAbajo');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'gh3BarraAbajo';
      bar.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin:10px 0 0;width:100%';
      const mk = (icono, txt, fn) => { const x = document.createElement('button'); x.type = 'button'; x.innerHTML = icono + txt; x.style.cssText = 'flex:1 1 auto;padding:0 14px';
        x.addEventListener('click', (e) => { e.stopPropagation(); x.blur(); fn(); }); return x; };
      bar.appendChild(mk(ICONO_AYUDA, 'Preguntas frecuentes', openNotas));
      bar.appendChild(mk(ICONO_NOVEDADES, 'Novedades', () => window.gh3Novedades?.show()));
      // Calibrar (2026-10-22, pedido de Santi): abre ☰ en la pestaña Sonido, donde está la guía de calibración.
      bar.appendChild(mk(ICONO_CALIBRAR, 'Calibrar', () => {
        const panel = document.getElementById('gh3Panel');
        if (!panel || panel.getBoundingClientRect().width === 0) document.getElementById('gh3MenuBtn')?.click();
        setTimeout(() => { document.querySelector('#gh3Panel .tabs [data-tab="sound"]')?.click(); document.getElementById('gh3CalibrationHelp')?.scrollIntoView({ block: 'center' }); }, 150);
      }));
      // Punto verde cuando hay un mando conectado (2026-10-22, pedido de Santi).
      const punto = document.createElement('span'); punto.id = 'gh3PadDot'; punto.title = 'Mando conectado';
      punto.style.cssText = 'display:none;align-self:center;width:10px;height:10px;border-radius:50%;background:#3fd65a';
      bar.appendChild(punto);
    }
    if (braveDetectado && !document.getElementById('gh3AvisoBrave')) { const av = avisoBrave(); if (av) bar.after(av); }
    const hayMando = [...(navigator.getGamepads?.() || [])].some((p) => p && p.connected);
    // 2026-10-24: si la barra ya existía sin el punto (Colima, 330 errores en 3 h por el tick de 1 s), no romper.
    const dot = bar.querySelector('#gh3PadDot'); if (dot) dot.style.display = hayMando ? 'inline-block' : 'none';
    // Guía de controles: botón para plegarla y dejar libre el juego (2026-10-22, pedido de Santi).
    // Ícono «plegar a la izquierda» (2026-10-22, pedido de Santi: el texto «Ocultar» quedaba feo).
    const ICONO_PLEGAR = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="display:block;transition:transform .2s"><path d="M14.5 6l-6 6 6 6" fill="none" stroke="#f1ecf6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const guia = document.getElementById('controllerGuide');
    if (guia && !guia.querySelector('#guideToggle')) {
      const hd = guia.querySelector('.guideHeading');
      const b = document.createElement('button'); b.type = 'button'; b.id = 'guideToggle'; b.innerHTML = ICONO_PLEGAR; b.title = 'Ocultar controles'; b.setAttribute('aria-label', 'Ocultar controles');
      b.setAttribute('aria-expanded', 'true'); b.style.cssText = 'min-height:34px;width:34px;display:flex;align-items:center;justify-content:center;padding:0;font:600 15px/1 Teko,Impact,"Arial Narrow",sans-serif;letter-spacing:1.1px;text-transform:uppercase;color:#f1ecf6;background:linear-gradient(#5b5b66,#2a2a31 48%,#17171c);border:1px solid #000;border-radius:9px;box-shadow:inset 0 1px 0 #ffffff33,0 2px 4px #0008;cursor:pointer';
      b.addEventListener('click', () => {
        const ocultar = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!ocultar)); b.title = ocultar ? 'Mostrar controles' : 'Ocultar controles'; b.setAttribute('aria-label', b.title); b.firstChild.style.transform = ocultar ? 'rotate(180deg)' : '';
        [...guia.children].forEach((c) => { if (c !== hd) c.hidden = ocultar; });
        // Plegar también la columna entera: el juego toma ese lugar (pedido de Santi).
        const rail = document.getElementById('gh3ControlsRail');
        if (rail) rail.toggleAttribute('data-compacto', ocultar);
        try { localStorage.setItem('gh3GuiaPlegada', ocultar ? '1' : '0'); } catch {}
        dispatchEvent(new Event('resize'));
      });
      hd?.appendChild(b);
      // Abierta por defecto (2026-10-22, Santi: la guía queda a mano; remapear se hace en el panel de la derecha).
      // Claude 08/11 (pedido de Santi): la guía arranca siempre recogida; se abre solo con el botón de ampliar.
      b.click();
    }
    if (bar.previousElementSibling !== anchor) anchor.insertAdjacentElement('afterend', bar);
    const fb = document.querySelector('.gh3FeedbackOpen:not(#gh3BarraAbajo .gh3FeedbackOpen)');
    if (fb && !bar.querySelector('.gh3FeedbackOpen')) { fb.style.width = 'auto'; fb.style.flex = '1 1 auto'; if (!fb.querySelector('svg')) fb.innerHTML = ICONO_COMENTAR + fb.textContent; bar.appendChild(fb); }
    const vis = bar.offsetParent !== null;
    document.querySelectorAll('.gh3FeedbackOpen').forEach((b) => { if (!bar.contains(b)) b.style.display = vis ? 'none' : ''; });
  };
  setInterval(tick, 1000); tick();
  window.gh3Notas = { open: openNotas };
})();
