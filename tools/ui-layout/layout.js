import css from './layout.css';

// Presentation only: keep the original guide, inputs, tabs and event handlers.
const style = document.createElement('style');
style.id = 'gh3WorkspaceStyle';
style.textContent = css;
document.head.append(style);
const desktop = matchMedia('(min-width: 1000px) and (min-height: 480px)');
let queued = false;
let refs;
function reconcile() {
  queued = false;
  if (!refs) {
    const row = document.getElementById('gh3Row');
    const panel = document.getElementById('gh3Panel');
    const guide = document.getElementById('controllerGuide');
    const home = panel?.querySelector('section[data-tab="ctrl"]');
    if (!row || !panel || !guide || !home) return;
    const rail = document.createElement('aside');
    rail.id = 'gh3ControlsRail';
    rail.setAttribute('aria-label', 'Controles del juego');
    row.prepend(rail);
    const landing = document.createElement('div');
    landing.id = 'gh3LandingStage';
    row.insertBefore(landing, document.getElementById('r5Box'));
    const loaderPanel = document.getElementById('loaderPanel');
    const lobby = document.getElementById('loaderLobby');
    const content = document.createElement('div');
    content.id = 'gh3SettingsBody';
    content.tabIndex = 0;
    content.setAttribute('aria-label', 'Ajustes del juego');
    for (const section of [...panel.querySelectorAll(':scope > section[data-tab]')]) content.append(section);
    panel.append(content);
    const cheats = document.createElement('section');
    cheats.dataset.tab = 'cheats';
    cheats.hidden = true;
    const cheatList = panel.querySelector('#gh3CheatList');
    const cheatButton = panel.querySelector('#gh3CheatSongs');
    const cheatHint = panel.querySelector('#gh3CheatTxt');
    if (cheatList && cheatButton && cheatHint) {
      const title = document.createElement('h3');
      title.textContent = 'Trucos';
      cheats.append(title, cheatList, cheatButton.closest('.row'), cheatHint);
      content.append(cheats);
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.tab = 'cheats';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.textContent = 'Trucos';
      panel.querySelector('.tabs [data-tab="save"]').after(tab);
      const tabs = panel.querySelector('.tabs');
      tabs.addEventListener('click', event => {
        const selected = event.target.closest('button[data-tab]');
        if (!selected) return;
        for (const button of tabs.querySelectorAll('button[data-tab]')) button.setAttribute('aria-selected', String(button === selected));
        for (const section of content.querySelectorAll(':scope > section[data-tab]')) section.hidden = section.dataset.tab !== selected.dataset.tab;
        try { localStorage.setItem('gh3WorkspaceTab', selected.dataset.tab); } catch {}
        selected.blur();
      });
      try {
        const saved = localStorage.getItem('gh3WorkspaceTab');
        if (saved) tabs.querySelector(`button[data-tab="${['ctrl','keys','sound','gfx','save','cheats'].includes(saved) ? saved : 'sound'}"]`)?.click();
      } catch {}
    }
    // Put the optional input history in the settings rather than beside the game.
    const tapeHome = document.createElement('div');
    tapeHome.id = 'gh3TapeHome';
    panel.querySelector('section[data-tab="gfx"]').append(tapeHome);
    refs = { row, panel, guide, home, rail, content, tapeHome, landing, loaderPanel, lobby };
    mounts.disconnect();
    const moves = new MutationObserver(schedule);
    for (const container of [row, panel, home, rail]) moves.observe(container, { childList: true });
    new MutationObserver(schedule).observe(guide, { childList: true, subtree: true, characterData: true });
    new MutationObserver(schedule).observe(panel.querySelector('#gh3Keys'), { childList: true, subtree: true });
    const inputStatus = document.getElementById('c1Input');
    if (inputStatus) new MutationObserver(schedule).observe(inputStatus, { childList: true, subtree: true, characterData: true });
    const notice = document.createElement('p');
    notice.id = 'gh3PanelNotice';
    notice.className = 'soon';
    notice.textContent = 'Los botones del juego y los trucos se habilitan al iniciar.';
    panel.querySelector('.top').after(notice);
    const help = document.createElement('section');
    help.id = 'gh3CalibrationHelp';
    help.innerHTML = '<h3>¿El audio llega tarde?</h3><p><b>STRUM significa rasgueo.</b> Usá <span id="gh3StrumKeys"></span>. En joystick <b>Xbox o PlayStation</b>, usá la <b>cruceta ↑ / ↓</b>. En una guitarra, usá la <b>barra de rasgueo</b>.</p><ol><li>En el menú del juego, entrá a <b>Options → Calibrate Lag</b>.</li><li>Elegí <b>Calibrate</b> y confirmá con verde: <b>A en Xbox / ✕ en PlayStation</b>, o la tecla verde de tu guía. Esperá la cuenta regresiva.</li><li>Escuchá el ritmo y tocá STRUM cuando las notas crucen la marca. Soltá entre cada toque; no hace falta mantener un color.</li><li>Al terminar, revisá el valor y probá una canción. Repetí si cambiás de auriculares o modificás el colchón de sonido.</li></ol><details><summary>Ajustar los milisegundos a mano</summary><p>En Options → Calibrate Lag, seleccioná el valor en ms y confirmá con verde (A en Xbox o ✕ en PlayStation; en teclado, la tecla verde de tu guía). La cifra queda en naranja: ajustá con ↑ / ↓ o la cruceta y confirmá otra vez. Probá cambios pequeños y una canción entre ajustes.</p></details><p>Si las teclas no responden después de tocar un deslizador o selector, usá el botón de abajo para devolver el foco al juego.</p><p>Para calibrar, preferí parlantes o auriculares con cable. Bluetooth puede sumar demora.</p><p>Si el audio se corta, subí el colchón. Si suena continuo pero desfasado, usá la calibración del juego.</p><button type="button" id="gh3FocusGame">Volver al juego para calibrar</button>';
    panel.querySelector('section[data-tab="sound"]').append(help);
    help.querySelector('button').addEventListener('click', () => {
      const canvas = document.getElementById('r5Canvas');
      canvas.tabIndex = 0;
      document.activeElement?.blur();
      canvas.focus({ preventScroll: true });
      document.body.classList.remove('gh3DrawerOpen');
      const menu = document.getElementById('gh3MenuBtn');
      if (menu) menu.textContent = '☰';
    });
  }
  const { row, panel, guide, home, rail, tapeHome, landing, loaderPanel, lobby } = refs;
  const started = document.body.classList.contains('loaderStarted');
  const active = desktop.matches && !document.documentElement.classList.contains('gh3Mobile');
  if (document.body.classList.contains('gh3Workspace') !== active) document.body.classList.toggle('gh3Workspace', active);
  const destination = active ? rail : home;
  // Let the existing loader finish its one-time guide move after starting.
  if (guide.parentElement === home) refs.guideMounted = true;
  if (!started) {
    const guideDestination = active ? rail : lobby;
    if (guide.parentElement !== guideDestination) guideDestination.append(guide);
  } else if (refs.guideMounted && guide.parentElement !== destination) destination.append(guide);
  const loaderDestination = active ? landing : lobby;
  if (loaderPanel.parentElement !== loaderDestination) loaderDestination.prepend(loaderPanel);
  landing.hidden = !active || started;
  rail.hidden = !active;
  const ctrlTab = panel.querySelector('.tabs [data-tab="ctrl"]');
  if (active && ctrlTab.getAttribute('aria-selected') === 'true') panel.querySelector('.tabs [data-tab="sound"]').click();
  const mode = guide.querySelector('#guideMode')?.textContent || '';
  rail.dataset.mode = mode === 'Canción' ? 'song' : 'menu';
  const tape = document.getElementById('gh3Tape');
  if (tape && tape.parentElement !== tapeHome) tapeHome.append(tape);
  row.dataset.workspaceReady = 'true';
  for (const [action, label] of [['rasgueo arriba','STRUM ↑'],['rasgueo abajo','STRUM ↓']]) {
    const title = guide.querySelector(`.guideRow[data-action="${action}"] .guideActionName`);
    if (title && title.textContent !== label) title.textContent = label;
    for (const tr of panel.querySelectorAll('#gh3Keys tr')) {
      const td = tr.firstElementChild;
      if (td?.textContent === action) td.textContent = label;
    }
  }
  const keys = window.gh3Input?.getBinds?.()['rasgueo abajo'] || [];
  const keyText = keys.filter(Boolean).map(key => ({ArrowDown:'↓',ArrowUp:'↑',Space:'Espacio'}[key] || key.replace(/^(Key|Digit)/,''))).join(' o ') || 'la tecla que asignes a STRUM ↓ en Teclas';
  const keyLabel = document.getElementById('gh3StrumKeys');
  if (keyLabel && keyLabel.textContent !== keyText) keyLabel.textContent = keyText;
  const ready = !!window.gh3Input?.attached;
  document.getElementById('gh3PanelNotice').hidden = ready;
  for (const id of ['gh3Back','gh3Start','gh3Full','gh3Full2','gh3CheatSongs']) {
    const button = document.getElementById(id);
    if (!ready) { button.disabled = true; button.dataset.awaitGame = 'true'; }
    else if (button.dataset.awaitGame) { button.disabled = false; delete button.dataset.awaitGame; }
  }
}
function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(reconcile);
}
const mounts = new MutationObserver(schedule);
mounts.observe(document.documentElement, { childList: true, subtree: true });
function start() {
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  desktop.addEventListener('change', schedule);
  schedule();
}
if (document.body) start(); else addEventListener('DOMContentLoaded', start, { once: true });
