import {opcionesPartida} from '../../../../trucos.mjs';
import {errorCarga} from '../../../gameplay/error-carga.mjs';
import {audioStart} from '../../../online.mjs';
// Claude 2026-10-31: motor-01. Une las piezas. El cuadro solo dibuja y entrega eventos ya fechados al juicio:
// el resultado del juicio no depende de cuántos cuadros se dibujen.
// motor-05: la canción, el audio, el offset y las texturas salen de un paquete (paquete.ts); nada de Slow Ride queda fijo acá.
import {ponerFrases} from './chart.js';
import {Batalla} from './batalla.js';
import { Juicio, CAP_RESULTADOS, R_ACIERTO,             } from './juicio.js';
import { REGLAS_PROPIAS } from './reglas.js';
import { Reloj } from './reloj.js';
import {enOrigen} from './audio-clock.js';
import { Entrada, TECLAS_RASGUEO, teclasWhammy } from './entrada.js?v=20261105';
import { Mezcla, PISTAS, verificarBuffer, verificarSincronia,            } from './audio.js';
import { Autopista } from './autopista.js?v=20261104b';
import { GH3 } from './geometria.js';
import { cargarRecursos } from './texturas.js';
import { leerIndice, cargarPaquete, cargarChart, fuentesTextura, esperadoDe, DIFICULTADES,                                                              } from './paquete.js';
import { Reaccion } from './reaccion.js';
                                              
import { Mando,                             } from './mando.js?v=20261105';
import { Vibrato } from './vibrato.js';
// Claude 2026-11-02 (concierto): concierto original grabado detrás de la autopista, atado al reloj de audio (fondo.ts).
import { Fondo } from './fondo.js';

const $ = (id        ) => document.getElementById(id) ;
const params = new URLSearchParams(location.search);
const onlineMode=params.has('online');let onlineStart=null;
// Claude 05/11: coop local de prueba (?coop=1). Dos autopistas con la geometría de 2 jugadores del original (geometria.js),
// mismo chart de guitarra. J1 = A S D F G, J2 = H J K L Ñ. Modo simplificado forzado. Sin whammy por teclado.
const coopMode=params.has('coop');
// Claude 05/11: coop online. La autopista propia la juzga juicio; la del compañero (juicio2) se alimenta con sus pulsaciones por la sala.
const coopRemoto=coopMode&&onlineMode, ladoDer=params.get('lado')==='2';
let remSong=null,pendRem=[],ultimoEnvio=0;
window.__gh3Remoto=o=>{if(!coopRemoto||!Array.isArray(o.ev))return;for(const ev of o.ev)if(ev&&Number.isFinite(ev.t)&&['abajo','arriba','rasgueo'].includes(ev.tipo))cola2.push({t:ev.t,tipo:ev.tipo,carril:ev.carril});if(Number.isFinite(o.song))remSong=Math.max(remSong??-Infinity,o.song);};
const P2_TECLAS={KeyH:'KeyA',KeyJ:'KeyS',KeyK:'KeyD',KeyL:'KeyF',Semicolon:'KeyG'};
const entrada2=new Entrada();entrada2.teclasW=new Set();
const cola2=[];const reaccion2=new Reaccion();
let vista2=null,juicio2=null,hudCoop=null;
const leerNum = (k        , d        ) => { const v = Number(params.get(k)); return params.has(k) && Number.isFinite(v) ? v : d; };
const guardado = ()         => { try { return Number(localStorage.getItem('motor01.calib')) || 0; } catch { return 0; } };
const guardar = (v        ) => { try { localStorage.setItem('motor01.calib', String(v)); } catch {} };
// motor-04: dos modos. GH3 auténtico (traste + rasgueo, HOPO); simplificado (apretar el traste toca). T alterna.
// motor-041: el simplificado es el de arranque (clave nueva, para no heredar lo guardado en 0.4).
let sinRasgueo = (() => { try { return localStorage.getItem('motor041.modo') !== 'gh3'; } catch { return true; } })();
if(params.has('modo'))sinRasgueo=params.get('modo')!=='gh3';
if(coopMode)sinRasgueo=true;
const almacen = (() => { try { return localStorage; } catch { return null; } })();
const mando = new Mando(almacen);
// Claude 05/11: en coop local el segundo mando conectado es el jugador 2.
const mando2 = coopMode && !onlineMode ? new Mando(almacen) : null;
// Claude 05/11: perfil detectado solo al conectar (controles-core vía controles-motor); teclas remapeadas al vuelo.
mando.detectar = (gp) => (globalThis).gh3Dispositivo?.(gp) || null;
addEventListener('storage', (e) => { if (!e.key || e.key === 'gh3.teclas') entrada.recargarTeclas(); });
const vibrato = new Vibrato();
let nodoVibrato                          = null;
let tonoPuesto = 1, textoMando = '';

let chart       ;
let paq              ;
let cancion         ;
let ctx                      = null;
let mezcla                = null;
let reloj               = null;
let juicio                = null;
let dificultadActual            ='medium';
let vista           ;
const entrada = new Entrada();
if(coopMode)entrada.teclasW=new Set();
const cola           = [];
const VACIA              = {
  estado: new Uint8Array(0), sostenida: -1, presionados: 0,
  nResultados: 0, resTipo: new Uint8Array(CAP_RESULTADOS), resT: new Float64Array(CAP_RESULTADOS), resMask: new Uint8Array(CAP_RESULTADOS),
};
const reaccion = new Reaccion();
let jugando = false, pausado = false, terminado = false, pausaRemota = false;
let ultimoVisual = -Infinity;
const hud = { puntos: -1, racha: -1, mult: -1, prec: -1, desvio: NaN };
const fondo = new Fondo($('fondo')                    , leerNum('fondoofs', 0));
let fondoListo = false;
let starPrevio=false,batalla=null,datosBatalla=null;
let perdidaVista=false;
// Derrota ante el Diablo: Satan-Battle_LOSS (si el mp4 existe) sobre la pantalla de fallo.
function peliculaPerdida(){
  if(perdidaVista||params.get('cancion')!=='bossdevil')return;perdidaVista=true;
  const v=document.createElement('video');v.src='/gh3/juego/rl/cinematicas/Satan-Battle_LOSS.mp4';v.autoplay=true;v.playsInline=true;
  v.style.cssText='position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:100;object-fit:contain';
  const fin=()=>v.remove();v.onended=fin;v.onerror=fin;v.onclick=fin;document.body.append(v);v.play().catch(fin);
}
const usarPoder=(t)=>batalla?batalla.disparar(t):juicio?.activarStarPower(t);
let disposed=false, raf=0, juicioTimer                                ;
const loadAbort=new AbortController();
function dispose()       {
  if(metricsStarted06&&!metricsEnded06)emit06('finished','quit');
  emit06('menu');
  batalla?.quitar();
  if(disposed)return;disposed=true;jugando=false;
  loadAbort.abort();cancelAnimationFrame(raf);clearInterval(juicioTimer);
  mezcla?.detener();nodoVibrato?.disconnect();
  if(ctx&&ctx.state!=='closed')void ctx.close().catch(()=>{});
  fondo.video.pause();fondo.video.removeAttribute('src');
  vista?.gl.getExtension('WEBGL_lose_context')?.loseContext();
  vista2?.gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/** Coop: dos lienzos a pantalla completa (1280x720 virtual cada uno), corridos -225 y +225 px virtuales como setup_highway. */
function armarCoop(){
  const c1=$('pista'),c2=document.createElement('canvas');c2.id='pista2';c1.after(c2);
  const corrimiento=GH3.xOffsetP2/1280*100;
  const base='position:fixed;inset:0;width:100%;height:100%;display:block;background:transparent;pointer-events:none;';
  const s1=ladoDer?'':'-',s2=ladoDer?'-':'';
  c1.style.cssText=base+`transform:translateX(${s1}${corrimiento}%)`;
  c2.style.cssText=base+`transform:translateX(${s2}${corrimiento}%)`;
  document.querySelector('.hud')?.setAttribute('hidden','');
  // El HUD original de gameplay/hud.mjs es el de 1 jugador (career_hud_2d_elements): en coop no corresponde.
  const st=document.createElement('style');st.textContent='#gh3Hud{display:none!important}';document.head.append(st);
  // HUD provisional (texto). El del original (faceoff/coop, texturas HUD_2p_*) queda para la etapa siguiente.
  const caja=(lado,color)=>{const d=document.createElement('div');d.style.cssText=`position:fixed;top:12%;${lado}:4%;z-index:5;width:190px;padding:10px 14px;background:linear-gradient(rgba(27,16,18,.88),rgba(13,8,9,.88));border:3px solid ${color};border-radius:10px;font:700 15px system-ui,sans-serif;color:#fff;text-align:center;font-variant-numeric:tabular-nums;white-space:normal;text-shadow:0 1px 2px #000`;document.body.append(d);return d;};
  hudCoop={j1:caja(ladoDer?'right':'left','#3fdc7a'),j2:caja(ladoDer?'left':'right','#ff4d8d'),txt:['','','']};
  // Claude 05/11: equipo arriba al centro, como en el coop del GH3: un puntaje y un rockómetro compartidos.
  hudCoop.eq=caja('left','#c9a227');hudCoop.eq.style.left='50%';hudCoop.eq.style.top='2%';hudCoop.eq.style.transform='translateX(-50%)';hudCoop.eq.style.width='300px';hudCoop.eq.id='gh3Equipo';st.textContent+='@media (max-height:520px){#gh3Equipo{transform:translateX(-50%) scale(.55)!important;transform-origin:top center}}';
  return c2;
}
// Claude 05/11: HUD coop con rockómetro (concierto.rock 0..2) y juzgado (último resultado + precisión).
let juz=['',''];
function rockBarra(rock){const r=Math.max(0,Math.min(1,rock/2));const col=r<1/3?'#ff4b3e':r<2/3?'#f5c542':'#4be37a';
  return '<div style="position:relative;height:12px;margin:4px 0 2px;border-radius:6px;background:linear-gradient(90deg,#7a1410 0 33%,#7a6410 33% 66%,#146b2c 66%);border:2px solid #000;box-shadow:0 0 0 1px #c9a227"><div style="position:absolute;top:-4px;bottom:-4px;left:calc('+(r*100).toFixed(1)+'% - 3px);width:6px;border-radius:3px;background:'+col+';box-shadow:0 0 8px '+col+'"></div></div>';}
function dibujarCoop(){
  if(!hudCoop)return;
  const f=(n,j,k)=>{const nom=window.__gh3Nombres||parent.__gh3NombresOnline?.()||{};const nombre=coopRemoto?(n===1?(nom.yo||'VOS'):(nom.compa||'COMPAÑERO')):'JUGADOR '+n;if(!j)return '<b>'+nombre+'</b>';const r=j.resumen();
    const ok=/^(¡|BIEN|PERFECT|GENIAL)/i.test(juz[k])||juz[k]==='';
    return '<div style="font:20px Impact,system-ui;letter-spacing:1px">'+nombre+'</div>'+((coopRemoto&&(n===1?nom.lookYo:nom.lookCompa))?'<div style="font:11px system-ui;color:#cdbf9f;letter-spacing:1px">'+(n===1?nom.lookYo:nom.lookCompa)+'</div>':'')+'<div style="font:26px Impact,system-ui;color:#fff">'+r.puntos.toLocaleString('es')+'</div><div>x'+r.mult+' · Racha '+r.racha+'</div>'
      
      +'<div style="font-size:11px;color:#cdbf9f;letter-spacing:1px;margin-top:4px">JUZGADO</div><div style="font:18px Impact,system-ui;color:#f5c542">'+Math.round(r.precision*100)+'% · '+r.aciertos+'/'+(r.aciertos+r.fallos)+'</div>'
      +'<div style="min-height:18px;font:700 15px system-ui;color:'+(ok?'#5fe08a':'#ff6b5b')+'">'+(juz[k]||'')+'</div>';};
  // Claude 05/11: con el HUD original por jugador (gameplay/hud-dos.mjs) las cajas de texto de cada jugador sobran.
  if(window.__gh3HudDos){hudCoop.j1.hidden=hudCoop.j2.hidden=true;}else{
  const a=f(1,juicio,0),b=f(2,juicio2,1);
  if(a!==hudCoop.txt[0]){hudCoop.txt[0]=a;hudCoop.j1.innerHTML=a;}
  if(b!==hudCoop.txt[1]){hudCoop.txt[1]=b;hudCoop.j2.innerHTML=b;}}
  const p1=juicio?.resumen().puntos??0,p2=juicio2?.resumen().puntos??0,rk=((juicio?.concierto.rock??1)+(juicio2?.concierto.rock??1))/2;
  const e='<div style="font:16px Impact,system-ui;letter-spacing:2px;color:#f5c542">EQUIPO</div><div style="font:30px Impact,system-ui">'+(p1+p2).toLocaleString('es')+'</div>'+rockBarra(rk);
  if(e!==hudCoop.txt[2]){hudCoop.txt[2]=e;hudCoop.eq.innerHTML=e;}
}
addEventListener('pagehide',dispose);

/** El servidor sirve el concierto en fondo/ (solo local). Sin él se juega igual, con fondo negro. */
async function cargarFondo()                {
  try {
    // Concierto 0.6: fondo/ = video nuevo (color corregido, x264); ?video=05 usa el de la demo 0.5 para comparar.
    const dir = params.get('video') === '05' ? 'fondo-05/' : 'fondo/';
    const r = await fetch(dir + 'estados.json');
    if (!r.ok) throw Error('falta ' + dir + 'estados.json');
    fondo.estados = Float64Array.from((await r.json()).estadosMs            );
    const v = fondo.video                    ;
    v.src = dir + 'concierto.mp4';
    await new Promise      ((ok, mal) => { v.onloadedmetadata = () => ok(); v.onerror = () => mal(Error('no se pudo abrir el video del concierto')); });
    fondoListo = true;
    $('fondoInfo').textContent = `Concierto original (video ${dir === 'fondo/' ? '0.6' : '0.5'}): ${fondo.estados.length} estados reales, ${v.duration.toFixed(0)} s`;
  } catch (e) { $('fondoInfo').textContent = 'Sin concierto de fondo: ' + (e         ).message; }
}

const NOMBRE_DIF                             = { easy: 'Fácil', medium: 'Medio', hard: 'Difícil', expert: 'Experto' };

/** motor-05: llena un selector; al cambiarlo se recarga la página con la elección en la dirección (texturas y audio se cargan de cero). */
function llenar(id        , opciones                    , elegido        , cambiar                     )       {
  const s = $(id)                     ;
  s.replaceChildren(...opciones.map(([v, t]) => new Option(t, v, v === elegido, v === elegido)));
  s.disabled = opciones.length < 2;
  s.onchange = () => cambiar(s.value);
}

function ir(p                        )       {
  const u = new URL(location.href);
  for (const k of ['paquete', 'cancion', 'dificultad']) u.searchParams.delete(k);
  for (const [k, v] of Object.entries(p)) u.searchParams.set(k, v);
  location.href = u.href;
}

async function iniciar()                {
  let dif            ;
  try {
    // Paquete: ?paquete=<id> o el primero de la lista. Canción: ?cancion=<id> o la primera. Dificultad: ?dificultad= o medium.
    estado('Buscando paquetes...');
    const f = fetch                    ;
    const lista = await leerIndice(f);
    const ent = lista.find((x) => x.id === params.get('paquete')) ?? lista[0];
    if (!ent) throw Error('no hay paquetes (si es el original local, ¿están los recursos en esta PC?)');
    // El selector de paquete va antes de cargarlo: si un paquete falla, se puede elegir otro.
    llenar('selPaquete', lista.map((x) => [x.id, x.nombre]), ent.id, (id) => ir({ paquete: id }));
    paq = await cargarPaquete(f, ent.ruta, location.href);
    cancion = paq.paquete.canciones.find((c) => c.id === params.get('cancion')) ?? paq.paquete.canciones[0];
    const pedida = params.get('dificultad')                     ;
    dif = pedida && cancion.dificultades[pedida] ? pedida : cancion.dificultades.medium ? 'medium' : DIFICULTADES.find((x) => cancion.dificultades[x]) ;
    dificultadActual=dif;
    llenar('selCancion', paq.paquete.canciones.map((c) => [c.id, c.artista ? `${c.titulo} (${c.artista})` : c.titulo]), cancion.id,
      (id) => ir({ paquete: paq.paquete.id, cancion: id }));
    llenar('selDificultad', DIFICULTADES.filter((x) => cancion.dificultades[x]).map((x) => [x, NOMBRE_DIF[x]]), dif,
      (d) => ir({ paquete: paq.paquete.id, cancion: cancion.id, dificultad: d }));
    $('licencia').textContent = `${paq.paquete.licencia.publicable ? 'Contenido publicable' : 'Solo para esta PC, no publicar'}: ${paq.paquete.licencia.detalle}`;
    estado(`Cargando texturas del paquete ${paq.paquete.nombre}...`);
    vista = new Autopista($('pista')                     , await cargarRecursos(fuentesTextura(paq)));
    vista.escena.onda = vibrato.onda; // concierto 0.6: la cola enganchada ondula con la palanca (whammywibble)
    if (coopMode) vista2 = new Autopista(armarCoop(), await cargarRecursos(fuentesTextura(paq)));
    chart = await cargarChart(f, paq, cancion, dif);
    if (params.get('batalla')) { try { datosBatalla = await (await fetch('paquetes/' + paq.paquete.id + '/batalla.json')).json(); ponerFrases(chart, datosBatalla.frases[dif]); } catch (e) { datosBatalla = null; console.warn('batalla', e); } }
    estado('');
  } catch (e) { estado('Error: ' + (e         ).message, true);$('empezar').hidden=false;$('empezar').onclick=()=>location.reload();return; }
  addEventListener('resize', () => { vista.redimensionar(); vista2?.redimensionar(); });
  const nombreDif = NOMBRE_DIF[dif];
  $('tituloCancion').textContent = `${cancion.titulo} — ${nombreDif}`;
  $('infoChart').textContent = `${cancion.titulo} ${nombreDif}: ${chart.notas.length} notas${paq.paquete.local ? ' originales' : ''}`;
  $('paquete').textContent = `Paquete: ${paq.paquete.nombre} · ${paq.paquete.licencia.publicable ? 'publicable' : 'solo local, no publicar'}`;
  $('empezar').addEventListener('click', () => { if(volverSala){dispatchEvent(new Event('gh3-volver-sala'));return;}void cargarAudio(); });
  addEventListener('keydown', (e) => tecla(e, 'keydown'));
  addEventListener('keyup', (e) => tecla(e, 'keyup'));
  addEventListener('blur', () => soltar(performance.now()));
  const gpActual = () => primerMando();
  $('perfil').addEventListener('change', (e) => { mando.cambiarPerfil((e.target                     ).value          ); mostrarMando(gpActual()); });
  $('aprEje').addEventListener('click', () => { const g = gpActual(); if (g) mando.aprenderEje(g); mostrarMando(g); });
  $('aprBot').addEventListener('click', () => { const g = gpActual(); if (g) mando.aprenderBotones(g); mostrarMando(g); });
  $('restab').addEventListener('click', () => { mando.restablecer(); mando.aviso = 'Mapeo de fábrica'; mostrarMando(gpActual()); });
  mostrarCalib();
  mostrarModo();
  dibujarHud(true);
  if (params.get('video') !== 'none') void cargarFondo();
  else { $('fondo').hidden = true; $('fondoInfo').textContent = 'Esta canción no tiene concierto grabado disponible.'; }
  if(disposed)return;
  raf=requestAnimationFrame(cuadro);
  juicioTimer=setInterval(pulsoJuicio, 15);
  void cargarAudio();
}

let cargandoAudio = false, esperandoSala = false, volverSala = false;
async function cargarAudio()                {
  if (cargandoAudio || jugando) return;
  cargandoAudio = true; esperandoSala = false; volverSala = false;
  ($('empezar')                     ).disabled = true;
  try {
  const hz = cancion.audio.hz, esp = esperadoDe(cancion);
  let prepared                          ;
  let sharedClock                                                                                         ;
  try { const entry=(parent                                                                                                                                          ).__gh3SongAudio;
    if(entry?.token===params.get('session')&&entry.ctx.state!=='closed'){prepared=entry.ctx;sharedClock=entry;}
  } catch {}
  ctx = prepared ?? new AudioContext({ sampleRate: hz, latencyHint: 'interactive' });
  const resume=ctx.resume();
  if(ctx.state==='suspended'){
    estado('Tocá una tecla o hacé clic para habilitar el audio.');
    const unlock=()=>{if(ctx?.state==='suspended')void ctx.resume();};
    addEventListener('keydown',unlock,{once:true});addEventListener('pointerdown',unlock,{once:true});
  }
  await resume;
  const avisos           = [];
  if (ctx.sampleRate !== hz) avisos.push(`El navegador usa ${ctx.sampleRate} Hz: sincronía no garantizada`);
  const buffers = {}                                       ;
  for (const p of PISTAS) {
    const rel = cancion.audio.pistas[p];
    if (!rel) continue;
    estado(`Cargando pista ${p}...`);
    let b             ;
    try {
      const r = await fetch(paq.resolver(rel),{signal:loadAbort.signal});
      if (!r.ok) throw Error(`No se pudo cargar ${p} (${r.status})`);
      b = await ctx.decodeAudioData(await r.arrayBuffer());
    } catch (e) { throw Error(`No se pudo leer la pista ${p} (${rel}): ${(e         ).message}`); }
    if (esp) avisos.push(...verificarBuffer(p, b, esp));
    buffers[p] = b;
  }
  const erroresSincronia = verificarSincronia(buffers);
  if (erroresSincronia.length) throw Error(erroresSincronia.join(' | '));
  mezcla = new Mezcla(ctx                                                      , buffers, cancion.audio.mezcla);
  try {
    // El efecto va solo en la pista de guitarra; si el navegador no lo admite, se juega igual sin cambio de tono.
    await ctx.audioWorklet.addModule(new URL('js/vibrato-worklet.js',location.href).href);
    nodoVibrato = new AudioWorkletNode(ctx, 'vibrato-gh3', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    mezcla.conectarEfectoGuitarra(nodoVibrato);
  } catch (e) { nodoVibrato = null; mando.aviso = 'Vibrato sin sonido en este navegador: ' + (e         ).message; }
  const timeSource=sharedClock?enOrigen(ctx,sharedClock.origin-performance.timeOrigin,sharedClock.timestamp):ctx;
  reloj = new Reloj(timeSource, leerNum('offset', cancion.offsetMs), guardado());
  const n = mezcla.presentes.length, largo = buffers[mezcla.presentes[0]] .length.toLocaleString('es-AR');
  $('verif').textContent = avisos.length ? 'Audio: ' + avisos.join(' | ')
    : esp ? `Audio verificado: ${n} pistas, ${largo} muestras, silencios intactos` : `Audio: ${n} pistas sincronizadas, ${largo} muestras`;
  $('verif').className = avisos.length ? 'mal' : 'bien';
  if(onlineMode){esperandoSala=true;estado('Esperando al rival…');onlineStart=await parent.__gh3Online.listo(params.get('session'),loadAbort.signal);}
  if(disposed||loadAbort.signal.aborted)return;
  $('inicio').hidden = true;
  arrancar();
  } catch (e) {
    mezcla?.detener();
    try { await ctx?.close(); } catch {}
    ctx = null; mezcla = null; reloj = null;
    if(disposed||loadAbort.signal.aborted)return;
    const fallo=errorCarga(e,esperandoSala);volverSala=fallo.volver;
    estado(fallo.texto,true);$('empezar').textContent=fallo.boton;
    ($('empezar')                     ).disabled = false;
    $('empezar').hidden = false;
  } finally { cargandoAudio = false; }
}

function arrancar()       {
  newRun06();
  if (!ctx || !mezcla || !reloj) return;
  const t0 = onlineMode ? audioStart(ctx.currentTime,onlineStart.goEpoch,onlineStart.offset) : ctx.currentTime + 0.6;
  juicio = new Juicio(chart,dificultadActual);
  perdidaVista = false;
  batalla?.quitar(); batalla = datosBatalla ? new Batalla(chart, dificultadActual, datosBatalla, juicio) : null;
  juicio.sinRasgueo = sinRasgueo;
  entrada.abajo = 0;
  cola.length = 0;
  if (coopMode) { juicio2 = new Juicio(chart, dificultadActual); juicio2.sinRasgueo = true; entrada2.abajo = 0; cola2.length = 0; reaccion2.visto = 0; }
  const desde=new URLSearchParams(location.search).get('desafio')==='inaugural'?12:0;
  reloj.iniciar(t0-desde);
  mezcla.arrancar(t0-desde,desde);
  if(desde){const ms=desde*1000-reloj.offsetChartMs-reloj.calibJugadorMs,n=chart.notas;let k=n.findIndex(x=>x.t>=ms);if(k<0)k=n.length;for(let i=0;i<k;i++)juicio.estado[i]=3;juicio.siguiente=juicio.abreHopo=juicio.abreRasgueo=k;juicio.tHorizonte=ms;window.__rlInfo=()=>({t:reloj.songDePerf(performance.now()),total:chart.audioMs});window.__rlCarteles?.((k<n.length?n[k].t-ms:4000)+600);}
  window.__rlTiempo=()=>({t:reloj.songDePerf(performance.now()),total:chart.audioMs}); // Claude 04/11: reloj para el escenario 3D en todas las canciones
  reaccion.visto = 0;
  vibrato.reiniciar(); ponerTono(1);
  $('resultado').textContent = '';
  ultimoVisual = -Infinity;
  jugando = true; pausado = false; terminado = false;
  $('pausa').hidden = true; $('fin').hidden = true;
  estado('');
  dibujarHud(true);
}

function soltar(perf        )       {
  if (!reloj) { entrada.abajo = 0; mando.soltarTodo(0); return; }
  const t = reloj.songDePerf(perf);
  for (const ev of entrada.soltarTodo(t)) cola.push(ev);
  for (const ev of entrada2.soltarTodo(t)) cola2.push(ev);
  for (const ev of mando.soltarTodo(t)) cola.push(ev);
}

function primerMando()                   {
  const lista = window.__gh3MappedPads?.() ?? (typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []);
  for (const g of lista) if (g && g.connected) return g;
  return null;
}

/** Lee el mando: los botones dan los mismos eventos que el teclado; el eje elegido da la posición del vibrato. */
function leerMando()       {
  const gp = primerMando();
  if (gp) {
    const ahora = performance.now();
    const ts = gp.timestamp && gp.timestamp <= ahora && ahora - gp.timestamp < 50 ? gp.timestamp : ahora;
    const enJuego = jugando && !pausado && !!reloj;
    const r = mando.leer(gp, enJuego ? reloj .songDePerf(ts) : 0);
    // R3 es una adaptación explícita al mando estándar del navegador. Tilt nativo pendiente.
    // Claude 07/11: como check_for_star_power_CFunc (82112898) del original, con mando común (no guitarra) también activa
    // cualquier flecha de la cruceta (acciones up/down/left/right). Botones 12-15 ya mapeados por controles-core.
    // Solo se mira cuando hay energía para activar (>= 50) y fuera de batallas, para no adelantar el juicio en cada rasgueo.
    const cc=juicio?.concierto,listo=!batalla&&!!cc&&!cc.activo&&cc.energia>=50;
    const flecha=listo&&mando.mapeo?.perfil!=='guitarra'&&[12,13,14,15].some(i=>gp.buttons[i]?.pressed);
    const sp=!!gp.buttons[10]?.pressed||flecha;
    if(sp&&!starPrevio&&enJuego)usarPoder(reloj .songDePerf(ts));
    starPrevio=sp;
    if (r.pausa) alternarPausa(ahora);
    if (r.modo) cambiarModo();
    if (enJuego) for (const ev of r.eventos) if (!(sinRasgueo && ev.tipo === 'rasgueo')) cola.push(ev);
  }
  if (mando2) {
    const lista = window.__gh3MappedPads?.() ?? (typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []);
    const gp2 = [...lista].filter(g => g && g.connected)[1];
    if (gp2) {
      const ahora2 = performance.now(), juega2 = jugando && !pausado && !!reloj;
      const r2 = mando2.leer(gp2, juega2 ? reloj.songDePerf(ahora2) : 0);
      if (r2.pausa) alternarPausa(ahora2);
      if (juega2) for (const ev of r2.eventos) if (ev.tipo !== 'rasgueo') cola2.push(ev);
    }
  }
  mostrarMando(gp);
}

function ponerTono(tono        )       {
  if (!nodoVibrato || !ctx || Math.abs(tono - tonoPuesto) < 1e-4) return;
  tonoPuesto = tono;
  const p = nodoVibrato.parameters.get('tono') ;
  p.cancelScheduledValues(ctx.currentTime);
  p.setTargetAtTime(tono, ctx.currentTime, 0.01);
}

function mostrarMando(gp                  )       {
  const m = mando.mapeo;
  const nombre = gp ? gp.id.replace(/\s*\(.*\)\s*$/, '').slice(0, 40) : '';
  const txt = gp
    ? `Mando: ${nombre} (${m.perfil === 'guitarra' ? 'guitarra' : 'joystick'}, vibrato eje ${m.ejeVibrato}${gp.mapping === 'standard' ? '' : ', mapeo no estándar'})${vibrato.activo ? ' · VIBRATO' : ''}`
    : 'Mando: ninguno (apretá un botón del mando para que lo vea el navegador)';
  const aviso = mando.aviso;
  if (txt + aviso === textoMando) return;
  textoMando = txt + aviso;
  $('mando').textContent = txt;
  $('mandoAviso').textContent = aviso;
  ($('perfil')                     ).value = m.perfil;
}

function tecla(e               , tipo                     )       {
  if (coopMode && !coopRemoto && P2_TECLAS[e.code]) {
    e.preventDefault();
    if (!jugando || pausado || !reloj) { if (tipo === 'keyup') entrada2.traducir(tipo, P2_TECLAS[e.code], e.repeat, 0); return; }
    const ev2 = entrada2.traducir(tipo, P2_TECLAS[e.code], e.repeat, reloj.songDePerf(e.timeStamp));
    if (ev2) { cola2.push(ev2); pulsoJuicio(); }
    return;
  }
  // Claude 05/11: teclas elegidas por el jugador -> teclas canónicas del motor. Los táctiles ya llegan canónicos (gh3Canon).
  const code = e.gh3Canon ? e.code : entrada.canon(e.code);
  if (entrada.esTeclaJuego(code) || code === 'Space') e.preventDefault();
  if (tipo === 'keydown' && !e.repeat) {
    if(code==='Space'&&jugando&&!pausado&&reloj){usarPoder(reloj.songDePerf(e.timeStamp));return;}
    if (e.code === 'Escape') { alternarPausa(e.timeStamp); return; }
  }
  if (code !== e.code) { teclaJuego(e, tipo, code); return; } // una tecla asignada a una acción no dispara atajos
  if (tipo === 'keydown' && !e.repeat) {
    if (e.code === 'KeyP') { alternarPausa(e.timeStamp); return; }
    if (e.code === 'KeyR' && jugando && !onlineMode) { if (pausado) void ctx .resume(); arrancar(); return; }
    if (e.code === 'Comma' || e.code === 'Period') { cambiarCalib(e.code === 'Comma' ? -5 : 5); return; }
    if (e.code === 'BracketLeft' || e.code === 'BracketRight') { cambiarOffset(e.code === 'BracketLeft' ? -1 : 1); return; }
    if (e.code === 'KeyT') { cambiarModo(); return; }
    if (e.code === 'Minus' || e.code === 'Equal') { fondo.sincro.ofsMs += e.code === 'Minus' ? -10 : 10; $('fondoInfo').textContent = `Ajuste del concierto: ${fondo.sincro.ofsMs} ms`; return; }
  }
  teclaJuego(e, tipo, code);
}

function teclaJuego(e               , tipo                     , code        )       {
  if (!code) return;
  if (sinRasgueo && TECLAS_RASGUEO.has(code)) return; // sin rasgueo, Enter y flechas no hacen nada (ni castigan)
  if (!jugando || pausado || !reloj) {
    if (tipo === 'keyup') entrada.traducir(tipo, code, e.repeat, 0);
    return;
  }
  const ev = entrada.traducir(tipo, code, e.repeat, reloj.songDePerf(e.timeStamp));
  if (ev) { cola.push(ev); pulsoJuicio(); } // se juzga en el momento, no en el próximo cuadro
}

function alternarPausa(perf        )       {
  // Claude 05/11: en online se puede pausar (solo te pausa a vos) para poder salir.
  if (!jugando || terminado || !ctx || !reloj) return;
  // Claude 08/11: en coop online la pausa es de los dos (sale el menú en las dos pantallas).
  if (coopRemoto && !pausaRemota) try { parent.__gh3Online?.pausa?.(!pausado); } catch {}
  if (!pausado) {
    soltar(perf);
    entregar();
    vibrato.reiniciar(); ponerTono(1);
    reloj.pausar(perf);
    pausado = true;
    emit06('paused');
    void ctx.suspend();
    $('pausa').hidden = false; batalla?.ocultar(true);
  } else {
    $('pausa').hidden = true; batalla?.ocultar(false);
    void ctx.resume().then(() => { reloj .reanudar(); pausado = false; emit06(metricsStarted06||reloj.songDePerf(performance.now())>=0?'playing':'loading'); });
  }
}

function cambiarModo()       {
  sinRasgueo = !sinRasgueo;
  try { localStorage.setItem('motor041.modo', sinRasgueo ? 'simplificado' : 'gh3'); } catch {}
  if (juicio) juicio.sinRasgueo = sinRasgueo;
  mostrarModo();
}

function mostrarModo()       {
  $('modo').textContent = sinRasgueo ? 'MODO SIMPLIFICADO (sin rasgueo, no es GH3)' : 'MODO GH3 AUTÉNTICO (traste + rasgueo, HOPO)';
}

function cambiarCalib(d        )       {
  if (!reloj) { const v = guardado() + d; guardar(v); mostrarCalib(v); return; }
  reloj.calibJugadorMs += d;
  guardar(reloj.calibJugadorMs);
  mostrarCalib();
}

function cambiarOffset(d        )       {
  if (!reloj) return;
  reloj.offsetChartMs += d;
  mostrarCalib();
}

function mostrarCalib(v         )       {
  const base = cancion ? cancion.offsetMs : 0, off = reloj ? reloj.offsetChartMs : leerNum('offset', base);
  const cal = v ?? (reloj ? reloj.calibJugadorMs : guardado());
  $('calib').textContent = `Offset chart/audio: ${off} ms (medido ${base})  |  Calibración del jugador: ${cal} ms`;
}

function entregar()       {
  if (!juicio || !cola.length) return;
  cola.sort((a, b) => a.t - b.t);
  if (coopRemoto) for (const ev of cola) pendRem.push({t:ev.t,tipo:ev.tipo,carril:ev.carril});
  for (const ev of cola) juicio.procesar(ev);
  cola.length = 0;
}
function entregar2()       {
  if (!juicio2 || !cola2.length) return;
  cola2.sort((a, b) => a.t - b.t);
  for (const ev of cola2) juicio2.procesar(ev);
  cola2.length = 0;
}

/**
 * Juicio fuera del dibujo: se llama en cada tecla, con un temporizador propio y también desde el cuadro.
 * Si la pestaña no dibuja (oculta, minimizada, GPU trabada), el juicio, la guitarra y los puntos siguen igual.
 */
function pulsoJuicio()       {
  if (!jugando || !reloj || !juicio) return;
  leerMando();
  entregar();
  entregar2();
  const song = reloj.songDePerf(performance.now());
  if(!pausado&&!terminado&&song>=0&&!metricsStarted06)emit06('playing');
  if (!pausado) juicio.avanzar(song - REGLAS_PROPIAS.margenHorizonteMs);
  if (coopRemoto && (pendRem.length || performance.now() - ultimoEnvio > 60)) { ultimoEnvio = performance.now(); try { parent.__gh3Online?.juego({ song, ev: pendRem.splice(0, 32) }); } catch {} }
  if (juicio2 && !pausado && (!coopRemoto || remSong !== null)) {
    juicio2.avanzar((coopRemoto ? Math.min(song, remSong) : song) - REGLAS_PROPIAS.margenHorizonteMs);
    juicio2.whammy(juicio2.tHorizonte, false);
    const t2 = reaccion2.aplicar(juicio2, { guitarra: () => {}, errorNota: () => dispatchEvent(new Event('gh3-wrong-note')) });
    if (t2 !== null) juz[1] = t2;
  }
  if (batalla && !terminado && !pausado) {
    batalla.mover(Math.max(mando.vibrato, entrada.posWhammy));
    batalla.actualizar(song);
    if (batalla.resultado === 'victoria') { terminar(); return; }
    if (batalla.resultado === 'derrota' && juicio.concierto.salud) { juicio.concierto.salud.failed = true; peliculaPerdida(); }
  }
  if(!terminado&&!onlineMode&&(juicio.concierto.fallida||juicio2?.concierto.fallida)){
    terminado=true;jugando=false;pausado=true;
    emit06('failed','failed');
    mezcla?.detener();void ctx?.suspend().catch(()=>{});reloj.pausar(performance.now());
    $('pausa').hidden=false;batalla?.ocultar(true);return;
  }
  // Vibrato solo con una nota larga acertada, sostenida y con la guitarra sonando. No toca el juicio.
  vibrato.actualizar(song, Math.max(mando.vibrato, entrada.posWhammy), !pausado && juicio.sostenida >= 0 && juicio.guitarraSuena);
  if(!pausado)juicio.whammy(juicio.tHorizonte,vibrato.activo);
  ponerTono(vibrato.tono);
  // Audio y texto salen del mismo registro de resultados que dibuja la autopista.
  const txt = reaccion.aplicar(juicio, {guitarra:v=>mezcla .guitarra(v),errorNota:()=>dispatchEvent(new Event('gh3-wrong-note'))});
  if (txt !== null) {
    juz[0] = txt;
    const el = $('resultado');
    el.textContent = txt;
    el.className = juicio.resTipo[(juicio.nResultados - 1) % CAP_RESULTADOS] === R_ACIERTO ? 'bien' : 'mal';
  }
  if (!terminado && juicio.terminada() && (!juicio2 || juicio2.terminada()) && song >= chart.audioMs) terminar();
  dibujarHud(false);
  dibujarCoop();
}

function cuadro()       {
  if(disposed)return;
  raf=requestAnimationFrame(cuadro);
  let song = -2000;
  if (jugando && reloj && juicio) {
    pulsoJuicio();
    song = reloj.songDePerf(performance.now());
    if (song < ultimoVisual) song = ultimoVisual; // la imagen nunca retrocede; el juicio no usa este valor
    ultimoVisual = song;
  } else leerMando(); // fuera de la canción: para ver el mando y aprender el mapeo
  // El fondo usa el tiempo de canción sin el "nunca retrocede" de la imagen: así una pausa o un reinicio lo reubican.
  if (fondoListo) fondo.actualizar(jugando && reloj ? reloj.songDePerf(performance.now()) : -2000, jugando && !pausado && !!reloj,
    (p) => reloj ? reloj.songDePerf(p) : -2000);
  vista.dibujar(chart, juicio ?? VACIA, song);
  vista2?.dibujar(chart, juicio2 ?? VACIA, song);
}

function terminar()       {
  emit06('finished','completed');
  terminado = true;
  const r = juicio .resumen();
  $('fin').hidden = false;
  if (juicio2) { const r2 = juicio2.resumen(); $('finTexto').textContent = `Jugador 1: ${r.puntos} puntos, racha máxima ${r.rachaMax}  ·  Jugador 2: ${r2.puntos} puntos, racha máxima ${r2.rachaMax}  ·  Total ${r.puntos + r2.puntos}`; return; }
  $('finTexto').textContent = `Puntos ${r.puntos}  ·  Aciertos ${r.aciertos}/${chart.notas.length} (HOPO ${r.aciertosHopo})  ·  Precisión ${(r.precision * 100).toFixed(1)} %  ·  Racha máxima ${r.rachaMax}  ·  Rasgueos errados ${r.errados}  ·  Desvío medio ${r.desvioMedioMs.toFixed(1)} ms`;
}

function dibujarHud(forzar         )       {
  if(params.get('hud')==='original')return;
  const r = juicio ? juicio.resumen() : null;
  const puntos = r ? r.puntos : 0, racha = r ? r.racha : 0, mult = r ? r.mult : 1, prec = r ? Math.round(r.precision * 1000) : 1000;
  const desvio = r ? Math.round(r.desvioMedioMs) : 0;
  if (forzar || puntos !== hud.puntos) { hud.puntos = puntos; $('puntos').textContent = String(puntos); }
  if (forzar || racha !== hud.racha) { hud.racha = racha; $('racha').textContent = String(racha); }
  if (forzar || mult !== hud.mult) { hud.mult = mult; $('mult').textContent = 'x' + mult; }
  if (forzar || prec !== hud.prec) { hud.prec = prec; $('prec').textContent = (prec / 10).toFixed(1) + ' %'; }
  if (forzar || desvio !== hud.desvio) { hud.desvio = desvio; $('desvio').textContent = (desvio > 0 ? '+' : '') + desvio + ' ms'; }
}

function estado(txt        , error = false)       {
  if(error)emit06('failed','unknown',txt);
  const el = $('estado');
  el.textContent = txt;
  el.className = error ? 'mal' : '';
  const loading=document.getElementById('cargaEstado');if(loading)loading.textContent=error?txt:txt.startsWith('Esperando')?txt:txt.startsWith('Tocá')?txt:txt.startsWith('Cargando pista')?'Cargando audio…':'Cargando canción…';
}

// Solo lectura, para diagnóstico desde la consola o pruebas del panel.
(globalThis                                   ).__motor = {
  dispose,
  pausar: () => {if(!pausado)alternarPausa(performance.now());},
  reanudar: () => {if(pausado)alternarPausa(performance.now());},
  pausaRemota: (on) => {if(!!on===pausado)return;pausaRemota=true;try{alternarPausa(performance.now());}finally{pausaRemota=false;}},
  reiniciar: () => {if(onlineMode){try{parent.__gh3Online?.reiniciar?.();}catch{}return;}void ctx?.resume().then(()=>arrancar());},
  modo: (modo        ) => {if(sinRasgueo!==(modo!=='gh3'))cambiarModo();},
  modoActual: () => sinRasgueo?'simplificado':'gh3',
  fondo: () => fondo, pausado: () => pausado, jugando: () => jugando,
  fallida: () => juicio?.concierto.fallida??false,
  batalla: () => batalla,
  teclas: () => { entrada.teclasW = teclasWhammy(); entrada.recargarTeclas(); },
  mando: () => mando, vibrato: () => vibrato, nodoVibrato: () => nodoVibrato,
  juicio: () => juicio, juicio2: () => juicio2, reloj: () => reloj, chart: () => chart, paquete: () => paq, cancion: () => cancion, cola: () => cola.length, mezcla: () => mezcla, escena: () => vista?.escena, vista: () => vista,
};

const trucosMotor=opcionesPartida({online:onlineMode});
if(trucosMotor.performance){const css=document.createElement('style');css.textContent='#pista,#pista2,#gh3Equipo{visibility:hidden!important} #gh3Hud,#gh3SpListo,#gh3HudDos{visibility:hidden!important}';document.head.append(css);}

// Passive telemetry: no inputs, scoring, timing or audio controls are changed.
let metricsRun06='', metricsStarted06=false, metricsEnded06=false, metricsStage06='';
try{metricsRun06=crypto.randomUUID();}catch{}
function emit06(stage, outcome, error){
  try{
    if(stage===metricsStage06&&!error)return;
    metricsStage06=stage;
    if(stage==='playing')metricsStarted06=true;
    if(stage==='finished'||stage==='failed')metricsEnded06=true;
    top.postMessage({type:'gh3-telemetry-06',stage,outcome,error,song:params.get('cancion'),run_id:metricsRun06,token:params.get('session')},location.origin);
  }catch{} // Telemetry must never interrupt the engine.
}
function newRun06(){
  try{if(metricsStarted06&&!metricsEnded06)emit06('finished','retry');metricsRun06=crypto.randomUUID();metricsStarted06=metricsEnded06=false;metricsStage06='';emit06('loading');}catch{}
}

emit06('loading');
void iniciar();

