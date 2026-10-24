(() => {
  const endpoint = 'https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-feedback';
  // Public anon credential: gateway verifies the JWT; RLS still denies direct table access.
  const publicKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52bHdsbXl1cW9yeGF1cGNkYmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDA2NzcsImV4cCI6MjEwNTg3NjY3N30.Q72VI5FTTR7WwqsbxSAJo6JRPTL_rhoUsXKwnm6TTPQ';
  let dialog, opener, sending = false, requestId;
  // Stop keyboard shortcuts before they reach the game's global handlers.
  for (const type of ['keydown', 'keyup']) window.addEventListener(type, event => {
    if (dialog?.open) event.stopImmediatePropagation();
  }, true);

  function init() {
    if (document.getElementById('gh3Feedback')) return;
    const style = document.createElement('style');
    style.textContent = `
      .gh3FeedbackOpen{font:inherit;color:#f5eee8;background:#281a24;border:1px solid #8f6d78;border-radius:10px;padding:12px 18px;cursor:pointer;min-height:44px;margin:12px 0}
      #gh3Feedback{color-scheme:dark;width:min(540px,calc(100vw - 24px));max-height:calc(100dvh - 24px);box-sizing:border-box;overflow:auto;border:1px solid #725b64;border-radius:20px;padding:24px;background:#171219;color:#f5eee8;box-shadow:0 24px 80px #0009;font:15px/1.5 'Segoe UI',sans-serif}
      #gh3Feedback::backdrop{background:#000b}#gh3Feedback *{box-sizing:border-box}#gh3Feedback [hidden]{display:none!important}
      #gh3Feedback h2{font:600 24px/1.2 'Segoe UI',sans-serif;margin:0 0 12px}#gh3Feedback p{color:#c5b8c2;margin:8px 0 16px}
      #gh3Feedback label{display:block;margin:16px 0 7px}#gh3Feedback input,#gh3Feedback textarea,#gh3Feedback select{width:100%;font:16px 'Segoe UI',sans-serif;color:#fff;background:#0b090d;border:1px solid #675360;border-radius:10px;padding:12px;min-height:44px}#gh3Feedback textarea{min-height:120px;resize:vertical}
      #gh3Feedback button{font:inherit;min-height:44px;padding:11px 18px;border-radius:10px;border:1px solid #8f6d78;color:#fff;background:#35202d;cursor:pointer}#gh3Feedback button[type=submit]{background:#9a2948;border-color:#c44769}#gh3Feedback button:disabled{opacity:.65;cursor:wait}
      #gh3Feedback .feedbackActions{display:flex;justify-content:space-between;gap:12px;margin-top:20px}#gh3Feedback .feedbackPrivacy{font-size:12px;line-height:1.5}#gh3Feedback .feedbackTrap{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}#gh3FeedbackStatus{min-height:24px;white-space:pre-wrap}#gh3FeedbackStatus.error{color:#ffb6c6}`;
    document.head.append(style);
    dialog = document.createElement('dialog');
    dialog.id = 'gh3Feedback'; dialog.setAttribute('aria-labelledby', 'gh3FeedbackTitle');
    dialog.innerHTML = `<form id="gh3FeedbackForm">
      <h2 id="gh3FeedbackTitle">¿Cómo te funcionó el juego?</h2>
      <p>Tu opinión ayuda a mejorar Las Vegas Hero. Podés calificarlo, contar un problema o sugerir algo.</p>
      <label for="gh3FeedbackRating">Calificación</label>
      <select id="gh3FeedbackRating" name="rating" required><option value="">Elegí una nota</option><option value="5">5 — Excelente</option><option value="4">4 — Bien</option><option value="3">3 — Regular</option><option value="2">2 — Con muchos problemas</option><option value="1">1 — No pude jugar</option></select>
      <label for="gh3FeedbackCategory">¿Sobre qué querés comentar?</label>
      <select id="gh3FeedbackCategory" name="category"><option value="general">Experiencia general</option><option value="performance">Fluidez / lentitud</option><option value="audio">Sonido</option><option value="controls">Controles</option><option value="loading">Carga / el juego no arranca</option><option value="graphics">Imagen / gráficos</option><option value="suggestion">Sugerencia</option><option value="other">Otro problema</option></select>
      <label for="gh3FeedbackMessage">Comentario <small>(opcional, hasta 2000 caracteres)</small></label>
      <textarea id="gh3FeedbackMessage" name="message" maxlength="2000" placeholder="Contame qué pasó y en qué momento. Si usás un celular, podés agregar el modelo."></textarea>
      <label for="gh3FeedbackNickname">Apodo <small>(opcional)</small></label><input id="gh3FeedbackNickname" name="nickname" maxlength="40" autocomplete="off">
      <div class="feedbackTrap" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="feedbackPrivacy">El comentario lo ve solamente Santi en su monitor privado. Se adjuntan el tipo de dispositivo y navegador. No incluyas correo, teléfono ni otros datos personales.</p>
      <p id="gh3FeedbackStatus" role="status" aria-live="polite"></p>
      <div class="feedbackActions"><button type="button" id="gh3FeedbackClose">Cerrar</button><button type="submit">Enviar opinión</button></div>
    </form>`;
    document.body.append(dialog);
    const form = dialog.querySelector('form'), status = dialog.querySelector('#gh3FeedbackStatus'), submit = form.querySelector('[type=submit]');
    const close = () => { dialog.close(); opener?.focus(); };
    dialog.querySelector('#gh3FeedbackClose').onclick = close;
    dialog.addEventListener('close', () => opener?.focus());
    form.addEventListener('input', () => { requestId = undefined; });
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (sending || !form.reportValidity()) return;
      requestId ||= crypto.randomUUID();
      const ua = navigator.userAgent;
      const ipad = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
      const device = /iPad|Tablet/i.test(ua) || ipad ? 'tablet' : /Android|iPhone|iPod|Mobile/i.test(ua) ? 'phone' : 'desktop';
      const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /OPR\//.test(ua) ? 'Opera' : navigator.brave ? 'Brave' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Other';
      const data = Object.fromEntries(new FormData(form));
      const payload = { ...data, rating: Number(data.rating), request_id: requestId, device, browser };
      sending = true; submit.disabled = true; status.className = ''; status.textContent = 'Enviando…';
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json', apikey: publicKey, authorization: `Bearer ${publicKey}` }, body: JSON.stringify(payload), signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 429 ? 'Ya enviaste varias opiniones. Esperá unos minutos y volvé a intentar.' : 'No se pudo enviar. Tu comentario sigue acá: podés volver a intentar.');
        const result = await response.json(); if (result.ok !== true) throw new Error('No se pudo confirmar el envío. Volvé a intentar.');
        form.reset(); requestId = undefined; status.textContent = '¡Gracias! Santi recibió tu opinión.';
      } catch (error) { status.className = 'error'; status.textContent = error.name === 'AbortError' ? 'La conexión tardó demasiado. Tu comentario sigue acá: volvé a intentar.' : error instanceof TypeError ? 'No se pudo conectar. Tu comentario sigue acá: volvé a intentar.' : error.message; }
      finally { clearTimeout(timeout); sending = false; submit.disabled = false; }
    });
    // Existing page and menu are created lazily. Observe only until both buttons exist.
    function attach() {
      for (const id of ['loaderPanel', 'gh3Panel']) {
        const host = document.getElementById(id);
        if (!host || host.querySelector('.gh3FeedbackOpen')) continue;
        const button = document.createElement('button'); button.type = 'button'; button.className = 'gh3FeedbackOpen'; button.textContent = 'Comentar / calificar';
        button.onclick = event => { event.preventDefault(); event.stopPropagation(); opener = button; window.gh3Touch?.releaseAll?.('feedback'); dialog.showModal(); };
        host.append(button);
      }
      if (document.querySelectorAll('.gh3FeedbackOpen').length === 2) observer.disconnect();
    }
    const observer = new MutationObserver(attach); observer.observe(document.body, { childList: true, subtree: true }); attach();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
