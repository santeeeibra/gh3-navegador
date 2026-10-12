import {openCache,get,put,prepare,validateManifest,loadChunk} from './cache.mjs';
import theme from './theme.mjs';
import {createControls} from './controls.mjs';
import {createLoadingView} from './loading.mjs';
import {selectedPackages,restoreSelection,populateSongOptions,renderSelectedSongs} from './songs.mjs';
import {createChartLoader} from './chart-loader.mjs';
import {activateChunkCache} from './network-cache.mjs';
import {createStagePrefetcher} from './stage-prefetch.mjs';
const $=id=>document.getElementById(id),mb=n=>(n/1048576).toFixed(1)+' MB';
const delivery=window.gh3LoaderConfig;
const control=$('dir').closest('.card');control.hidden=true;control.style.display='none';
const style=document.createElement('style');style.textContent='[hidden]{display:none!important} body:not(.loaderStarted) #gh3Row,body:not(.loaderStarted) #songBox,body:not(.loaderStarted) #c1Input{display:none!important}'+theme;document.head.append(style);
const main=document.querySelector('main'),heading=main.querySelector('h1'),intro=heading.nextElementSibling;
const hero=document.createElement('header');hero.className='hero';hero.innerHTML='<div><span class="eyebrow">GUITAR HERO III · LEGENDS OF ROCK</span><h1>Listo para el próximo riff.</h1><p class="note">El original, en el navegador. Prueba con gráficos parciales.</p></div><span class="localBadge">Prueba local</span>';heading.replaceWith(hero);intro.remove();
// Keep optional diagnostics available without placing them in the play flow.
const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Detalles de la prueba';details.append(summary);
$('checks').before(details);details.append($('checks'),$('log'));
details.append($('status').closest('.card'),$('songBox'));
if($('c1Input'))details.append($('c1Input'));
const panel=document.createElement('section');panel.className='card';panel.id='loaderPanel';
panel.innerHTML=`<span class="eyebrow">TU PRÓXIMA SESIÓN</span><h2>Preparar para jugar</h2><p class="intro note">Una primera carga. Después, tus canciones quedan guardadas en este navegador para la próxima vez.</p>
  <div class="trackList"><div><small>01</small><b>Slow Ride</b></div><div><small>02</small><b>Talk Dirty to Me</b></div><div><small>03</small><b>Hit Me with Your Best Shot</b></div><div><small>04</small><b>Story of My Life</b></div></div>
  <label>Canciones <select id="loaderSongs"><option value="first4">Las primeras cuatro</option><option value="slowride">Solo Slow Ride</option></select></label>
  <p class="note">Esta selección prepara los archivos. Los demás temas se eligen en los menús del juego, con los desbloqueos de tu partida. Su ejecución todavía está pendiente de prueba.</p>
  <div class="row"><button id="loaderPrepare" disabled>Preparar canciones</button><button id="loaderPause" disabled>Pausar preparación</button><button id="loaderPlay" disabled>Jugar</button></div>
  <div class="loadNumbers"><strong id="loaderPercent">0 %</strong><span id="loaderBytes">Esperando la lista de archivos</span></div><progress id="loaderProgress" max="1" value="0"></progress><p id="loaderStatus" role="status" aria-live="polite">Buscando los archivos de esta prueba…</p>
  <p class="note" id="loaderStorage">Los archivos quedan en este navegador. Borrar los datos del sitio también los borra.</p>`;
const lobby=document.createElement('div');lobby.id='loaderLobby';control.before(lobby);lobby.append(panel);
const guide=createControls();lobby.append(guide.element);$('status').textContent='Prepará las canciones para arrancar.';
const state=window.gh3Loader={ready:false,stats:null,error:null,misses:0};let db,m,prepared,abort,running=false;
const loading=createLoadingView($('r5Box'),state);const topline=document.createElement('div');topline.className='gameTopline';topline.hidden=true;topline.innerHTML='<span>Guitar Hero III · imagen original parcial</span><span id="gameState">Esperando</span>';lobby.after(topline);
const moveGuide=setInterval(()=>{const p=$('gh3Panel');if(!p||!document.body.classList.contains('loaderStarted'))return;p.querySelector('h3').textContent='Ajustes · teclas';p.insertBefore(guide.element,p.firstElementChild);clearInterval(moveGuide);},200);
const packageIds=()=>selectedPackages(m,$('loaderSongs').value);
const stagePrefetch=createStagePrefetcher({knownSong:id=>!!m?.packages[id]&&id!=='base',
  prepareSong:async(song,{signal,onProgress})=>(await prepare(db,m,[song],{signal,onProgress})).stats,
  onProgress:p=>{state.stagePrefetch=p;},onError:(e,song)=>{state.prefetchError={song,message:e.message};},
});
addEventListener('gh3stage',e=>{if(!delivery?.onDemand||!state.ready)return;loading.stage(e.detail);stagePrefetch.event(e.detail);});
addEventListener('pagehide',()=>stagePrefetch.destroy());
function fail(e){state.error=e.message;document.body.classList.toggle('loaderError',e.name!=='AbortError');$('loaderStatus').textContent=e.name==='QuotaExceededError'?'No hay espacio suficiente en el navegador. Liberá espacio y reintentá.':e.name==='AbortError'?'Preparación pausada. Podés retomarla sin repetir las partes guardadas.':e.message;}
async function loadManifest(){
  db=await openCache();
  try{const r=await fetch(delivery?.manifest||'/local-manifest.json',{cache:'no-store'});if(!r.ok)throw Error('No pude obtener la lista de archivos.');m=validateManifest(await r.json());await put(db,'meta','manifest',m);}
  catch(e){const old=await get(db,'meta','manifest');if(!old)throw e;m=validateManifest(old);$('loaderStatus').textContent='Usando la lista guardada. Se necesita el servidor para las partes que falten.';}
  const estimate=await navigator.storage.estimate();$('loaderStorage').textContent=`Archivos guardados en este navegador · espacio disponible aproximado: ${mb(Math.max(0,(estimate.quota||0)-(estimate.usage||0)))}. Borrar los datos del sitio también los borra.`;
  populateSongOptions($('loaderSongs'),m);renderSelectedSongs(panel.querySelector('.trackList'),m,$('loaderSongs').value);
  if(delivery?.onDemand){
    $('loaderSongs').closest('label').hidden=true;panel.querySelector('.trackList').hidden=true;
    panel.querySelector('h2').textContent='Entrar a Guitar Hero III';
    panel.querySelector('.intro').textContent='Tocá Jugar. Elegí el tema en los menús del juego: la previsualización usa solo las partes necesarias y el tema completo se prepara al abrir el nivel.';
    panel.querySelector('label').nextElementSibling.textContent=`Catálogo: ${Object.keys(m.packages).length-1} canciones. Se conservan los desbloqueos de tu partida. Prueba parcial: la ejecución completa de todos los temas todavía no está verificada.`;
    $('loaderPrepare').hidden=true;$('loaderPlay').disabled=false;
  }
  $('loaderPrepare').disabled=false;
  if(!state.error)$('loaderStatus').textContent='Listo para preparar las canciones. No hace falta elegir carpeta.';
}
async function prepareSelected(){
  if(running)return;running=true;state.error=null;state.ready=false;prepared=null;abort=new AbortController();document.body.classList.remove('loaderError');
  state.phase='preparing';$('loaderStatus').textContent='Revisando los archivos guardados…';
  $('loaderPrepare').disabled=$('loaderPlay').disabled=$('loaderSongs').disabled=true;$('loaderPause').disabled=false;
  try{
    if(m.delivery?.sharedCache)await activateChunkCache();
    const ids=delivery?.onDemand?['base']:packageIds();
    prepared=await prepare(db,m,ids,{signal:abort.signal,onProgress:p=>{
      state.stats=p;$('loaderProgress').value=p.total?p.done/p.total:1;
      $('loaderPercent').textContent=Math.floor(100*(p.total?p.done/p.total:1))+' %';$('loaderBytes').textContent=`${mb(p.done)} / ${mb(p.total)}`;
      $('loaderStatus').textContent=`${mb(p.cached)} reutilizados · ${mb(p.downloaded)} cargados ahora · ${p.path.split('/').at(-1)}`;
    }});
    // Also reuse dependencies discovered by the game on a previous visit. Blob
    // references stay disk-backed; the worker checks their hash before reading.
    const known=new Map(m.files.flatMap(f=>f.chunks.map(c=>[c.hash,c.size])));
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('chunks','readonly'),cursor=tx.objectStore('chunks').openCursor();
      cursor.onsuccess=()=>{const c=cursor.result;if(!c)return;const blob=c.value;if(blob instanceof Blob&&blob.size===known.get(c.key))prepared.chunks.set(c.key,blob);c.continue();};
      tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('No pude recuperar los archivos guardados.'));
    });
    // Chart reader retained from the playable page; only these tiny chart Files
    // are assembled. Full assets stay as separate cached Blob chunks.
    window.gh3LoaderFiles=m.files.filter(f=>/\/songs\/.*_song\.pak\.xen$/i.test(f.path)&&prepared.ids.includes(f.id)).map(f=>new File(f.chunks.map(c=>prepared.chunks.get(c.hash)),f.path));
    window.gh3LoaderMount={version:m.version,chunks:[...prepared.chunks],delivery:m.delivery,
      songFiles:delivery?.onDemand?Object.fromEntries(Object.entries(m.packages).filter(([id])=>id!=='base').map(([id,p])=>[id,p.files.map(i=>({...m.files[i],chunkSize:m.chunkSize}))])):undefined};
    picked=m.files.map(f=>({name:f.path,data:{gh3Local:true,...f,chunkSize:m.chunkSize}}));
    $('go').disabled=false;state.ready=true;state.phase='ready';state.stats=prepared.stats;$('loaderPlay').disabled=false;
    $('loaderProgress').value=1;$('loaderStatus').textContent=`Listo para jugar · ${mb(prepared.stats.cached)} reutilizados · ${mb(prepared.stats.downloaded)} cargados ahora.`;
    $('status').textContent='Canciones preparadas. Tocá Jugar.';
    await put(db,'meta','prepared',{version:m.version,packages:ids});
  }catch(e){fail(e);}finally{running=false;$('loaderPrepare').disabled=$('loaderSongs').disabled=false;$('loaderPause').disabled=true;if(delivery?.onDemand&&!state.ready)$('loaderPlay').disabled=false;}
}
$('loaderPrepare').onclick=prepareSelected;$('loaderPause').onclick=()=>abort?.abort();
$('loaderSongs').onchange=()=>{state.ready=false;$('loaderPlay').disabled=true;$('loaderStatus').textContent='Prepará la selección nueva para jugar. Elegí el tema dentro del menú del juego.';renderSelectedSongs(panel.querySelector('.trackList'),m,$('loaderSongs').value);};
$('loaderPlay').onclick=async()=>{
  if(!state.ready){if(!delivery?.onDemand)return;try{await window.r6ctx?.resume();}catch{}await prepareSelected();if(!state.ready)return;}
  try{await window.r6ctx?.resume();}catch{}
  state.manualNavigation=!!delivery?.onDemand||!['first4','slowride'].includes($('loaderSongs').value);
  $('loaderPlay').disabled=$('loaderPrepare').disabled=$('loaderSongs').disabled=true;document.body.classList.add('loaderStarted');topline.hidden=false;loading.start();
  // This is a play session, rather than the original ten-second diagnostic run.
  $('secs').value='86400';$('go').click();
  // The existing shortcut navigates specifically to Slow Ride. Other songs
  // remain selected through the original game menus, with its career unlocks.
  if(!delivery?.onDemand&&['first4','slowride'].includes($('loaderSongs').value))$('goSong').click();
  $('loaderStatus').textContent=state.manualNavigation?'Elegí la canción en los menús del juego. Se conservan los desbloqueos de tu partida.':'Arrancando el juego con los archivos preparados…';
  $('gh3Row')?.scrollIntoView({block:'start',behavior:'instant'});
};
// Keeps source of unexpected dependencies visible, without changing game state.
const W=window.Worker;window.Worker=function(...args){const w=new W(...args);w.addEventListener('message',e=>{
  loading.message(e.data||{});
  if(e.data?.type!=='localCache')return;const d=e.data;
  if(d.misses)state.misses=d.misses;
  if(d.fatal||d.error){state.error=d.fatal||d.error;$('loaderStatus').textContent=state.error;}
});w.addEventListener('error',e=>loading.fail('No se pudo continuar con el juego: '+e.message));return w;};
state.file=async name=>{
  const f=m.files.find(f=>f.path.toLowerCase()===name.toLowerCase());if(!f)throw Error('Archivo desconocido.');
  const stats={cached:0,downloaded:0},parts=[];for(let i=0;i<f.chunks.length;i++)parts.push(await loadChunk(db,m,f,i,stats));return new File(parts,f.path);
};
const chartLoader=createChartLoader({song:window.gh3Song,readFile:name=>state.file(name),
  decode:async(file,name,diff)=>gh3Song.parseSongPak(await gh3Song.inflateRaw(file),name,diff),
  onLoaded:chart=>{$('songStat').textContent=`Canción: ${m.packages[chart.name]?.title||chart.name} (${chart.diff}), ${chart.notes.length} notas.`;},
  onError:e=>{$('songStat').textContent='No pude leer las notas: '+e.message;},
});
state.loadChart=(name,diff)=>chartLoader.load(name,diff);
// The game's native rendering/judgment does not depend on this helper chart.
// It keeps the provisional road and song diagnostics correct after menu changes.
let observedSong=null;
setInterval(()=>{
  const name=window.songPak;if(!state.ready||!name||name===observedSong)return;
  observedSong=name;chartLoader.load(name).catch(()=>{if(observedSong===name)observedSong=null;});
},1000);
try{
  await loadManifest();
  const previous=await get(db,'meta','prepared');
  if(!delivery?.onDemand&&Array.isArray(previous?.packages)&&previous.packages.every(id=>m.packages[id])){$('loaderSongs').value=restoreSelection(m,previous.packages);renderSelectedSongs(panel.querySelector('.trackList'),m,$('loaderSongs').value);await prepareSelected();}
}catch(e){fail(e);}
