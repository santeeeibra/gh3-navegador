import {OriginalHUD} from './hud.mjs';
import {HudDos} from './hud-dos.mjs';
import {StarPowerListo} from './sp-listo.mjs';
import {MenuScenes,captureWhammy,capturingWhammy} from './menu-scenes.mjs';
import {Renderer} from '../renderer.mjs';
import {Resources} from '../resources.mjs';
import {HubAudio} from '../hub-audio.mjs';
import {loadState,saveState} from '../state.mjs';
import {createSessionEnd} from './session-end.mjs';
const origin=location.origin,params=new URLSearchParams(location.search),token=params.get('session');
const settings=loadState(),audio=new HubAudio(settings,{music:false});
audio.audioPaths=Object.fromEntries([...Array.from({length:6},(_,i)=>'bad_note'+(i+1)),'Crowd_Fail_Song','GH3_Sudden_Death'].map(n=>[n,'/gh3/juego/recovered/in-game/'+n+'.wav']));
addEventListener('gh3-wrong-note',()=>{void audio.unlock().then(()=>audio.play('Single_Player_Bad_Note_Guitar'));});
let failedAudio=false;
let sent=false,mixApplied=null,page='pause',selected=0,menuOpen=false,renderVersion=0,previous=new Set(),lastJudgment=null,lastSP={frases:0,energia:0,activo:false};
let drawing=false,redraw=false,uiError=false;
const style=document.createElement('style');style.textContent=`
.prov,#paquete,.elegir,.hud,.controles,.pie,#resultado,#pausa{display:none!important}
#inicio .caja>p,#inicio .mando{display:none}#inicio .caja{border-radius:0}
#hubExit{position:fixed;top:12px;left:16px;z-index:40;border-radius:0;padding:6px 12px;font-size:13px;background:#21180ecc;color:#f4dab1}
#gh3Hud{position:fixed;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none}
#originalPause{position:fixed;left:50%;top:50%;width:1280px;height:720px;transform:translate(-50%,-50%) scale(var(--scale));z-index:30}
#originalPause canvas,#originalPause .hits{position:absolute;inset:0;width:100%;height:100%}
#originalPause .hit{position:absolute;border:0;background:transparent;color:transparent;padding:0;cursor:pointer}
#originalPause .hit:focus-visible{outline:2px solid #fff2bc}#lettering{pointer-events:none}
`;document.head.append(style);
const hudCanvas=document.createElement('canvas');hudCanvas.id='gh3Hud';hudCanvas.width=1280;hudCanvas.height=720;hudCanvas.setAttribute('role','img');document.body.append(hudCanvas);
const layer=document.createElement('div');layer.id='originalPause';layer.hidden=true;
layer.innerHTML='<canvas id="scene" width="1280" height="720"></canvas><canvas id="pauseBunny" width="1280" height="720" style="pointer-events:none"></canvas><canvas id="lettering" width="1280" height="720"></canvas><div class="hits" role="menu" aria-label="Pausa"></div>';
document.body.append(layer);const hits=layer.querySelector('.hits');
function resize(){layer.style.setProperty('--scale',Math.min(innerWidth/1280,innerHeight/720));}addEventListener('resize',resize);resize();
const exit=document.createElement('button');exit.id='hubExit';exit.textContent='Volver al Setlist';document.body.append(exit);
const hud=new OriginalHUD(hudCanvas),resources=new Resources();
// Claude 05/11: en coop, un HUD original por jugador al costado de cada autopista (gameplay/hud-dos.mjs).
const coop=params.has('coop'),coopOnline=coop&&params.has('online'),ladoDer=params.get('lado')==='2';
let hudDos=null,hudDosCanvas=null;
if(coop){hudDosCanvas=document.createElement('canvas');hudDosCanvas.id='gh3HudDos';hudDosCanvas.width=1280;hudDosCanvas.height=720;hudDosCanvas.setAttribute('role','img');hudDosCanvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4';const aspecto=()=>{hudDosCanvas.width=Math.max(720,Math.round(720*innerWidth/Math.max(1,innerHeight)));};aspecto();addEventListener('resize',aspecto);hudDosCanvas.hidden=true;document.body.append(hudDosCanvas);
 const h=new HudDos(hudDosCanvas);h.init().then(()=>{hudDos=h;window.__gh3HudDos=true;}).catch(console.error);}
const nombresDos=()=>{let n={};try{n=window.__gh3Nombres||parent.__gh3NombresOnline?.()||{};}catch{}return coopOnline?[n.yo||'VOS',n.compa||'COMPAÑERO']:['JUGADOR 1','JUGADOR 2'];};let view,scenes,entries=[];
// Claude 08/11: en coop el puntaje y el rockómetro son de la banda (suma y promedio, como el coop del GH3); racha, multiplicador y Star Power siguen siendo de cada uno.
const compartir=(a,b)=>{if(!a||!b)return [a,b];const ra=a.resumen(),rb=b.resumen(),pts=(ra?.puntos|0)+(rb?.puntos|0),ka=a.concierto?.rock,kb=b.concierto?.rock,rock=ka==null||kb==null?(ka??kb??null):(ka+kb)/2,w=(j,r)=>({resumen:()=>({...r,puntos:pts}),concierto:{...j.concierto,rock}});return [w(a,ra),w(b,rb)];};
let spListo=null; // Claude 05/11: cartel Star Power Ready del original
const ready=Promise.all([hud.init(),resources.init()]).then(async()=>{StarPowerListo.cargar().then(x=>{if(sent){x.ocultar();return;}spListo=x;}).catch(console.error);view=new Renderer(layer.querySelector('#scene'),resources);view.bunnyCanvas=layer.querySelector('#pauseBunny');await view.init();scenes=new MenuScenes(view);});
ready.catch(e=>{uiError=true;exit.textContent='Error de interfaz · Volver al Setlist';console.error(e);});
void ready.then(async()=>{await audio.unlock();if(!sent)await Promise.all(Object.keys(audio.audioPaths).map(n=>audio.buffer(n)));}).catch(console.error);
const finish=createSessionEnd({motor:()=>window.__motor,video:document.getElementById('fondo'),cleanup:()=>{sent=true;spListo?.ocultar();clearInterval(timer);observer.disconnect();void audio.dispose();},photograph:()=>{
 try{const v=document.getElementById('fondo');if(v.readyState<2||!v.videoWidth)return null;const c=document.createElement('canvas');c.width=c.height=512;const size=Math.min(v.videoWidth,v.videoHeight);c.getContext('2d').drawImage(v,(v.videoWidth-size)/2,(v.videoHeight-size)/2,size,size,0,0,512,512);return c.toDataURL('image/jpeg',.8);}catch{return null;}
},deliver:data=>parent.postMessage({type:'gh3-result',token,...data},origin)});
exit.onclick=()=>finish(false,true);
addEventListener('gh3-volver-sala',()=>finish(false,true));
function applySettings(){
 const mix=window.__motor?.mezcla();if(!mix)return;
 mixApplied??={mix,master:mix.maestra.gain.value,tracks:Object.fromEntries(Object.entries(mix.pista).map(([k,n])=>[k,n.gain.value]))};
 mix.maestra.gain.value=mixApplied.master*settings.volume;
 for(const [k,n]of Object.entries(mix.pista))n.gain.value=mixApplied.tracks[k]*(k==='guitar'?settings.guitarVolume:settings.bandVolume);
}
async function render(){if(drawing){redraw=true;return;}drawing=true;try{do{redraw=false;await drawPause();}while(redraw&&menuOpen);}finally{drawing=false;}}
async function drawPause(){
 const version=++renderVersion;await ready;if(version!==renderVersion||!menuOpen)return;view.clear();
 hits.setAttribute('aria-label',page==='failed'?'Song Failed':'Pausa');
 entries=['pause','confirm','quit','failed'].includes(page)?await scenes.pause(selected,page,settings):await scenes.options(page,selected,settings,true);
 if(version!==renderVersion)return;hits.replaceChildren();
 entries.forEach((e,i)=>{const b=document.createElement('button');b.className='hit';b.textContent=e.label;b.setAttribute('role','menuitem');b.setAttribute('aria-current',String(i===selected));b.style.cssText=`left:${e.x}px;top:${e.y}px;width:${e.w}px;height:${e.h}px`;b.onclick=()=>{selected=i;choose();};hits.append(b);});
 if(!['pause','confirm','quit','sound'].includes(page))await view.footer();
}
function choose(delta=1){
 void audio.play('ui_sfx_select');
 if(page==='failed'){if(selected===0)window.__motor?.reiniciar();else finish(false,true);return;}
 if(page==='pause'){
  if(selected===0){window.__motor?.reanudar();return;}
  page=['pause','confirm','options','quit'][selected];selected=page==='confirm'||page==='quit'?1:0;
 }else if(page==='confirm'||page==='quit'){
  if(selected===0){if(page==='quit'){finish(false,true);return;}window.__motor?.reiniciar();return;}page='pause';selected=0;
 }else if(page==='options'){
  if(selected<2){page=selected===0?'sound':'controller';selected=0;}
  else {page='pause';selected=0;}
 }else if(page==='sound'&&selected<4){const k=['bandVolume','guitarVolume','effectsVolume','volume'][selected];settings[k]=Math.max(0,Math.min(1,Math.round((settings[k]+delta*.1)*10)/10));persist();}
 else if(page==='controller'&&selected===0){settings.mode=settings.mode==='gh3'?'simplificado':'gh3';persist();}
 else if(page==='controller'&&selected===1){captureWhammy(()=>{window.__motor?.teclas?.();void render();});void render();}
 else {page='options';selected=0;}
 void render();
}
// Claude 05/11: el volumen del panel (otro documento) llega en vivo por el evento storage; applySettings lo aplica.
addEventListener('storage',()=>{const v=loadState().volume;if(Number.isFinite(v)&&v!==settings.volume){settings.volume=v;applySettings();}});
function persist(){saveState(settings);applySettings();window.__motor?.modo(settings.mode);parent.postMessage({type:'gh3-settings',token},origin);}
function back(){void audio.play('Generic_Menu_Back_SFX');if(page==='failed'){finish(false,true);return;}if(page==='pause'){window.__motor?.reanudar();return;}page=['sound','controller'].includes(page)?'options':'pause';selected=0;void render();}
function move(d){if(!entries.length)return;selected=(selected+d+entries.length)%entries.length;void audio.play('ui_sfx_scroll');void render();}
addEventListener('keydown',e=>{
 void audio.unlock();if(!menuOpen)return;
 if(page==='failed'&&e.code==='KeyR'){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)window.__motor?.reiniciar();return;}
 const actions={ArrowUp:()=>move(-1),ArrowDown:()=>move(1),ArrowLeft:()=>choose(-1),ArrowRight:()=>choose(1),Enter:()=>choose(),Escape:back,KeyP:back};
 const fn=actions[e.code];if(fn){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)fn();}else if(e.code==='KeyR'){e.preventDefault();e.stopImmediatePropagation();}
},{capture:true});
addEventListener('pointerdown',()=>{void audio.unlock();},{capture:true});
function syncMenu(){
 if(!document.getElementById('fin').hidden){finish(true);return;}
 const paused=!!window.__motor?.pausado();if(paused===menuOpen)return;menuOpen=paused;if(paused)spListo?.ocultar();layer.hidden=!paused;exit.hidden=paused;
 const failed=window.__motor?.fallida?.();
 if(failed&&!failedAudio){failedAudio=true;const attempt=window.__motor?.juicio();void(async()=>{await audio.pause();if(sent||!window.__motor?.fallida?.()||window.__motor?.juicio()!==attempt)return;await audio.resume();if(sent||!window.__motor?.fallida?.()||window.__motor?.juicio()!==attempt)return;await Promise.all([audio.play('Crowd_Fail_Song_SFX'),audio.play('GH_SFX_You_Lose_Single_Player')]);})().catch(console.error);}
 if(!failed&&failedAudio){failedAudio=false;void audio.pause().then(()=>audio.resume());}
 else if(!paused)void audio.resume();
 if(paused&&!failed)void audio.pause();
 if(paused){settings.mode=window.__motor?.modoActual?.()||settings.mode;page=window.__motor?.fallida?.()?'failed':'pause';selected=0;previous=new Set();void render();}else {++renderVersion;scenes?.leavePause();hits.replaceChildren();}
}
const observer=new MutationObserver(syncMenu);
observer.observe(document.getElementById('fin'),{attributes:true,attributeFilter:['hidden']});
observer.observe(document.getElementById('pausa'),{attributes:true,attributeFilter:['hidden']});
const timer=setInterval(()=>{
 if(sent)return;const m=window.__motor;if(!m)return;syncMenu();applySettings();const j=m.juicio();hud.draw(j);hudCanvas.hidden=!m.jugando();if(hudDos){const [n1,n2]=nombresDos(),[c1,c2]=compartir(j,m.juicio2?.()),p1={j:c1,nombre:n1},p2={j:c2,nombre:n2};hudDos.draw(ladoDer?p2:p1,ladoDer?p1:p2);hudDosCanvas.hidden=!m.jugando();}exit.hidden=!uiError&&(menuOpen||m.jugando());
 if(j!==lastJudgment){lastJudgment=j;lastSP={frases:0,energia:0,activo:false};}
 if(j?.concierto&&!menuOpen){const s=j.concierto;if(s.frases>lastSP.frases)void audio.play('Star_Power_Awarded_SFX');if(s.energia>=50&&lastSP.energia<50&&!s.activo){void audio.play('Star_Power_Ready_SFX');if(!hudDos)spListo?.mostrar();}if(s.activo&&!lastSP.activo)void audio.play('Star_Power_Deployed_SFX');lastSP={frases:s.frases,energia:s.energia,activo:s.activo};}
 if(menuOpen){const gp=Array.from(window.__gh3MappedPads?.()||navigator.getGamepads?.()||[]).find(g=>g?.connected);if(gp){const down=new Set(gp.buttons.flatMap((b,i)=>b.pressed?[i]:[]));const edge=i=>down.has(i)&&!previous.has(i);if(edge(12))move(-1);else if(edge(13))move(1);else if(edge(14))choose(-1);else if(edge(15))choose(1);else if(edge(0))choose();else if(edge(1))back();previous=down;}}
},33);
addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();void audio.dispose();window.__motor?.mezcla()?.detener();});

addEventListener('gh3-touch-mode',()=>{settings.mode=window.__motor?.modoActual?.()||settings.mode;persist();});
