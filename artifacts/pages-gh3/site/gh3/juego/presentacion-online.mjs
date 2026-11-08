// Claude 08/11 (pedido de Santi): presentación de los dos jugadores antes de tocar online.
// Aparece cuando uno ya eligió personaje y guitarra: cada uno entra desde su lado con su retrato
// (hoja de retrato-online.mjs) y su guitarra, choque de VS en el medio. Cuando los dos eligieron, "¡A ROCKEAR!".
import {hoja, CUADROS} from './retrato-online.mjs';

const W = 96, H = 112;
const nombreLook = s => String(s || '').replace(/_[0-9]+$/, '').replace(/_/g, ' ').toUpperCase();
const css = `
#online-presenta{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;overflow:hidden;
 background:#000;font-family:Impact,system-ui,sans-serif;color:#fff}
#online-presenta iframe.esc{position:absolute;inset:0;width:100%;height:100%;border:0;pointer-events:none;opacity:0;transition:opacity .8s}
#online-presenta iframe.esc.on{opacity:1}
#online-presenta .vineta{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 60%,#0008 100%),linear-gradient(transparent 70%,#000a)}
#online-presenta .sombra{position:absolute;top:0;bottom:0;width:50%;right:0;pointer-events:none;background:linear-gradient(90deg,transparent,#000e 40%);transition:opacity .6s}
#online-presenta.todos .sombra{opacity:0}
#online-presenta .rayos{opacity:.35;mix-blend-mode:screen;position:absolute;inset:-50%;background:repeating-conic-gradient(from 0deg,#ff4b3e18 0 6deg,transparent 6deg 18deg);animation:op-gira 18s linear infinite}
#online-presenta .fila{position:absolute;left:0;right:0;bottom:4%;display:flex;align-items:flex-end;justify-content:space-between;padding:0 3vw}
#online-presenta .jug{display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0}
#online-presenta .jug.yo{animation:op-izq .7s cubic-bezier(.2,1.4,.4,1) forwards}
#online-presenta .jug.rival{animation:op-der .7s cubic-bezier(.2,1.4,.4,1) forwards}
#online-presenta .cara{width:${W}px;height:${H}px;max-width:28vw;max-height:33vw;background-color:#0d0a11;background-repeat:no-repeat;image-rendering:pixelated;
 border:4px solid #f5c542;border-radius:10px;box-shadow:0 0 30px #ff4b3e99,inset 0 0 0 3px #000}
#online-presenta .rival .cara{border-color:#ff4d8d}
#online-presenta .nom{font-size:clamp(22px,4vw,40px);letter-spacing:2px;text-shadow:0 3px 0 #000,0 0 18px #ff4b3e}
#online-presenta .pj{font-size:clamp(14px,2vw,20px);color:#f5c542;letter-spacing:2px}
#online-presenta .gtr{display:flex;align-items:center;gap:6px;font-size:clamp(12px,1.6vw,16px);color:#cdbf9f;letter-spacing:1px}
#online-presenta .gtr svg{width:34px;height:34px}
#online-presenta .espera .cara{filter:brightness(.25) grayscale(1)}
#online-presenta .vs{align-self:center;font-size:clamp(48px,10vw,120px);color:#ff4b3e;text-shadow:0 0 24px #ff4b3e,0 6px 0 #000;transform:scale(0);animation:op-vs .5s .55s cubic-bezier(.2,1.8,.4,1) forwards}
#online-presenta .estado{position:absolute;top:8%;left:0;right:0;text-align:center;font-size:clamp(20px,3.4vw,36px);letter-spacing:3px;text-shadow:0 3px 0 #000}
#online-presenta .estado.listo{color:#f5c542;animation:op-late .5s ease-in-out infinite alternate}
#online-presenta .destello{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
#online-presenta .destello.on{animation:op-flash .6s ease-out}
#online-presenta .cinta{display:none;position:absolute;top:10px;left:-6px;padding:2px 10px;background:#1f8f3a;color:#fff;font-size:16px;letter-spacing:2px;transform:rotate(-8deg);box-shadow:0 2px 0 #000}
#online-presenta .jug{position:relative}
#online-presenta .jug.listo .cinta{display:block}
#online-presenta .jug.listo.solo .cara{animation:op-late-oro 1.1s ease-in-out infinite alternate}
#online-presenta .jug.listo.solo{animation:op-izq .7s cubic-bezier(.2,1.4,.4,1) forwards,op-flota 2.2s .7s ease-in-out infinite}
#online-presenta .jug.rival.listo.solo{animation:op-der .7s cubic-bezier(.2,1.4,.4,1) forwards,op-flota 2.2s .7s ease-in-out infinite}
#online-presenta .jug.espera .cara{position:relative;overflow:hidden}
#online-presenta .jug.espera .cara::after{content:'';position:absolute;left:0;right:0;height:30%;background:linear-gradient(transparent,#ff4d8d66,transparent);animation:op-scan 1.4s linear infinite}
#online-presenta .jug.espera .pj{animation:op-parpa 1s steps(2) infinite}
#online-presenta.todos{animation:op-tiembla .45s linear}
#online-presenta.todos .vs{animation:op-golpe .5s cubic-bezier(.2,1.8,.4,1) forwards}
#online-presenta.todos .jug{animation:op-salta .6s cubic-bezier(.3,1.6,.5,1) 2 forwards;opacity:1}
#online-presenta.todos .cara{box-shadow:0 0 50px #f5c542,inset 0 0 0 3px #000}
@keyframes op-late-oro{from{box-shadow:0 0 12px #f5c54266,inset 0 0 0 3px #000}to{box-shadow:0 0 42px #f5c542,inset 0 0 0 3px #000}}
@keyframes op-flota{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes op-scan{from{top:-30%}to{top:100%}}
@keyframes op-parpa{50%{opacity:.35}}
@keyframes op-tiembla{0%,100%{transform:none}20%{transform:translate(-8px,4px)}40%{transform:translate(7px,-5px)}60%{transform:translate(-5px,-3px)}80%{transform:translate(4px,5px)}}
@keyframes op-golpe{0%{transform:scale(2.6) rotate(-6deg)}100%{transform:scale(1.15) rotate(-6deg)}}
@keyframes op-salta{0%{transform:none}40%{transform:translateY(-26px) scale(1.05)}100%{transform:none}}
#op-chip{position:fixed;left:50%;top:44px;transform:translateX(-50%);z-index:55;display:flex;align-items:center;gap:8px;padding:6px 14px;background:#160e0ee6;border:2px solid #ff4d8d;border-radius:8px;color:#f4ecd8;font:700 14px system-ui,sans-serif;letter-spacing:1px}
#op-chip.listo{border-color:#4be37a}
#op-chip i{width:10px;height:10px;border-radius:50%;background:#ff4d8d;animation:op-parpa .8s steps(2) infinite}
#op-chip.listo i{background:#4be37a;animation:none}
@keyframes op-gira{to{transform:rotate(360deg)}}
@keyframes op-izq{from{opacity:0;transform:translateX(-60vw) rotate(-8deg)}to{opacity:1;transform:none}}
@keyframes op-der{from{opacity:0;transform:translateX(60vw) rotate(8deg)}to{opacity:1;transform:none}}
@keyframes op-vs{to{transform:scale(1) rotate(-6deg)}}
@keyframes op-late{to{transform:scale(1.08)}}
@keyframes op-flash{0%{opacity:.85}100%{opacity:0}}
@media (prefers-reduced-motion:reduce){#online-presenta *{animation:none!important;opacity:1!important}#online-presenta .vs{transform:none}}`;

const GTR = c => `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${c}" d="M20.5 2.2l1.3 1.3-3.6 3.6.6.6-1.4 1.4-.6-.6-3.2 3.2c.9 1.7.7 3.8-.7 5.2-1.1 1.1-2.5 1.4-3.6 1.6-.9.2-1.4.6-1.7 1.4-.6 1.5-2.6 1.9-3.7.8l-1.4-1.4c-1.1-1.1-.7-3.1.8-3.7.8-.3 1.2-.8 1.4-1.7.2-1.1.5-2.5 1.6-3.6 1.4-1.4 3.5-1.6 5.2-.7l3.2-3.2-.6-.6 1.4-1.4.6.6z"/></svg>`;

let raiz = null, timers = [];
function cuadro(div, modelo, nombre) {
  const i = Math.max(0, CUADROS.indexOf(nombre));
  div.style.backgroundSize = (W * CUADROS.length) + 'px ' + H + 'px';
  div.style.backgroundPosition = (-i * W) + 'px 0';
  if (div.dataset.m !== modelo) { div.dataset.m = modelo; void hoja(modelo).then(u => { if (u && div.dataset.m === modelo) div.style.backgroundImage = 'url(' + u + ')'; }); }
}
function tarjeta(clase, color) {
  const d = document.createElement('div');
  d.className = 'jug ' + clase;
  d.innerHTML = '<div class="cinta">LISTO</div><div class="cara"></div><div class="nom"></div><div class="pj"></div><div class="gtr">' + GTR(color) + '<span></span></div>';
  return d;
}
function poner(d, j, espera) {
  d.classList.toggle('espera', !!espera);
  d.querySelector('.nom').textContent = (j.nombre || '').slice(0, 14);
  d.querySelector('.pj').textContent = espera ? 'ELIGIENDO...' : nombreLook(j.modelo || 'axel');
  d.querySelector('.gtr span').textContent = espera ? '' : (nombreLook(j.guitarra) || 'EXPLORER WHITE');
  d.querySelector('.gtr').style.visibility = espera ? 'hidden' : '';
  clearInterval(d._mira);
  const c = d.querySelector('.cara'), m = j.modelo || 'axel_1';
  if (espera) { const seq = ['centro', 'izq', 'izq', 'centro', 'der', 'der', 'parpadeo', 'centro']; let k = 0; cuadro(c, m, 'centro'); d._mira = setInterval(() => cuadro(c, m, seq[k++ % seq.length]), 260); }
  else cuadro(c, m, 'sonrisa');
}

// yo/rival: {nombre, modelo, guitarra}; rivalListo: si el compañero ya eligió.
// Escenario 3D (escena/index.html con modelo y modelo2): animado con el reloj de la canción y cámara por estado.
let esc = null, escUrl = '', escListo = false, escTimer = 0, camTimer = 0, camModo = null;
addEventListener('message', e => { if (e.data?.tipo === 'gh3-escena-lista' && esc && e.source === esc.contentWindow) { escListo = true; esc.classList.add('on'); } });
function camara(m) { camModo = m; try { esc?.contentWindow?.postMessage({tipo: 'gh3-camara', modo: m}, '*'); } catch {} }
function escena(url, todos) {
  esc = raiz.querySelector('iframe.esc');
  if (url && url !== escUrl) { escUrl = url; escListo = false; esc.classList.remove('on'); esc.src = url; }
  clearInterval(escTimer); let ms = 60000;
  escTimer = setInterval(() => { ms += 50; if (ms > 110000) ms = 60000; try { esc.contentWindow?.postMessage({tipo: 'gh3-cancion', ms, corre: true}, '*'); esc.contentWindow?.postMessage({tipo: 'gh3-camara', modo: camModo}, '*'); } catch {} }, 50);
  clearInterval(camTimer);
  // Esperando: primer plano tuyo y cada tanto una mirada al compañero (a oscuras). Los dos listos: plano general.
  if (todos) camara('pres-duo');
  else { let k = 0; camara('pres-yo'); camTimer = setInterval(() => camara(++k % 3 === 2 ? 'pres-compa' : 'pres-yo'), 2600); }
}
export const escenaLista = () => escListo;
// Carga el escenario escondido mientras se elige, para que la presentación aparezca al instante (no dibuja hasta mostrarse).
export function precargarEscena(url) {
  armar(); if (!raiz.isConnected) { raiz.style.display = 'none'; document.body.append(raiz); }
  esc = raiz.querySelector('iframe.esc');
  if (url && url !== escUrl) { escUrl = url; escListo = false; esc.classList.remove('on'); esc.src = url; }
}
function armar() {
  if (!raiz) {
    if (!mostrarPresentacion.__css) { const st = document.createElement('style'); st.textContent = css; document.head.append(st); mostrarPresentacion.__css = true; }
    raiz = document.createElement('div'); raiz.id = 'online-presenta'; raiz.setAttribute('role', 'status');
    raiz.innerHTML = '<iframe class="esc" title="Escenario" aria-hidden="true" tabindex="-1"></iframe><div class="rayos"></div><div class="vineta"></div><div class="fila"></div><div class="estado"></div><div class="destello"></div>';
    const fila = raiz.querySelector('.fila');
    fila.append(tarjeta('yo', '#f5c542'), Object.assign(document.createElement('div'), {className: 'vs', textContent: 'VS'}), tarjeta('rival', '#ff4d8d'));
  }
}
export function mostrarPresentacion(yo, rival, rivalListo, escenaUrl) {
  armar();
  if (!raiz.isConnected) document.body.append(raiz);
  raiz.style.display = '';
  const dy = raiz.querySelector('.yo'), dr = raiz.querySelector('.rival');
  poner(dy, yo, false); poner(dr, rival, !rivalListo);
  dy.classList.add('listo'); dy.classList.toggle('solo', !rivalListo);
  dr.classList.toggle('listo', !!rivalListo); dr.classList.remove('solo');
  raiz.classList.toggle('todos', !!rivalListo);
  escena(escenaUrl, !!rivalListo);
  const est = raiz.querySelector('.estado');
  est.classList.toggle('listo', !!rivalListo);
  est.textContent = rivalListo ? '¡A ROCKEAR!' : 'ESPERANDO A ' + (rival.nombre || 'TU COMPAÑERO').toUpperCase();
  if (rivalListo) {
    const f = raiz.querySelector('.destello'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
    // Los dos se ríen cuando arranca.
    timers.push(setTimeout(() => { if (!raiz) return; ['yo', 'rival'].forEach(k => cuadro(raiz.querySelector('.' + k + ' .cara'), (k === 'yo' ? yo : rival).modelo || 'axel_1', 'risa1')); }, 400));
  }
}
export function ocultarPresentacion() { timers.forEach(clearTimeout); timers = []; raiz?.querySelectorAll('.jug').forEach(d => clearInterval(d._mira)); raiz?.classList.remove('todos'); clearInterval(escTimer); clearInterval(camTimer); escUrl = ''; escListo = false; raiz?.remove(); ocultarChip(); }
// Cartelito arriba mientras vos todavía elegís: dice si el compañero sigue eligiendo o ya está listo.
let chip = null;
export function mostrarChip(nombre, listo) {
  if (!raiz) mostrarPresentacion.__css ||= (() => { const st = document.createElement('style'); st.textContent = css; document.head.append(st); return true; })();
  if (!chip) { chip = document.createElement('div'); chip.id = 'op-chip'; chip.setAttribute('role', 'status'); chip.innerHTML = '<i></i><span></span>'; }
  if (!chip.isConnected) document.body.append(chip);
  chip.classList.toggle('listo', !!listo);
  chip.querySelector('span').textContent = (nombre || 'Tu compañero') + (listo ? ' ya eligió: te espera' : ' está eligiendo...');
}
export function ocultarChip() { chip?.remove(); }
