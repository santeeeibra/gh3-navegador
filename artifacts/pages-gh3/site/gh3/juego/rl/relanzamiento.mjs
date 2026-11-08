import {runBoot} from './boot-sequence.mjs';
let bootActive=true;
// Claude 2026-11-03 (relanzamiento v2): novedades la primera vez; sorpresa del desafío inaugural una vez por visita,
// 8-20 s después y solo con el HUB libre; 5 s para decidir; omitir o agotar el tiempo = «vergüenza» y Setlist.
// ?intro=1 fuerza las novedades. El botón DESAFÍO INAUGURAL sigue abriendo el desafío a mano.
const CLAVE='gh3-relanzamiento-novedades-v4',VISITA='gh3-relanzamiento-sorpresa',DECIDIR=5000,VERGUENZA=2500;
let api=null,capa=null,alListo=null,ultimaEntrada=0,sorpresaT=0,soltarMando=false,inertAnterior=false;
const leer=(s,k)=>{try{return s.getItem(k)==='1';}catch{return false;}};
const poner=(s,k)=>{try{s.setItem(k,'1');}catch{}};
const gamepad=()=>Array.from(navigator.getGamepads?.()||[]).find(g=>g?.connected);
// Claude 05/11: el teclado y el mouse solo esperan a la capa/intro. Antes también esperaban a que el mando
// quedara en reposo con ejes incluidos: una guitarra con inclinación/whammy deja un eje fijo y bloqueaba
// las teclas para siempre. Ahora el mando solo espera a soltar botones, con tope de 1,5 s.
let soltarDesde=0;
function bloqueadoTeclado(){return bootActive||!!capa;}
function bloqueado(){
 if(bootActive||capa)return true;
 if(soltarMando){const g=gamepad();if(!soltarDesde)soltarDesde=performance.now();soltarMando=!!g&&g.buttons.some(b=>b.pressed)&&performance.now()-soltarDesde<1500;if(!soltarMando)soltarDesde=0;}
 return soltarMando;
}
window.__gh3Relanzamiento={listo(a){api=a;alListo?.();},bloqueado,bloqueadoTeclado,entrada(){ultimaEntrada=performance.now();}};
const CRANEO='<svg class="rl-craneo" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2C8.8 2 4 7 4 13.5c0 3.6 1.6 6.3 4 8V26h3v3h3v-3h4v3h3v-3h3v-4.5c2.4-1.7 4-4.4 4-8C28 7 23.2 2 16 2z"/><circle cx="11" cy="14" r="3.4"/><circle cx="21" cy="14" r="3.4"/><path d="M16 18l-2 4h4z"/></svg>';
function abrir(html,cls){const stage=document.getElementById('stage');if(!capa&&stage){inertAnterior=stage.inert;stage.inert=true;}capa?.remove();capa=document.createElement('div');capa.id='rl-capa';capa.className=cls||'';capa.innerHTML=html;document.body.append(capa);mando();return capa;}
function cerrar(){capa?.remove();capa=null;soltarMando=true;const stage=document.getElementById('stage');if(stage)stage.inert=inertAnterior;}
// Mientras hay capa, el HUB no recibe teclas; fuera de ella se registra la última entrada para no interrumpir.
addEventListener('keydown',e=>{ultimaEntrada=performance.now();if(bootActive)return;if(!capa)return;e.preventDefault();e.stopImmediatePropagation();capa.__tecla?.(e);},{capture:true});
for(const t of ['pointerdown','wheel','input'])addEventListener(t,()=>{ultimaEntrada=performance.now();},{capture:true,passive:true});
for(const t of ['pointerdown','pointerup','click','dblclick','contextmenu','wheel'])addEventListener(t,e=>{
 if(!capa||capa.contains(e.target))return;
 e.preventDefault();e.stopImmediatePropagation();
},{capture:true,passive:false});
// Mando: A/Start = aceptar o cerrar; B = omitir.
function mando(){
 const previo=new Set(),owner=capa;
 const paso=()=>{if(capa!==owner)return;const g=gamepad();
  if(g)g.buttons.forEach((b,i)=>{if(capa!==owner)return;if(b.pressed&&!previo.has(i)){previo.add(i);owner.__mando?.(i);}else if(!b.pressed)previo.delete(i);});
  requestAnimationFrame(paso);};
 // Los botones ya apretados al abrir no cuentan.
 const g=gamepad();g?.buttons.forEach((b,i)=>b.pressed&&previo.add(i));
 requestAnimationFrame(paso);
}
const marco=(cls,contenido)=>`<div class="rl-marco ${cls}" role="dialog"><i class="rl-remache a"></i><i class="rl-remache b"></i><i class="rl-remache c"></i><i class="rl-remache d"></i>${CRANEO.replace('rl-craneo','rl-craneo izq')}${CRANEO.replace('rl-craneo','rl-craneo der')}${contenido}</div>`;
function novedades(){
 const c=abrir(marco('rl-novedades',`<p class="rl-sub">GH3 UNIVERSAL 0.6</p><h2>RELANZAMIENTO</h2><ul>
<li>Esta versión es <b>mucho más estable</b>.</li>
<li>Ya está activo el <b>modo Historia</b>: avanzá por los escenarios, ganá dinero y desbloqueá guitarras y personajes.</li>
<li>Ya podés jugar <b>online con amigos</b>: cara a cara o cooperativo, en salas públicas o privadas. Entrá desde MULTIPLAYER, CO-OP CAREER o el panel ONLINE.</li></ul>
<div class="rl-botones"><button data-a="1">¡A ROCKEAR! <small>Enter</small></button></div>`),'rl-fondo');
 const fin=()=>{if(!capa)return;poner(localStorage,CLAVE);cerrar();};
 c.__tecla=e=>{if(!e.repeat&&(e.code==='Enter'||e.code==='Space'||e.code==='Escape'))fin();};c.__mando=i=>{if(i===0||i===1||i===9)fin();};
 c.querySelector('button').addEventListener('click',fin);c.querySelector('button').focus();
}
// Libre = sin canción, sin otra capa/modal ni carga visible, sin foco en un campo y 1,5 s sin entradas.
function libre(){
 if(capa||!api||api.ocupado()||document.querySelector('iframe'))return false;
 if(performance.now()-ultimaEntrada<1500)return false;
 const a=document.activeElement;if(a&&(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a.isContentEditable))return false;
 return !Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[role="alert"],[aria-busy="true"],.loading,.cargando')).some(e=>!e.closest('[hidden],[aria-hidden="true"]')&&e.getClientRects().length);
}
// Claude 04/11 (pedido de Santi): si el cartel de afuera se acaba de cerrar (marca gh3-desafio-ya), el desafío sale ya.
const YA='gh3-desafio-ya';let listoBoot=false;
function tomarYa(){try{const v=localStorage.getItem(YA);if(!v)return false;localStorage.removeItem(YA);return Date.now()-Number(v)<120000;}catch{return false;}}
function programarSorpresa(ya){
 return; // 08/11: desafio inaugural quitado a pedido de Santi
 if(leer(sessionStorage,VISITA))return;
 if(sorpresaT){if(!ya)return;clearTimeout(sorpresaT);}
 sorpresaT=setTimeout(function intento(){if(!libre()){sorpresaT=setTimeout(intento,ya?250:1000);return;}poner(sessionStorage,VISITA);transicion();},ya?0:8000+Math.random()*12000);
}
addEventListener('storage',e=>{if(e.key===YA&&e.newValue&&listoBoot&&tomarYa())programarSorpresa(true);});
function transicion(){const c=abrir('<div class="rl-golpe"></div>','rl-trans');setTimeout(()=>{if(capa===c)desafio();},650);}
function desafio(){
 poner(sessionStorage,VISITA);clearTimeout(sorpresaT);
 const c=abrir(marco('rl-desafio',`<img class="rl-logo-gh3" src="/gh3/juego/original/0149_DA2408B2_DA2408B2.img.xen.png" alt="Guitar Hero III: Legends of Rock"><div class="rl-corona">${CRANEO}</div><div class="rl-placa"><h2>DESAFÍO INAUGURAL</h2></div>
<div class="rl-banda"><i class="rl-rayo"></i><p class="rl-tema">RAINING BLOOD <span>·</span> SLAYER</p><i class="rl-rayo"></i></div>
<p class="rl-nota">Desafío especial: la canción completa. Puedes omitirlo si lo prefieres.</p>
<div class="rl-pua"><i></i></div>
<div class="rl-botones"><button data-a="1">ACEPTAR <small>Enter</small></button><button data-a="0" class="rl-omitir">OMITIR <small>Esc</small></button></div>
<div class="rl-cuenta" aria-hidden="true"><i></i></div><p class="rl-estado" role="status"></p>`),'rl-fondo');
 let hecho=false;const est=c.querySelector('.rl-estado'),reloj=setTimeout(()=>elegir(false),DECIDIR);
 c.querySelector('.rl-cuenta i').style.animationDuration=DECIDIR+'ms';
 function elegir(ok){
  if(hecho||capa!==c)return;
  if(!api){est.textContent='Cargando el HUB…';alListo=()=>{alListo=null;elegir(ok);};return;}
  hecho=true;clearTimeout(reloj);
  if(!ok){verguenza();return;}
  cerrar();if(!api.jugar('rainingblood','hard'))api.setlist();
 }
 c.__tecla=e=>{if(e.repeat)return;if(e.code==='Enter'||e.code==='Space')elegir(true);else if(e.code==='Escape'||e.code==='Backspace')elegir(false);};
 c.__mando=i=>{if(i===0||i===9)elegir(true);else if(i===1)elegir(false);};
 c.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>elegir(b.dataset.a==='1')));
 c.querySelector('button').focus();
}
function verguenza(){
 const c=abrir(`<div class="rl-verguenza" role="alert">${CRANEO}<p>ERES UNA<br><b>VERGÜENZA</b><br>PARA EL ROCK</p></div>`,'rl-rojo');
 c.__tecla=()=>{};
 setTimeout(()=>{if(capa!==c)return;c.classList.add('rl-sale');setTimeout(()=>{if(capa===c){cerrar();api?.setlist();}},300);},VERGUENZA-300);
}
async function afterBoot(){await runBoot();bootActive=false;soltarMando=true;dispatchEvent(new Event('gh3-boot-finished'));

// Claude 08/11 (pedido de Santi): sin cartel de novedades RELANZAMIENTO; ?intro=1 todavía lo muestra.
if(new URLSearchParams(location.search).get('intro')==='1')novedades();else{listoBoot=true;programarSorpresa(tomarYa());}

}
void afterBoot();
