import {mostrarPresentacion,ocultarPresentacion,mostrarChip,ocultarChip,escenaLista,precargarEscena} from './presentacion-online.mjs';
import {Online,panelOnline,nombrePropio,guardarNombre,lookTxt} from './online.mjs';
import {elegirSala} from './lobby-online.mjs';
import './rl/menu-tactil.mjs';
import {guardGamepadAccess,dispositivo} from './rl/controles-core.mjs?v=20261105';guardGamepadAccess(navigator);
import {OriginalScreens} from './difficulty-results.mjs';
import {SetlistScene} from './setlist-scene.mjs';
import {HubAudio} from './hub-audio.mjs';
import {MenuScenes,keyboardFooter,captureWhammy,leerCalib,guardarCalib} from './gameplay/menu-scenes.mjs';
import {capturarTruco,capturandoTruco,terminarTruco} from './gameplay/trucos-menu.mjs';
import {empezarLag,terminarLag,calibrando,muestraWhammy,disparaPow,mirarStarPower,dejarStarPower} from './gameplay/opciones-calibrar.mjs';
import {alternar as alternarTruco,borrarTodo as borrarTrucos} from '../trucos.mjs';
import {Resources} from './resources.mjs';
import {Renderer} from './renderer.mjs';
import {buildCatalog} from './catalog.mjs';
import {Navigation} from './navigation.mjs';
import {primeSongAudio,closeSongAudio} from './gameplay/startup.mjs';
import {loadState,saveState,recordResult} from './state.mjs';
import {playCredits} from './creditos.mjs';
import {dibujarHub,dibujarSelector,dibujarLista,dibujarGuitarra,dibujarTiendaGuitarra,textoConScroll,ocultarTexto} from './perfil-pantallas.mjs';
import {usarBandaPerfil,loadPerfil,savePerfil,loadPlantel,guitarristas,variantes,guitarrasJugables,poseePersonaje,poseeGuitarra,disponibleParaComprar,comprar,personajeActual,guitarraActual,registrarCarrera,habilitarGuitarras} from './perfil.mjs';
import {loadBandas,saveBandas,usarBandaCarrera,loadCareer,saveCareer,buildCareerCatalog,lockMessage,recordCareer,careerStatus,isBossSong,BOSS_PRESENTACION,JEFE_NOMBRE} from './career.mjs';
const stage=document.getElementById('stage'),controls=document.getElementById('controls'),notice=document.getElementById('notice');
const resources=new Resources(),view=new Renderer(document.getElementById('scene'),resources),settings=loadState();
const audio=new HubAudio(settings);void audio.pause();addEventListener('gh3-boot-finished',()=>{void audio.resume();},{once:true});
audio.onPreviewStart=id=>stage.setAttribute('data-preview-playing',id);
audio.onPreviewStop=()=>stage.removeAttribute('data-preview-playing');
audio.onPreviewError=(id,e)=>{if(nav?.screen==='setlist')message('No se pudo escuchar la previsualización de esta canción.');console.warn(id,e.message);};
addEventListener('pointerdown',()=>{void audio.unlock().catch(e=>message('Audio: '+e.message));},{capture:true});
addEventListener('keydown',()=>{void audio.unlock().catch(e=>message('Audio: '+e.message));},{capture:true});
let setlistScene,originalScreens,careerNews=[],careerMovies=[],bossPending=null;
// Claude 05/11: flujo de career_menu_flow.qb / quickplay_menu_flow.qb (ver gh3-relanzamiento-web/FLUJO-ORIGINAL-QB.md).
const DIFS=['easy','medium','hard','expert'];let bandas=loadBandas(),bandaActual=-1,bandaBorrador='',careerFull=null,venueTier=null,tiersAlLanzar=0;
// Cinemáticas: solo si el archivo existe (tipo video); si no, se salta sin avisar. Esc/Enter/clic la saltan.
async function playMovie(name){
 if(name==='creditos'){void audio.pause();stage.hidden=true;await playCredits();stage.hidden=false;void audio.resume();return;}
 const url='/gh3/juego/rl/cinematicas/'+name+'.mp4';
 try{const r=await fetch(url,{method:'HEAD'});if(!r.ok||!(r.headers.get('content-type')||'').startsWith('video'))return;}catch{return;}
 void audio.pause();stage.hidden=true;
 await new Promise(done=>{const v=document.createElement('video');v.src=url;v.autoplay=true;v.playsInline=true;v.style.cssText='position:fixed;inset:0;width:100%;height:100%;background:#000;z-index:50;object-fit:contain';
  const end=()=>{removeEventListener('keydown',key,true);v.remove();done();};const key=e=>{if(['Escape','Enter',' '].includes(e.key)){e.preventDefault();e.stopImmediatePropagation();end();}};
  v.onended=end;v.onerror=end;v.onclick=end;addEventListener('keydown',key,true);document.body.append(v);v.play().catch(end);});
 stage.hidden=false;void audio.resume();
}
async function playMovies(list){for(const m of list||[])await playMovie(m);}
let menuScenes,optionPage='options',showStats=false;
let lastInput='keyboard',drawing=false,redraw=false;
let perfil=loadPerfil(),plantel=null,storeTab='personajes',nav,catalog,baseCatalog,career=loadCareer(),careerMode=false,items=[],frame=null,session=null,lastResult=null,renderVersion=0,menuTimer=null,previousButtons=new Set(),lastAxis=0;
function resize(){stage.style.setProperty('--scale',Math.min(innerWidth/1280,innerHeight/720));}addEventListener('resize',resize);resize();
// Claude 05/11: un aviso dado fuera del dibujado sobrevive al siguiente render (antes se borraba al instante).
let avisoPendiente='';function message(text){notice.textContent=text;if(!drawing)avisoPendiente=text;}
function available(song){return !!song?.difficulties.length&&!!song.package;}
const mainItems=[['CAREER','select_career'],['CO-OP CAREER','select_coop_career'],['QUICKPLAY','select_quickplay'],['MULTIPLAYER','select_multiplayer'],['TRAINING','select_training'],['OPTIONS','select_options'],['XBOX LIVE','select_xbox_live']];
// Claude 08/11: online, el invitado ve en vivo la pantalla y el cursor del anfitrion en los menus (y no mueve los suyos).
// Claude 08/11: aviso de version nueva. Cada 2 min mira build.json (lo escribe el publicador); si cambio, muestra un cartel con
// boton ACTUALIZAR en la pagina de afuera. Nunca recarga solo y no aparece mientras se toca una cancion.
let buildBase=null,buildUltimo=null,buildNuevo=false,cartelBuild=null;
async function leerBuild(){try{const r=await fetch('/gh3/juego/build.json?x='+Date.now(),{cache:'no-store'});return r.ok?(await r.text()).trim().slice(0,200):null;}catch{return null;}}
async function chequearBuild(){const b=await leerBuild();if(!b)return;buildUltimo=b;if(buildBase===null){buildBase=b;return;}if(b!==buildBase)buildNuevo=true;mostrarBuild();}
function mostrarBuild(){
 if(!buildNuevo)return;
 const visible=!frame&&!(online.active&&online.started);
 if(!cartelBuild){let doc=document;try{if(top!==self&&top.document.body)doc=top.document;}catch{}
  const d=cartelBuild=doc.createElement('div');d.setAttribute('role','status');
  d.style.cssText='position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;display:flex;gap:10px;align-items:center;padding:10px 14px;background:#160e0ef2;color:#f4ecd8;border:2px solid #f5c542;border-radius:8px;font:700 14px system-ui,sans-serif;max-width:94vw';
  const t=doc.createElement('span');t.textContent='Hay una versión nueva del juego.';
  const ok=doc.createElement('button');ok.textContent='ACTUALIZAR';ok.style.cssText='font:700 13px system-ui;padding:6px 12px;background:#c9271f;color:#fff;border:2px solid #f5c542;border-radius:6px;cursor:pointer';
  ok.onclick=()=>{try{(top!==self?top:window).location.reload();}catch{location.reload();}};
  const no=doc.createElement('button');no.textContent='Después';no.style.cssText='font:600 13px system-ui;padding:6px 10px;background:#2a1a1c;color:#f4ecd8;border:2px solid #6b4a2a;border-radius:6px;cursor:pointer';
  no.onclick=()=>{d.remove();cartelBuild=null;buildNuevo=false;buildBase=buildUltimo;};
  d.append(t,ok,no);doc.body.append(d);}
 cartelBuild.style.display=visible?'flex':'none';
}
void chequearBuild();setInterval(chequearBuild,120000);
const espejo=()=>online.active&&!online.host&&(!online.ronda||online.local)&&!frame;
function emitirMenu(){try{if(!online.active||!online.host||(online.ronda&&!online.local)||frame)return;online.send({t:'menu',screen:nav.screen,group:nav.group,selected:nav.selected,song:nav.song,difficulty:nav.difficulty,page:optionPage});}catch{}}
const PANTALLAS_ESPEJO=['main','setlist','qdifficulty','difficulty','options'],PAGINAS_ESPEJO=['options','sound','controller','cheats','lag'];
function aplicarMenuRemoto(o){if(!espejo()||!(PANTALLAS_ESPEJO.includes(o?.screen)||(o?.screen==='results'&&lastResult)))return;
 const antes=nav.screen+'|'+nav.group+'|'+nav.selected+'|'+optionPage;
 nav.screen=o.screen;nav.group=Math.max(0,Math.min((o.group|0),catalog.groups.length-1));nav.selected=Math.max(0,o.selected|0);
 if(catalog.songs[o.song])nav.song=o.song;if(['easy','medium','hard','expert'].includes(o.difficulty))nav.difficulty=o.difficulty;
 if(o.screen==='options')optionPage=PAGINAS_ESPEJO.includes(o.page)?o.page:'options';
 if(antes!==nav.screen+'|'+nav.group+'|'+nav.selected+'|'+optionPage){sugerida=null;void audio.play(antes.split('|')[0]!==nav.screen?'ui_sfx_select':'ui_sfx_scroll');}
 void render();}
// Claude 08/11: cartel "Siguiendo a ..." para el invitado y sugerencia de cancion (flechas + Enter en la lista; el anfitrion la ve en el chat).
let sugerida=null,marcaEsp=null;
const cancionesPlanas=()=>catalog.groups.flatMap(g=>g.songs).filter(id=>available(catalog.songs[id]));
function marcaEspejo(){
 if(!marcaEsp){const d=marcaEsp=document.createElement('div');d.setAttribute('role','status');d.style.cssText='position:fixed;left:50%;top:8px;transform:translateX(-50%);z-index:50;padding:6px 12px;background:#160e0ee6;color:#f4ecd8;border:2px solid #f5c542;border-radius:8px;font:700 13px system-ui,sans-serif;text-align:center;max-width:92vw;pointer-events:none';document.body.append(d);}
 const v=espejo();marcaEsp.style.display=v?'block':'none';if(!v)return;
 const nom=online.nombreRival||'el anfitrión';
 marcaEsp.textContent='Siguiendo a '+nom+(nav.screen==='setlist'?(sugerida?' · Sugerís: '+(catalog.songs[sugerida]?.title||sugerida)+' (Enter envía)':' · ↑↓ para sugerirle una canción'):'');
}
function moverSugerencia(d){const l=cancionesPlanas();if(!l.length)return;let i=l.indexOf(sugerida??nav.song);if(i<0)i=0;sugerida=l[(i+d+l.length)%l.length];void audio.play('ui_sfx_scroll');marcaEspejo();}
function enviarSugerencia(){if(!sugerida)return;online.send({t:'sugerir',cancion:sugerida});void audio.play('ui_sfx_select');const t=catalog.songs[sugerida]?.title||sugerida;avisoOnline.chatLinea?.('','Le sugeriste: '+t,'sis');sugerida=null;marcaEspejo();}
addEventListener('keydown',e=>{if(!espejo()||nav.screen!=='setlist'||e.repeat||teclaBloqueada()||e.target?.tagName==='INPUT')return;if(e.key==='ArrowUp'){e.preventDefault();moverSugerencia(-1);}else if(e.key==='ArrowDown'){e.preventDefault();moverSugerencia(1);}else if(e.key==='Enter'&&sugerida){e.preventDefault();enviarSugerencia();}});
async function render(){if(drawing){redraw=true;return;}drawing=true;try{do{redraw=false;await drawMenu();emitirMenu();}while(redraw&&!frame);mostrarBuild();try{marcaEspejo();}catch{}}finally{drawing=false;}}
async function drawMenu(){
 if(!frame)audio.selectPreview(nav.screen==='setlist'?catalog.songs[catalog.groups[nav.group].songs[nav.selected]]:null);
 if(frame)return;if(!['difficulty','qdifficulty','cdifficulty','results'].includes(nav.screen))originalScreens?.leave();document.getElementById('selection').hidden=!['difficulty','qdifficulty','cdifficulty'].includes(nav.screen);const version=++renderVersion;if(!['chars','store','guitars'].includes(nav.screen))ocultarTexto();if(!(nav.screen==='store'&&storeTab==='guitarras'))verVitrina(null);controls.replaceChildren();items=[];view.clear();notice.textContent=avisoPendiente;avisoPendiente='';
 if(nav.screen==='main'){
  await view.main();if(version!==renderVersion)return;
  mainItems.forEach(([label,action],i)=>items.push({label,x:675,y:88+i*48,w:305,h:49,size:i===1||i===6?35:45,disabled:!['select_career','select_coop_career','select_quickplay','select_options','select_multiplayer'].includes(action),run:()=>action==='select_multiplayer'?abrirOnline():action==='select_coop_career'?abrirCoopLocal():action==='select_career'?(coopLocal=false,enterCareer()):(coopLocal=false,setCareerMode(false),nav.dispatch(action))}));
 }else if(nav.screen==='qdifficulty'||nav.screen==='cdifficulty'){
  originalScreens??=new OriginalScreens(view);verEscena3D(false);
  items=(await originalScreens.drawDifficulty(nav,{difficulties:DIFS})).map(item=>({...item,run:()=>nav.screen==='qdifficulty'?elegirDificultadRapida(item.id):elegirDificultadCarrera(item.id)}));
 }else if(nav.screen==='difficulty'){
  originalScreens??=new OriginalScreens(view);
  items=(await originalScreens.drawDifficulty(nav,catalog.songs[nav.song])).map(item=>({...item,run:()=>{nav.difficulty=item.id;launch();}}));

 }else{
  if(!['setlist','results','options','hub','chars','guitars','gfinish','store','outfits','unlock'].includes(nav.screen))await view.paper();if(version!==renderVersion)return;
  if(nav.screen==='unlock'){verEscena3D(false);items=await dibujarDesbloqueo();}else
  if(['hub','chars','guitars','gfinish','store','outfits'].includes(nav.screen)){items=await drawPerfilScreen();}else{verEscena3D(false);}
  if(['hub','chars','guitars','gfinish','store','outfits','unlock'].includes(nav.screen)){}else
  if(nav.screen==='band'){
   view.text('CHOOSE BAND',640,110,58,'#321e0a','center','title',900);
   items=bandas.map((b,i)=>({label:b.nombre.toUpperCase(),x:390,y:210+i*56,w:500,h:52,size:40,run:()=>elegirBanda(i)}));
   if(bandas.length<8)items.push({label:'NEW BAND',x:390,y:210+bandas.length*56,w:500,h:52,size:40,run:()=>{bandaBorrador='';nav.screen='bandname';nav.selected=0;}});
  }else
  if(nav.screen==='bandname'){
   view.text('ENTER BAND NAME',640,150,58,'#321e0a','center','title',900);
   const inp=document.createElement('input');inp.id='rl-banda';inp.maxLength=20;inp.value=bandaBorrador;inp.autocomplete='off';inp.spellcheck=false;inp.setAttribute('aria-label','Nombre de la banda');
   inp.style.cssText='position:absolute;left:390px;top:270px;width:500px;height:64px;font:bold 38px Arial;text-align:center;background:#f6ecd0;color:#321e0a;border:3px solid #321e0a;z-index:5';
   inp.oninput=()=>{bandaBorrador=inp.value;};controls.append(inp);setTimeout(()=>{inp.focus();inp.setSelectionRange(inp.value.length,inp.value.length);},0);
   items=[{label:'ACCEPT',x:540,y:380,w:200,h:56,size:44,run:aceptarBanda}];
  }else
  if(nav.screen==='venue'){
   view.text('SELECT VENUE',640,90,58,'#321e0a','center','title',900);
   items=(careerFull?.groups||[]).map((g,i)=>({label:(g.title||g.id).toUpperCase()+(g.careerTier?.complete?'  - COMPLETE':''),x:340,y:170+i*54,w:600,h:50,size:34,run:()=>elegirVenue(i)}));
  }else
  if(nav.screen==='confirm'){
   view.text('BOSS BATTLE',640,170,60,'#321e0a','center','title',900);
   view.text('VS. '+(JEFE_NOMBRE[bossPending]||'BOSS').toUpperCase(),640,250,38,'#a40000','center','title',900);
   items=[{label:'YES',x:420,y:360,w:200,h:60,size:48,run:async()=>{const id=bossPending;await playMovie(BOSS_PRESENTACION[id]);nav.song=id;nav.difficulty=career.difficulty;launch();if(!frame)void render();}},{label:'NO',x:660,y:360,w:200,h:60,size:48,run:()=>{nav.dispatch('back');}}];
  }else
  if(nav.screen==='setlist'){
   setlistScene??=new SetlistScene(view,catalog,settings);
   items=(await setlistScene.draw(nav)).map(item=>({...item,run:()=>{if(careerMode&&isBossSong(item.songId)){bossPending=item.songId;nav.dispatch('confirm');nav.selected=0;return;}nav.song=item.songId;if(careerMode)nav.difficulty=career.difficulty;launch();}}));
  }else if(nav.screen==='options'){
   menuScenes??=new MenuScenes(view);
   items=(await menuScenes.options(optionPage,nav.selected,settings)).map((e,i)=>({...e,run:()=>optionAction(i)}));
  }else if(nav.screen==='results'){
   originalScreens??=new OriginalScreens(view);
   items=showStats?(await originalScreens.drawStats(lastResult)).map(e=>({...e,run:()=>{showStats=false;nav.selected=2;}})):(await originalScreens.drawResults(nav,catalog.songs[nav.song],lastResult)).map((item,i)=>({...item,run:()=>{if(i===0)salirResultados();else if(i===1)launch();else {showStats=true;nav.selected=0;}}}));
   if(!lastResult?.completed)message('Partida interrumpida');
   else if(careerNews.length){message(careerNews.join(' · '));careerNews=[];}
   else if(lastResult?.saved===false)message('No se pudo guardar el resultado local.');

  }
 }
 if(version!==renderVersion)return;
 if(nav.screen!=='setlist')nav.selected=Math.max(0,Math.min(nav.selected,items.length-1));
 items.forEach((item,i)=>{
  const index=item.songIndex??i;if(!['setlist','difficulty','qdifficulty','cdifficulty','results','options'].includes(nav.screen)&&!item.drawn)view.item(item.label,item.x,item.y,item.w,item.h,index===nav.selected,item.disabled,{font:item.font||'title',size:item.size||42,color:nav.screen==='main'?'#d7a06e':'#321e0a',align:nav.screen==='main'?'center':'left',highlight:!['setlist','difficulty'].includes(nav.screen),disabledColor:nav.screen==='main'?'#726250':'#321e0a',spacing:nav.screen==='setlist'?.5:1,focusedColor:nav.screen==='setlist'?'#c87800':'#af0000'});
  const b=document.createElement('button');b.className='hit';b.textContent=item.label+(item.disabled?' (no disponible)':'');b.setAttribute('aria-disabled',String(!!item.disabled));b.setAttribute('aria-current',String(nav.screen==='setlist'?item.selected:index===nav.selected));b.style.cssText=`left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px`;
  if(nav.screen==='setlist'&&catalog.songs[item.songId]?.preview)b.setAttribute('aria-label',item.label+' · Escuchar adelanto'+(item.disabled?' · Canción todavía no jugable':''));
  b.onclick=()=>{if(teclaBloqueada()||espejo())return;if(item.groupIndex!==undefined)nav.group=item.groupIndex;nav.selected=index;if(nav.screen==='setlist'&&item.disabled){void audio.play('ui_sfx_scroll');void render();}else activate();};b.onfocus=()=>{if(teclaBloqueada()||espejo())return;if(item.groupIndex!==undefined)nav.group=item.groupIndex;nav.selected=index;};controls.append(b);
 });
 if(nav.screen!=='main'){const bb=document.createElement('button');bb.className='hit';bb.textContent='BACK';bb.setAttribute('aria-label','Volver');bb.style.cssText='left:430px;top:640px;width:420px;height:56px';bb.onclick=()=>{if(!teclaBloqueada())back();};controls.append(bb);}
 if(capturandoTruco())await keyboardFooter(view,{labels:['FINISH ENTERING CHEAT','UP/DOWN TO STRUM']});
 else if(calibrando())await keyboardFooter(view,{labels:['STRUM']});
 else if(lastInput==='keyboard'&&nav.screen==='options'&&['whammy','starpower'].includes(optionPage))await keyboardFooter(view,{labels:['ENTER SELECT','ESC BACK']});
 else if(lastInput==='keyboard')await keyboardFooter(view,{back:nav.screen!=='main',setlist:nav.screen==='setlist'});
 else if(nav.screen!=='setlist')await view.footer(nav.screen!=='main');
 document.title='GH3 · '+nav.screen;
}
// Claude 05/11: teclado/mouse no dependen del estado del mando (ver rl/relanzamiento.mjs).
function teclaBloqueada(){const r=window.__gh3Relanzamiento;return r?(r.bloqueadoTeclado?r.bloqueadoTeclado():r.bloqueado()):false;}
function setCareerMode(on,force){
 if(on===careerMode&&!force&&(!on||catalog?.career))return;careerMode=on;
 // Solo la dificultad elegida (quickplay_select_difficulty_fs / career_select_difficulty_fs): las canciones sin ella quedan grises.
 const conDif=(cat,d)=>({...cat,songs:Object.fromEntries(Object.entries(cat.songs).map(([id,s])=>[id,{...s,difficulties:s.difficulties.includes(d)?[d]:[],sinDificultad:!s.difficulties.includes(d)}]))});
 if(on){careerFull=conDif(buildCareerCatalog(baseCatalog,resources.qb,career),career.difficulty);catalog=venueTier!=null&&careerFull.groups[venueTier]?{...careerFull,groups:[careerFull.groups[venueTier]]}:careerFull;}
 else{careerFull=null;venueTier=null;catalog=conDif(baseCatalog,nav?.difficulty||'medium');}
 setlistScene=null;
}
function entrarSetlistCarrera(){
 nav.screen='setlist';nav.selected=0;const i=catalog.groups.findLastIndex(g=>!g.careerTier.complete);nav.group=i<0?catalog.groups.length-1:i;
}
function elegirDificultadRapida(d){nav.difficulty=d;setCareerMode(false,true);nav.screen='setlist';nav.group=0;nav.selected=0;}
function elegirBanda(i){bandaActual=i;usarBandaCarrera(i);usarBandaPerfil(i);career=loadCareer();perfil=loadPerfil();venueTier=null;setCareerMode(true,true);nav.screen='cdifficulty';nav.selected=Math.max(0,DIFS.indexOf(career.difficulty));}
function aceptarBanda(){const nombre=bandaBorrador.trim().replace(/\s+/g,' ').slice(0,20);if(!nombre){message('La banda necesita un nombre.');return;}bandas.push({nombre});if(!saveBandas(bandas))message('No se pudo guardar la banda.');elegirBanda(bandas.length-1);}
// career_select_difficulty_flow_state_func: primera vez -> elegir personaje; si no -> hub.
function elegirDificultadCarrera(d){career.difficulty=d;nav.difficulty=d;saveCareer(career);venueTier=null;setCareerMode(true,true);nav.screen=perfil.personaje?'hub':'chars';nav.selected=0;}
function elegirVenue(i){venueTier=i;setCareerMode(true,true);nav.screen='setlist';nav.group=0;nav.selected=0;}
function enterCareer(){
 bandas=loadBandas();setCareerMode(true);nav.dispatch('select_career');nav.screen=bandas.length?'band':'bandname';bandaBorrador='';nav.selected=0;
 if(!career.seen.singleplayer_01&&!Object.keys(career.done).length){career.seen.singleplayer_01=1;saveCareer(career);void playMovie('singleplayer_01').then(()=>render());}
 nav.selected=0;
}
// ---- Perfil de Carrera (flujo del original: selector de personaje -> hub: PLAY SHOW / THE STORE / CHANGE OUTFIT / CHANGE GUITAR) ----
// Listas simples en vez de las pantallas 3D originales (menu_character_select, menu_character_hub, menu_guitar_select, menu_store).
const nombrePersonaje=p=>(p.nombre.replace(/^./,c=>c.toUpperCase())+(p.traje>1?' - OUTFIT '+p.traje:'')+(p.estilo>1?' - STYLE '+p.estilo:'')).toUpperCase();
const nombreGuitarra=g=>((g.nombre||g.id.replace(/^Instrument_/,''))+(g.acabado?' - '+g.acabado:'')).toUpperCase();
function listaPerfil(){
 const act=personajeActual(perfil,plantel),gAct=guitarraActual(perfil,plantel);
 if(nav.screen==='chars')return guitarristas(plantel).filter(p=>poseePersonaje(perfil,p)||plantel.personajes.some(x=>x.nombre.toLowerCase()===p.nombre.toLowerCase()&&perfil.owned[x.id])).map(p=>{const tiene=poseePersonaje(perfil,p)||plantel.personajes.some(x=>x.nombre.toLowerCase()===p.nombre.toLowerCase()&&perfil.owned[x.id]);
  return {nombre:p.nombre,vistaId:(variantes(plantel,p.nombre).find(v=>v.id===perfil.personaje)??p).id,texto:p.nombre.toUpperCase(),marca:p.nombre.toLowerCase()===act.nombre.toLowerCase()?'SELECTED':tiene?'':'LOCKED',run:()=>{
   if(!tiene){message('Se compra en THE STORE'+(['Slash','Morello','Satan'].includes(p.nombre)?' después de vencer al jefe.':'.'));return;}
   const mio=variantes(plantel,p.nombre).find(v=>perfil.owned[v.id]&&v.id===perfil.personaje)??p;perfil.personaje=mio.id;savePerfil(perfil);nav.screen='hub';nav.selected=0;}};});
 if(nav.screen==='outfits')return variantes(plantel,act.nombre).sort((a,b)=>a.traje-b.traje||a.estilo-b.estilo).map(v=>{const tiene=poseePersonaje(perfil,v);
  return {texto:nombrePersonaje(v),marca:v.id===act.id?'SELECTED':tiene?'':'LOCKED',run:()=>{if(!tiene){message('Se compra en THE STORE.');return;}perfil.personaje=v.id;savePerfil(perfil);message('Ropa elegida.');}};});
 if(nav.screen==='guitars')return guitarrasJugables(plantel).filter(x=>poseeGuitarra(perfil,x)).map(x=>({texto:nombreGuitarra(x),marca:x.id===gAct.id?'SELECTED':'',run:()=>{perfil.guitarra=x.id;savePerfil(perfil);message('Guitarra elegida: '+nombreGuitarra(x));}}));
 const esG=storeTab==='guitarras',base=esG?guitarrasJugables(plantel):plantel.personajes.filter(p=>!/^(bassist|singer|drummer|boneman)/i.test(p.nombre));
 return base.filter(x=>esG?['tienda','acabado','secreta'].includes(x.grupo):['estilo','traje','secreto'].includes(x.grupo)).map(x=>{
  const tiene=esG?poseeGuitarra(perfil,x):poseePersonaje(perfil,x),ok=disponibleParaComprar(perfil,x,esG,career),nom=esG?nombreGuitarra(x):nombrePersonaje(x);
  return {texto:nom,obj:x,estado:tiene?'owned':ok?'venta':'locked',marca:tiene?'OWNED':ok?'$'+x.precio:'LOCKED',run:()=>{
   if(tiene)message('Ya lo tenés.');else if(!ok)message('Bloqueado: se habilita jugando la Carrera.');
   else{const r=comprar(perfil,x);message(r==='ok'?'Comprado: '+nom:'Te falta dinero: $'+(x.precio-perfil.cash)+' más.');}}};});
}
// Escena 3D de fondo (escena/index.html?fondo=1) para hub, selector y tienda: el escenario con la banda, reloj propio en bucle.
let desbloqueos=[],gsModelo=0;
function salirResultados(){if(desbloqueos.length){nav.screen='unlock';nav.selected=0;}else if(careerMode&&(careerFull?.groups.length||0)>tiersAlLanzar){nav.screen='venue';nav.selected=careerFull.groups.length-1;}else nav.dispatch('setlist');}
async function dibujarDesbloqueo(){
 menuScenes??=new MenuScenes(view);await menuScenes.ready;const s=menuScenes,v=view,id=desbloqueos[0],g=plantel?.guitarras.find(x=>x.id===id),icono=plantel?.iconosSecretas?.[id];
 // create_unlock_menu (QB): fondo, terciopelo (640,320), icono (640,330) 650x325, diálogo (850,550), candado (850,412), nombre en (850,505), CONTINUE en (400,590).
 await s.sprite('Unlock_BG',0,0,1280,720);await s.sprite('Unlock_Velvet',640,320,865,420,{just:['center','center']});
 if(icono)await s.sprite(icono,640,330,650,325,{just:['center','center']}).catch(()=>{});
 await s.sprite('Unlock_Dialog_BG',850,550,512,256,{just:['center','center']});await s.sprite('Unlock_Padlock',850,412,null,null,{just:['center','center']}).catch(()=>{});
 v.text('CONGRATULATIONS',850,462,26,'#808080','center','title',420);v.text('BUY IT IN THE STORE',850,490,22,'#808080','center','title',420);
 v.text(g?nombreGuitarra(g):'NEW GUITAR',850,525,28,'#802020','center','title',460);
 v.text('CONTINUE',400,590,32,'#dfdfdf','left','title',300);
 return [{label:'CONTINUE',drawn:true,x:400,y:584,w:300,h:44,run:()=>{desbloqueos.shift();if(desbloqueos.length)void render();else salirResultados();}}];
}
// Claude 05/11: textos originales de los selectores (scripts/extraer-textos-perfil.mjs): nombre completo, biografía y descripción de guitarras.
let textosPerfil=null;const textosListos=fetch('/gh3/juego/recovered/perfil-textos.json').then(r=>r.ok?r.json():null).then(j=>{textosPerfil=j;}).catch(()=>{});
// Claude 05/11: vitrina de la tienda de guitarras (escena/vitrina.html): guitarra elegida grande y pared de guitarras. Reconstrucción.
let vitrina=null,vitrinaPak='';
function verVitrina(pak,pared=''){
 if(!pak){if(vitrina&&vitrina.style.display!=='none'){vitrina.style.display='none';vitrina.contentWindow?.postMessage({tipo:'vitrina',pausa:true},'*');}return;}
 if(!vitrina){vitrina=document.createElement('iframe');vitrina.src='/gh3/juego/escena/vitrina.html?g='+pak+'&pared='+pared;vitrina.title='Tienda';vitrina.setAttribute('aria-hidden','true');vitrina.tabIndex=-1;vitrina.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;border:0;z-index:0;pointer-events:none;background:#3d5a42';stage.prepend(vitrina);vitrinaPak=pak;return;}
 if(vitrina.style.display==='none'){vitrina.style.display='';vitrina.contentWindow?.postMessage({tipo:'vitrina',pausa:false},'*');}
 if(pak!==vitrinaPak){vitrinaPak=pak;vitrina.contentWindow?.postMessage({tipo:'vitrina',g:pak},'*');}
}
let escena3d=null,escenaTimer=null,escenaParams='',escenaRecarga=0,camaraMenu=null,vistaPersonaje=null,vistaGuitarra=null;
// Claude 05/11: modelos de guitarra (create_select_guitar_menu: una placa por modelo; el acabado se elige después en SELECT FINISH).
function modelosGuitarra(){const m=new Map();for(const g of guitarrasJugables(plantel).filter(x=>poseeGuitarra(perfil,x))){const k=g.nombre||g.id;if(!m.has(k))m.set(k,{nombre:k,nombre2:g.nombre2,marca:g.marca,guitarras:[]});m.get(k).guitarras.push(g);}return [...m.values()];}
// Personaje y guitarra elegidos para la escena (modelos exportados con concierto-06-escena/exportar-personaje.mjs; si faltan, se queda Axel).
const basePak=s=>s.split(String.fromCharCode(92)).pop().replace(/[.]pak$/i,'');
const existe=new Map();
async function hay(u){if(!existe.has(u))existe.set(u,fetch(u,{method:'HEAD'}).then(r=>r.ok).catch(()=>false));return existe.get(u);}
async function paramsEscena(){
 if(!plantel)return '';
 const p0=(vistaPersonaje&&plantel.personajes.find(x=>x.id===vistaPersonaje)),g0=(vistaGuitarra&&plantel.guitarras.find(x=>x.id===vistaGuitarra));
 const q=await queryLook(p0||personajeActual(perfil,plantel),g0||guitarraActual(perfil,plantel));
 if(!p0&&!g0)publicarLook(q);else void sincronizarLook();
 return q;
}
// Claude 08/11: la sala recibe lo confirmado (perfil), no lo que se está mirando en el menú; se manda al cambiar y refresca la cara propia.
async function sincronizarLook(){if(!plantel)return;publicarLook(await queryLook(personajeActual(perfil,plantel),guitarraActual(perfil,plantel)));}
let lookQ='';
function publicarLook(q){lookQ=q;if(elige&&!elige.yo)return;try{const q2=new URLSearchParams(q),nl={modelo:q2.get('modelo')||'',guitarra:q2.get('guitarra')||''},cambio=JSON.stringify(nl)!==JSON.stringify(online.look||{});online.look=nl;if(cambio&&online.active){online.send({t:'nombre',nombre:nombrePropio(),...nl});online.guia();}}catch{}}
async function queryLook(p,g){
 const mod=basePak(p.pak),gui=basePak(g.pak),id=p.nombre.toLowerCase(),E='/gh3/juego/escena/';
 const okP=id==='axel'&&mod==='axel_1'?true:(await hay(E+'api/model/'+mod+'.json'))&&(id==='axel'||await hay(E+'datos/personajes/'+id+'/indice.json'));
 const okG=gui==='Explorer_White'?true:await hay(E+'api/model/'+gui+'.json');
 let q='';if(okP&&!(id==='axel'&&mod==='axel_1'))q+='&personaje='+id+'&modelo='+mod;if(okG&&gui!=='Explorer_White')q+='&guitarra='+gui;
 return q;
}
async function verEscena3D(on){
 if(on){const q=await paramsEscena();if(escena3d&&q!==escenaParams){escenaParams=q;clearTimeout(escenaRecarga);escenaRecarga=setTimeout(()=>{if(escena3d)escena3d.src='/gh3/juego/escena/index.html?cancion=slowride&fondo=1'+escenaParams;},350);}else escenaParams=q;}
 if(on&&!escena3d){
  escena3d=document.createElement('iframe');escena3d.src='/gh3/juego/escena/index.html?cancion=slowride&fondo=1'+escenaParams;escena3d.title='Escenario';escena3d.setAttribute('aria-hidden','true');escena3d.tabIndex=-1;
  escena3d.style.cssText='position:absolute;left:0;top:0;width:1280px;height:720px;border:0;z-index:0;pointer-events:none;background:#000';stage.prepend(escena3d);
  let ms=60000;escenaTimer=setInterval(()=>{if(escena3d.style.display==='none')return;ms+=50;if(ms>110000)ms=60000;escena3d.contentWindow?.postMessage({tipo:'gh3-cancion',ms,corre:true},'*');escena3d.contentWindow?.postMessage({tipo:'gh3-camara',modo:camaraMenu},'*');},50);
 }
 if(escena3d)escena3d.style.display=on?'':'none';
}
async function drawPerfilScreen(){
 menuScenes??=new MenuScenes(view);await menuScenes.ready;await textosListos;
 camaraMenu=['guitars','gfinish'].includes(nav.screen)?'guitarra':['chars','outfits'].includes(nav.screen)?'personaje':null;vistaPersonaje=null;vistaGuitarra=null;
 if(plantel&&nav.screen==='chars'){const f=listaPerfil();vistaPersonaje=f[Math.max(0,Math.min(nav.selected,f.length-1))]?.vistaId??null;}
 const modelos=plantel?modelosGuitarra():[];
 if(nav.screen==='guitars'&&modelos.length){const m=modelos[Math.max(0,Math.min(nav.selected,modelos.length-1))];vistaGuitarra=(m.guitarras.find(g=>g.id===perfil.guitarra)??m.guitarras[0]).id;}
 if(nav.screen==='gfinish'&&modelos[gsModelo]){const gs=modelos[gsModelo].guitarras;vistaGuitarra=gs[Math.max(0,Math.min(nav.selected,gs.length-1))].id;}
 await verEscena3D(true);
 const T=(t,x,y,s,c,a='center',w=1000)=>view.text(t,x,y,s,c,a,'title',w);
 if(!plantel){T('PLANTEL NO DISPONIBLE',640,300,40,'#fff');return [];}
 if(nav.screen==='hub'){
  const pj=personajeActual(perfil,plantel),gt=guitarraActual(perfil,plantel);
  const filas=[['PLAY SHOW',()=>{nav.screen='venue';nav.selected=Math.max(0,(careerFull?.groups||[]).findLastIndex(g=>!g.careerTier.complete));}],['THE STORE',()=>{nav.screen='store';nav.selected=0;}],['CHANGE OUTFIT',()=>{nav.screen='outfits';nav.selected=0;}],['CHANGE GUITAR',()=>{nav.screen='guitars';const a=guitarraActual(perfil,plantel);nav.selected=Math.max(0,modelosGuitarra().findIndex(m=>m.guitarras.some(g=>g.id===a.id)));}]];
  const cajas=await dibujarHub(menuScenes,{filas:filas.map(f=>f[0]),seleccionada:nav.selected,titulo:pj.nombre.toUpperCase(),subtitulo:'CASH  $'+perfil.cash});
  return filas.map(([label,run],i)=>({label,drawn:true,...cajas[i],run}));
 }
 if((nav.screen==='guitars'||nav.screen==='gfinish')&&modelos.length){
  if(nav.screen==='guitars'){
   const sel=Math.max(0,Math.min(nav.selected,modelos.length-1)),m=modelos[sel];
   const cajas=await dibujarGuitarra(menuScenes,{titulo:'SELECT GUITAR',modelo:m.nombre.trim(),nombre2:m.nombre2,marca:m.marca,dinero:perfil.cash});
   // Claude 05/11: descripción de la guitarra (gs_element_offsets 4, dims 388x250) dentro de la ventana.
   textoConScroll(view,{texto:textosPerfil?.guitarras?.[(m.guitarras.find(g=>g.id===perfil.guitarra)??m.guitarras[0]).id],x:270,y:330,w:236,h:220,size:22,color:'rgb(255,255,200)'});
   return modelos.map((x,i)=>({label:x.nombre,drawn:true,...(i===sel?cajas[0]:{x:0,y:-300,w:10,h:10}),run:()=>{
    if(x.guitarras.length===1){perfil.guitarra=x.guitarras[0].id;savePerfil(perfil);message('Guitarra elegida: '+nombreGuitarra(x.guitarras[0]));nav.screen='hub';nav.selected=3;return;}
    gsModelo=i;nav.screen='gfinish';nav.selected=Math.max(0,x.guitarras.findIndex(g=>g.id===perfil.guitarra));}}));
  }
  const m=modelos[gsModelo],sel=Math.max(0,Math.min(nav.selected,m.guitarras.length-1));
  const cajas=await dibujarGuitarra(menuScenes,{titulo:'SELECT FINISH',modelo:m.nombre.trim(),nombre2:m.nombre2,marca:m.marca,fase:'finish',acabados:m.guitarras.map(g=>g.acabado||g.nombre2||g.id.replace(/^Instrument_/,'')),seleccionado:sel});
  return m.guitarras.map((g,i)=>({label:g.acabado||g.id,drawn:true,...(cajas[i]||{x:0,y:-300,w:10,h:10}),run:()=>{perfil.guitarra=g.id;savePerfil(perfil);message('Guitarra elegida: '+nombreGuitarra(g));nav.screen='hub';nav.selected=3;}}));
 }
 const filas=listaPerfil();
 if(nav.screen==='chars'){
  const cajas=await dibujarSelector(menuScenes,{lista:filas.map(f=>({nombre:f.nombre})),seleccionado:Math.max(0,Math.min(nav.selected,filas.length-1)),titulo:'SELECT YOUR HERO',nombreCompleto:textosPerfil?.personajes?.[filas[Math.max(0,Math.min(nav.selected,filas.length-1))]?.nombre.toLowerCase()]?.nombre,blurb:textosPerfil?.personajes?.[filas[Math.max(0,Math.min(nav.selected,filas.length-1))]?.nombre.toLowerCase()]?.blurb});
  return filas.map((f,i)=>({label:f.texto,drawn:true,...cajas[i],run:f.run}));
 }
 if(nav.screen==='store'&&storeTab==='guitarras'&&filas.length){
  // Claude 05/11: THE STORE > GUITARS como create_store_guitars_menu (panel en (900,360), etiqueta de precio en (520,260)).
  const sel=Math.max(0,Math.min(nav.selected,filas.length-1)),f=filas[sel],g=f.obj;
  const pared=filas.map(r=>basePak(r.obj.pak)).filter((p,i,a)=>a.indexOf(p)===i&&p!==basePak(g.pak)).slice(0,13).join(',');
  verEscena3D(false);verVitrina(basePak(g.pak),pared);
  const cajas=await dibujarTiendaGuitarra(menuScenes,{g,precio:g.precio,estado:f.estado,blurb:textosPerfil?.guitarras?.[g.id],dinero:perfil.cash,pestana:'GUITARS   (LEFT / RIGHT)'});
  return filas.map((r,i)=>({label:r.texto,drawn:true,...(i===sel?cajas[0]:{x:0,y:-300,w:10,h:10}),run:r.run}));
 }
 ocultarTexto();
 const titulo=({outfits:'CHANGE OUTFIT',guitars:'SELECT GUITAR'})[nav.screen]||'THE STORE';
 const sub=nav.screen==='store'?(storeTab==='guitarras'?'GUITARS':'CHARACTERS')+'   (LEFT / RIGHT)':undefined;
 if(!filas.length){T(titulo,970,110,44,'#fff','center',560);T('NOTHING TO SHOW',970,300,30,'#ffd9a0','center',560);return [];}
 const sel=Math.max(0,Math.min(nav.selected,filas.length-1)),desde=Math.max(0,Math.min(sel-3,filas.length-8));
 const cajas=await dibujarLista(menuScenes,{titulo,subtitulo:sub,dinero:perfil.cash,filas,seleccionada:sel,desde});
 return filas.map((f,i)=>{const c=cajas.find(k=>k.indice===i);return {label:f.texto,drawn:true,x:c?c.x:0,y:c?c.y:-300,w:c?c.w:264,h:c?c.h:40,run:f.run};});
}
function save(){audio.volume();if(!saveState(settings))message('No se pudo guardar la configuración.');}
// Claude 07/11: las entradas llevan id (menu-scenes guarda la última lista en menuScenes.ultimas); páginas nuevas lag, whammy, starpower, cheats.
function optionAction(i,delta=1){
 const id=menuScenes?.ultimas?.[i]?.id;
 if(optionPage==='options'){
  const destino={audio:'sound',lag:'lag',controller:'controller',cheats:'cheats'}[id];
  if(destino){optionPage=destino;nav.selected=0;}
  else if(id==='video'){const qs=catalog.availability.qualities;settings.quality=qs[(qs.indexOf(settings.quality)+delta+qs.length)%qs.length]||'equilibrada';save();}
  else back();
 }else if(optionPage==='sound'&&i<4){const k=['bandVolume','guitarVolume','effectsVolume','volume'][i];settings[k]=Math.max(0,Math.min(1,Math.round(((settings[k]??1)+delta*.1)*10)/10));save();}
 else if(optionPage==='controller'&&id==='mode'){settings.mode=settings.mode==='gh3'?'simplificado':'gh3';save();}
 else if((optionPage==='controller'||optionPage==='whammy')&&id==='whammykeys'){captureWhammy(()=>void render());void render();}
 else if(optionPage==='controller'&&(id==='whammy'||id==='starpower')){optionPage=id;nav.selected=0;if(id==='starpower')mirarStarPower({alCambiar:()=>void render(),sonar:n=>void audio.play(n)});}
 else if(optionPage==='lag'&&id==='calibrate'){empezarLag({alCambiar:()=>void render(),sonar:n=>void audio.play(n)});}
 else if(optionPage==='whammy'&&id==='sample'){muestraWhammy(n=>void audio.play(n),()=>void render());}
 else if(optionPage==='starpower'&&id==='set'){disparaPow(n=>void audio.play(n),()=>void render());}
 else if(optionPage==='lag'&&id==='lag'){guardarCalib(leerCalib()+5*delta);}
 else if(optionPage==='lag'&&id==='reset'){guardarCalib(0);}
 else if(optionPage==='cheats'&&id==='enter'){capturarTruco({alCambiar:()=>void render(),sonar:n=>void audio.play(n)});}
 else if(optionPage==='cheats'&&id?.startsWith('cheat:')){alternarTruco(id.slice(6));}
 else if(optionPage==='cheats'&&id==='clear'){borrarTrucos();nav.selected=0;}
 else if(optionPage==='whammy'||optionPage==='starpower'){dejarStarPower();optionPage='controller';nav.selected=0;}
 else {optionPage='options';nav.selected=0;}
}
function activate(){if(espejo())return;const i=nav.screen==='setlist'?items.find(i=>i.songIndex===nav.selected&&i.groupIndex===nav.group):items[nav.selected];if(!i)return;if(i.disabled&&nav.screen==='setlist'&&catalog.songs[i.songId]?.sinDificultad&&!catalog.songs[i.songId]?.careerLock){message('Esta canción todavía no tiene la dificultad elegida.');return;}if(i.disabled&&careerMode&&nav.screen==='setlist'){const s=catalog.songs[i.songId];message(lockMessage(s,catalog.groups[nav.group].careerTier));return;}if(i.disabled){message('Todavía no disponible: falta recuperar o verificar este componente.');return;}void audio.play('ui_sfx_select');const de=nav.screen;i.run();pasoEleccion(de);if(!frame)void render();}
function move(delta){
 if(espejo()||!items.length)return;
 if(nav.screen==='setlist'){
  // create_setlist_scrolling_menu: no_wrap. No reiniciar el documento en sus bordes.
  const next=nav.selected+delta,count=catalog.groups[nav.group].songs.length;
  if(next<0){if(nav.group===0)return;nav.group--;nav.selected=catalog.groups[nav.group].songs.length-1;}
  else if(next>=count){if(nav.group===catalog.groups.length-1)return;nav.group++;nav.selected=0;}
  else nav.selected=next;
 }else nav.selected=(nav.selected+delta+items.length)%items.length;
 void audio.play('ui_sfx_scroll');void render();
}
// career_menu_flow.qb: setlist -> escenario -> hub -> personaje -> dificultad -> banda -> menu.
const CARRERA_ATRAS={setlist:'venue',venue:'hub',hub:'chars',chars:'cdifficulty',cdifficulty:'band?',band:'main',bandname:'band?',outfits:'hub',guitars:'hub',gfinish:'guitars',store:'hub',confirm:'setlist',results:'setlist',unlock:'setlist'};
function back(){if(espejo())return;if(atrasEleccion())return;void audio.play('Generic_Menu_Back_SFX');if(nav.screen==='results'&&showStats){showStats=false;nav.selected=2;}else if(nav.screen==='options'&&optionPage!=='options'){if(capturandoTruco())terminarTruco();terminarLag(false);dejarStarPower();optionPage=['whammy','starpower'].includes(optionPage)?'controller':'options';nav.selected=0;}else if(nav.screen==='results'&&desbloqueos.length){salirResultados();}else if(careerMode&&CARRERA_ATRAS[nav.screen]){const de=nav.screen;nav.screen=CARRERA_ATRAS[de]==='band?'?(bandas.length?'band':'main'):CARRERA_ATRAS[de];nav.selected=de==='gfinish'?gsModelo:de==='setlist'?Math.max(0,venueTier??0):nav.screen==='cdifficulty'?Math.max(0,DIFS.indexOf(career.difficulty)):nav.screen==='band'?Math.max(0,bandaActual):0;if(de==='setlist'){venueTier=null;setCareerMode(true,true);}}else nav.dispatch('back');if(nav.screen==='main')setCareerMode(false);void render();}
function tier(delta){if(espejo())return;if(nav.screen==='store'){storeTab=storeTab==='personajes'?'guitarras':'personajes';nav.selected=0;void audio.play('ui_sfx_scroll');void render();}else if(nav.screen==='options'){optionAction(nav.selected,delta);void audio.play('ui_sfx_scroll');void render();}else if(nav.screen==='setlist'&&!careerMode){void audio.play('ui_sfx_scroll');const bonus=catalog.groups.findIndex(g=>g.id==='bonus');nav.group=delta>0?bonus:0;nav.selected=0;void render();}}
addEventListener('keydown',e=>{if(frame||!nav||e.repeat||teclaBloqueada())return;if(nav.screen==='bandname'&&!['Enter','Escape'].includes(e.key))return;lastInput='keyboard';const actions={ArrowUp:()=>move(-1),ArrowDown:()=>move(1),ArrowLeft:()=>tier(-1),ArrowRight:()=>tier(1),Enter:activate,' ':activate,Escape:back,Backspace:back};if(actions[e.key]){e.preventDefault();actions[e.key]();}});
function pollGamepad(){
 const g=Array.from(navigator.getGamepads?.()||[]).find(g=>g?.connected);if(!g){previousButtons.clear();return;}
 // Claude 05/11: guitarra PlayStation/Wii: verde (Cruz, 1) acepta y rojo (Círculo, 2) vuelve; las guitarras no navegan con ejes.
 const d=dispositivo(g),guitarra=d?.perfil==='guitarra',acepta=d?.tipo==='guitarra-hid'?1:0,vuelve=d?.tipo==='guitarra-hid'?2:1;
 const down=new Set(g.buttons.map((b,i)=>b.pressed?i:-1).filter(i=>i>=0));const edge=i=>down.has(i)&&!previousButtons.has(i);if(window.__gh3Relanzamiento?.bloqueado()||capturandoTruco()||calibrando()){previousButtons=down;lastAxis=Math.abs(g.axes[1]||0)>.6?Math.sign(g.axes[1]):0;return;}if(down.size||g.axes.some(a=>Math.abs(a)>.6))window.__gh3Relanzamiento?.entrada();
 if(down.size&&lastInput!=='gamepad'){lastInput='gamepad';void render();}
 if(edge(12))move(-1);else if(edge(13))move(1);else if(edge(14))tier(-1);else if(edge(15))tier(1);else if(edge(acepta)||edge(9))activate();else if(edge(vuelve))back();
 const axis=!guitarra&&Math.abs(g.axes[1]||0)>.6?Math.sign(g.axes[1]):0;if(axis&&axis!==lastAxis)move(axis);lastAxis=axis;previousButtons=down;
}
function startMenu(){clearInterval(menuTimer);previousButtons.clear();lastAxis=0;menuTimer=setInterval(pollGamepad,80);}
function launch(extra){
 if(online.active&&!extra?.online){online.elegir(nav.song,nav.difficulty);return;}
 const song=catalog.songs[nav.song];if(!available(song)||!song.difficulties.includes(nav.difficulty))return;
 tiersAlLanzar=careerFull?.groups.length||0;originalScreens?.leave();void audio.pause();session=crypto.randomUUID();primeSongAudio(globalThis,session);clearInterval(menuTimer);stage.hidden=true;
 if(!frame)try{parent.gh3Analytics?.song(nav.song);}catch{}
 frame=document.createElement('iframe');frame.title='GH3 Universal · Motor 0.6';frame.allow='autoplay; gamepad';
 const p=new URLSearchParams({paquete:song.package,cancion:song.id,dificultad:nav.difficulty,session,volume:String(settings.volume),modo:settings.mode||'simplificado',hud:'original'});
 if(extra?.online){p.set('online','1');if(online.modo==='coop'){p.set('coop','1');p.set('lado',online.host?'1':'2');}}if(coopLocal)p.set('coop','1');p.set('video','none');{let eq=escenaParams||'';const lr=extra?.online&&online.lookRival;if(lr?.modelo)eq+='&modelo2='+lr.modelo;if(lr?.guitarra)eq+='&guitarra2='+lr.guitarra;if(eq)p.set('escenaq',eq);}if(careerMode&&/^boss/.test(song.id))p.set('batalla','1');if(extra?.desafio)p.set('desafio','inaugural');
 frame.src='/gh3/juego/motor/'+settings.quality+'/index.html?'+p;document.body.append(frame);frame.onload=()=>frame?.contentWindow.focus();
}
addEventListener('message',e=>{
 if(e.origin!==location.origin||e.source!==frame?.contentWindow||e.data?.token!==session)return;
 if(e.data?.type==='gh3-settings'){Object.assign(settings,loadState());return;}
 if(e.data?.type!=='gh3-result')return;
 const {completed,result,total,photo}=e.data;if(lastResult?.photo)resources.images.delete(lastResult.photo);showStats=false;lastResult={completed:!!completed,result,total,photo,difficulty:nav.difficulty};
 online.terminar(result,completed,e.data.quit);
 if(result&&!e.data.quit)lastResult.saved=recordResult(settings,{song:nav.song,difficulty:nav.difficulty,quality:settings.quality,performance:catalog.songs[nav.song].performances[0]?.id??null,...lastResult,photo:undefined});
 if(careerMode&&completed&&!e.data.quit){const news=recordCareer(resources.qb,career,nav.song,nav.difficulty);
  if(plantel&&result?.base){const r=registrarCarrera(perfil,resources.qb['09C7313D'].Cash_System_rules,nav.song,nav.difficulty,result.puntos,result.base);news.unshift(r.estrellas+' estrellas'+(r.dinero?' · +$'+r.dinero:''));const est=careerStatus(resources.qb,career),t8=est[est.length-1].complete,cinco=est.every(t=>t.data.songs.filter(id=>!isBossSong(id)).every(id=>(perfil.estrellas[id]??0)>=5));const nuevas=habilitarGuitarras(perfil,plantel,nav.difficulty,t8,cinco);if(nuevas.length){news.push('Guitarra desbloqueada para comprar');desbloqueos.push(...nuevas);}}setCareerMode(true,true);careerNews=news;careerMovies=news.peliculas.filter(m=>!career.seen[m]);for(const m of careerMovies)career.seen[m]=1;saveCareer(career);}
 closeSongAudio(globalThis,session);frame.remove();frame=null;session=null;stage.hidden=false;nav.dispatch(e.data.quit?'setlist':'results');void audio.resume().then(()=>{if(completed)void audio.play('You_Rock_End_SFX');});startMenu();void render();
 if(careerMovies.length){const m=careerMovies;careerMovies=[];void playMovies(m).then(()=>render());}
});
try{
 await resources.init();await view.init();const availability=await fetch('/gh3/juego/api/availability').then(r=>r.json());catalog=baseCatalog=buildCatalog(resources.qb,availability);plantel=await loadPlantel().catch(()=>null);void paramsEscena().then(q=>{escenaParams=q;});nav=new Navigation(resources.qb);
 const previews=availability.previews&&Object.keys(availability.previews).length?availability.previews:await fetch('/gh3/juego/recovered/previews/index.json').then(r=>r.ok?r.json():{});audio.previews.index=Promise.resolve(previews);for(const song of Object.values(catalog.songs))song.preview=previews[song.id]??null;
 if(!availability.qualities.includes(settings.quality))settings.quality=availability.qualities[0]||'equilibrada';
 // Solo imágenes: ni audio ni videos ni WASM se solicitan al navegar.
 await resources.preload(['GH3_Main_Menu_BG','Main_Menu_illustrations','Setlist_BG_Head','Setlist_Page3_Head','Setlist_Page2_Head','Setlist_Page1_Head','Setlist_Page1_Loop','Setlist_Clip','Setlist_Page1_Title','Difficulty_1p_BG','difficulty_title_en','Venue_BG','Control_Pill_Fill','Setlist_Page1_Line_Red','Setlist_Page1_Head_Lines','Setlist_Page1_Line_Solid1','setlist_icon_BACKYARD']);
 await render();startMenu();try{parent.gh3Analytics?.once('game_started');}catch{}if(new URLSearchParams(location.search).has('sala'))setTimeout(()=>abrirOnline(new URLSearchParams(location.search).get('sala')),0);
 window.__gh3Relanzamiento?.listo({jugar:(id,dif)=>{if(frame)return false;nav.difficulty=dif;setCareerMode(false,true);if(!available(catalog.songs[id]))return false;nav.song=id;launch({desafio:true});return !!frame;},ocupado:()=>!!frame||drawing||redraw||stage.hidden,setlist:()=>{if(frame)return;setCareerMode(false,true);nav.screen='setlist';nav.group=0;nav.selected=0;void render();}});
}catch(e){message('No se pudo abrir el HUB: '+e.message);console.error(e);}

// Puente de ajustes para el contenedor del mismo origen; conserva el guardado de Universal.
window.__gh3Host={state:()=>({...settings,playing:!!frame}),set:(value)=>{
 if(Number.isFinite(value.volume))settings.volume=Math.min(1,Math.max(0,value.volume));
 if(['gh3','simplificado'].includes(value.mode)){settings.mode=value.mode;frame?.contentWindow.__motor?.modo(value.mode);}
 save();
}};

// Claude 05/11: CO-OP CAREER abre el Setlist en coop local de prueba (dos autopistas, misma guitarra). Quick Play lo apaga.
let coopLocal=false;
// Claude 05/11: CO-OP CAREER abre las salas coop; "Jugar en esta PC" sigue siendo el coop local.
async function abrirCoopLocal(){if(frame)return;const s=await elegirSala({modo:'coop',local:true});if(!s)return;if(!s.local){abrirOnline(s.codigo,s.modo);return;}coopLocal=true;setCareerMode(false);if(nav.screen==='main')nav.dispatch('select_quickplay');nav.dispatch('setlist');void render();}
addEventListener('keydown',e=>{if(!frame&&nav?.screen==='main')coopLocal=false;},true);
const avisoOnline=panelOnline(()=>{online.salir();if(frame){closeSongAudio(globalThis,session);frame.remove();frame=null;session=null;stage.hidden=false;nav.dispatch('setlist');void audio.resume();startMenu();void render();}avisoOnline('Online cerrado');});
const online=new Online({estado:avisoOnline,remoto:o=>{try{frame?.contentWindow?.__gh3Remoto?.(o);}catch{}},pausa:on=>{try{frame?.contentWindow?.__motor?.pausaRemota?.(on);}catch{}},seleccion:o=>{
 // Claude 08/11: reinicio del anfitrión: se cierra la canción en curso sin resultados y se vuelve a cargar la misma, sin pasar por la elección.
 if(o.reinicio&&frame){closeSongAudio(globalThis,session);frame.remove();frame=null;session=null;stage.hidden=false;nav.dispatch('setlist');}
 if(frame||!available(baseCatalog.songs[o.cancion])){online.salir();avisoOnline('No se pudo cargar la selección. Volvé a entrar.');return;}
 setCareerMode(false);nav.song=o.cancion;nav.difficulty=o.dificultad;if(o.reinicio){launch({online:true});return;}empezarEleccion(o);
}});
// Claude 08/11 (pedido de Santi): antes de tocar online, cada uno elige personaje y guitarra (SELECT YOUR HERO -> SELECT GUITAR).
// Al confirmar se manda 'nombre' con el look; la canción carga cuando los dos confirmaron. Atrás salta el paso.
let elige=null;
function empezarEleccion(o){if(!plantel){launch({online:true});return;}elige={ronda:o.ronda,yo:false,rival:false};nav.screen='chars';nav.selected=0;try{const pj=personajeActual(perfil,plantel),i=listaPerfil().findIndex(x=>x.nombre?.toLowerCase()===pj.nombre.toLowerCase());if(i>=0)nav.selected=i;}catch{}message('Elegí tu personaje y tu guitarra.');mostrarChip(online.nombreRival,false);void sincronizarLook().catch(()=>{}).then(()=>precargarEscena(urlPresenta()));void render();}
function irAGuitarras(){nav.screen='guitars';const a=guitarraActual(perfil,plantel);nav.selected=Math.max(0,modelosGuitarra().findIndex(m=>m.guitarras.some(g=>g.id===a.id)));}
function pasoEleccion(de){if(!elige||elige.yo||nav.screen!=='hub')return;if(de==='chars'){irAGuitarras();return;}if(de==='guitars'||de==='gfinish')confirmarEleccion();}
function atrasEleccion(){if(!elige||elige.yo||!['chars','guitars','gfinish'].includes(nav.screen))return false;void audio.play('Generic_Menu_Back_SFX');if(nav.screen==='chars')irAGuitarras();else if(nav.screen==='gfinish'){nav.screen='guitars';nav.selected=gsModelo;}else confirmarEleccion();void render();return true;}
async function confirmarEleccion(){if(!elige)return;elige.yo=true;nav.screen='setlist';try{await sincronizarLook();}catch{}online.send({t:'nombre',nombre:nombrePropio(),...(online.look||{})});ocultarChip();presentar();arrancarEleccion();void render();}
const urlPresenta=()=>{const lr=online.lookRival||{};let q=lookQ;if(lr.modelo)q+='&modelo2='+lr.modelo;if(lr.guitarra)q+='&guitarra2='+lr.guitarra;return '/gh3/juego/escena/index.html?cancion=slowride&fondo=1&online=1'+q;};
const presentar=(todos=!!elige?.rival)=>mostrarPresentacion({nombre:nombrePropio()||'VOS',...(online.look||{})},{nombre:online.nombreRival||'COMPAÑERO',...(online.lookRival||{})},todos,urlPresenta());
function arrancarEleccion(){if(!elige||!elige.yo||!elige.rival||elige.ronda!==online.ronda)return;presentar(true);const r=elige.ronda,t0=performance.now();let t0r=performance.now();elige=null;const ir=()=>{const t=performance.now()-t0;if(!escenaLista()&&t<6000){t0r=performance.now();setTimeout(ir,200);return;}if(performance.now()-t0r<5000){setTimeout(ir,200);return;}ocultarPresentacion();if(online.active&&online.ronda===r&&!frame)launch({online:true});};setTimeout(ir,200);}
window.__gh3Online={reiniciar:()=>{if(!online.active)return;if(!online.host){avisoOnline.chatLinea?.('','Solo '+(online.nombreRival||'el anfitrión')+' puede reiniciar la canción.','sis');return;}online.send({t:'reiniciar'});},pausa:on=>{if(online.active&&online.started&&online.modo==='coop')online.send({t:'pausa',ronda:online.ronda,on:!!on});},juego:o=>{if(online.active&&online.started)online.send({t:'ev',ronda:online.ronda,song:o.song,ev:o.ev});},listo:(token,signal)=>{if(token!==session)return Promise.reject(Error('Sesión vencida'));return online.listo(signal);}};
window.__gh3Revancha=()=>online.active&&online.ultima?{modo:online.modo,yo:!!online.revYo,rival:!!online.revRival,nombre:online.nombreRival,pedir:()=>online.pedirRevancha()}:null;
window.__gh3NombresOnline=()=>({yo:nombrePropio(),compa:online.nombreRival||'',lookYo:lookTxt(online.look),lookCompa:lookTxt(online.lookRival)});
online.alMenuRemoto=aplicarMenuRemoto;online.alSugerencia=id=>{const t=catalog.songs[id]?.title;if(t){avisoOnline.chatLinea?.('',(online.nombreRival||'Tu rival')+' sugiere: '+t,'sis');void audio.play('ui_sfx_scroll');}};online.alMenuHost=emitirMenu;
window.__gh3AbrirOnline=(codigo,modo)=>abrirOnline(codigo,modo);
async function abrirOnline(codigo,modo){void sincronizarLook();
 coopLocal=false;
 if(frame)return;
  if(!codigo){const s=await elegirSala();if(!s)return;codigo=s.codigo;modo=s.modo;}
 if(!nombrePropio()){const n=prompt('Tu nombre para el online (máx. 14 letras):','');if(n===null)return;guardarNombre(n||'JUGADOR');}
 if(modo)online.modoElegido=modo;
 online.alCortarEleccion=()=>{if(!elige)return;elige=null;ocultarPresentacion();if(['chars','guitars','gfinish'].includes(nav.screen))nav.screen='setlist';void render();};
online.alNombre=(n,lk)=>{if(elige&&elige.ronda===online.ronda){elige.rival=true;if(elige.yo)arrancarEleccion();else mostrarChip(n,true);}avisoOnline.nombre=n;avisoOnline.look=lk||"";try{frame?.contentWindow&&(frame.contentWindow.__gh3Nombres={yo:nombrePropio(),compa:n});}catch{}};
 try{
 codigo=codigo.trim().toUpperCase();if(!/^[A-Z]{5}$/.test(codigo))throw Error('El código debe tener cinco letras');
 setCareerMode(false);if(nav.screen==='main')nav.dispatch('select_quickplay');nav.dispatch('setlist');await render();await online.conectar(codigo);
 }catch(e){avisoOnline(e.message);}
}
setInterval(()=>{if(!online.active||!online.started)return;const j=frame?.contentWindow?.__motor?.juicio();if(!j)return;const rs=frame?.contentWindow?.__motor?.juicio?.()?.resumen?.();online.send({t:'estado',ronda:online.ronda,puntos:j.puntos,racha:j.racha,prec:rs?.precision??1,mult:rs?.mult??1,rock:Math.max(0,Math.min(1,j.concierto.rock/2)),energia:j.concierto.energia/100,activo:j.concierto.activo,fallida:j.concierto.fallida});},200);

