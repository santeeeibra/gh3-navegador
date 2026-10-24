export function createLoadingView(box,state){
  const el=document.createElement('section');el.id='gameLoading';el.hidden=true;el.setAttribute('aria-label','Progreso de carga del juego');
  el.innerHTML=`<div class="loadingContent"><span class="loadingMark"><i></i> <span id="loadPhase">Iniciando</span></span><h2 id="loadTitle">Preparando el juego</h2><p id="loadDetail">Los archivos ya están listos.</p><div class="loadingSteps" aria-hidden="true"><span></span><span></span><span></span><span></span></div><progress id="engineProgress" aria-label="Carga del programa" hidden></progress><div class="loadingFoot"><span id="loadElapsed">0 s de espera</span><span id="loadActivity">Esperando al juego</span></div><p id="loadWait" hidden></p><button type="button" id="loadRetry" hidden>Recargar y reintentar</button></div>`;
  box.append(el);const $=id=>el.querySelector('#'+id);$('loadRetry').onclick=()=>location.reload();
  let started=0,lastSignal=0,lastAdvance=0,lastKey='',engineReady=false,wasm=null,error=null,lastSong=null,wasPlaying=false,previousClock=null,previousClockSong=null;
  const mb=n=>(n/1048576).toFixed(1)+' MB';
  function start(){started=lastSignal=lastAdvance=performance.now();el.hidden=false;box.hidden=false;update();}
  function fail(message){error=message;state.error=message;document.body.classList.add('loaderError');update();}
  function stage(detail){
    previousClock=null;previousClockSong=null;
    state.stage=detail;
    if(detail.stage==='preview'){state.songLoad=null;wasPlaying=false;}
    if(detail.stage==='loadStart'||detail.stage==='levelConfirmed'){wasPlaying=false;state.songLoad=null;}
    update();previousClock=null;previousClockSong=null;
  }
  function message(m){
    if(!started)return;
    if(['log','mark','r5SongFrame','r5SongReport','g1eInput','engineLoad','localCache'].includes(m.type))lastSignal=performance.now();
    if(m.type==='engineLoad'){wasm=m;state.engine={loaded:m.loaded,total:m.total,done:m.done};}
    if(m.type==='g1eInput'||m.type==='mark'&&m.what==='wasm listo')engineReady=true;
    if(m.type==='exit')fail(m.code===0?'La prueba del juego terminó. Podés volver a iniciarla.':'El juego se detuvo: '+(m.what||m.code));
    if(m.type==='r5SongReport'&&m.data?.fatal)fail('No se pudo continuar con la imagen: '+m.data.fatal);
    if(m.type==='localCache'&&m.fatal)fail(m.fatal);  // guardar en caché falló (cuota, Brave/iPhone): no es fatal, el juego ya tiene la parte
    if(m.type==='songLoad'){
      lastSignal=performance.now();state.songLoad=m;
      if(m.error)fail('No se pudo preparar la canción: '+m.error);
    }
  }
  function update(){
    if(!started)return;
    const now=performance.now(),clock=window.gh3Song?.clock?.();
    const stageName=state.stage?.stage;
    const song=window.songPak;
    // Practice starts at a positive section clock and never emits songPlaying.
    const clockAdvancing=!!song&&song===previousClockSong&&Number.isFinite(previousClock)&&previousClock>0&&Number.isFinite(clock)&&clock>0&&clock>previousClock;
    previousClock=Number.isFinite(clock)?clock:null;previousClockSong=song;
    const playing=window.gh3Stage?stageName==='songPlaying'||stageName==='levelConfirmed'&&Number.isFinite(clock)&&clock<0||stageName!=='preview'&&clockAdvancing:Number.isFinite(clock)&&clock!==0;
    if(state.songLoad&&!state.songLoad.complete&&!error){
      const p=state.songLoad;el.hidden=false;state.phase='song';
      $('loadPhase').textContent='Preparando la canción';$('loadTitle').textContent='Entrando al nivel';
      $('loadDetail').textContent=`${mb(p.done)} de ${mb(p.total)} · ${Math.floor(100*(p.total?p.done/p.total:1))} %`;
      $('engineProgress').hidden=false;$('engineProgress').max=p.total||1;$('engineProgress').value=p.done;
      document.getElementById('gameState').textContent='Cargando canción';return;
    }
    if(state.manualNavigation&&engineReady&&(!song&&!['loadStart','levelConfirmed'].includes(stageName)||stageName==='preview')&&!error){el.hidden=true;state.phase='navigation';document.getElementById('gameState').textContent='Elegí el tema en el juego';return;}
    if(playing&&!error){el.hidden=true;wasPlaying=true;lastSong=song||lastSong;state.phase='playing';document.getElementById('gameState').textContent=clock<0?'Cuenta regresiva':'A tocar';document.getElementById('loaderStatus').textContent='Juego listo · archivos guardados en este navegador';return;}
    // Returning to menus is interactive; don't cover them with an endless loader.
    if(wasPlaying&&(!song||song===lastSong)&&!error){el.hidden=true;document.getElementById('gameState').textContent='Menús / pausa';return;}
    el.hidden=false;
    const nav=document.getElementById('navStat')?.textContent||'',title=window.navSeen?.title,menu=window.navSeen?.menu;
    const count=[...document.querySelectorAll('#songSteps li')].filter(li=>li.style.opacity).length;
    let stage=engineReady?(song?4:3):2,label,detail,phase;
    if(error){label='La carga se interrumpió';detail=error;phase='Necesita atención';}
    else if(!engineReady){label=wasm?.done?'Preparando el motor':'Cargando el programa';detail=wasm?.total?`${mb(wasm.loaded)} de ${mb(wasm.total)} · ${Math.floor(100*wasm.loaded/wasm.total)} %${wasm.done?' · preparando el motor':''}`:'El navegador está iniciando el programa del juego.';phase='Paso 2 de 4 · Motor';}
    else if(song||['loadStart','levelConfirmed'].includes(stageName)){label='Cargando la canción';detail='Preparando escenario, notas y sonido. La cuenta regresiva aparece cuando el juego está listo.';phase='Paso 4 de 4 · Canción';}
    else {label=menu?'Abriendo los menús':title?'Pasando los menús':'Iniciando Guitar Hero III';detail=nav||'El juego está abriendo sus recursos de arranque.';phase=`Paso 3 de 4 · ${menu?'Menú principal alcanzado':title?'Título alcanzado':'Inicio y menús'}${count?' · '+count+'/12 pasos alcanzados':''}`;}
    state.phase=error?'error':stage===2?'engine':stage===3?'navigation':'song';
    const key=JSON.stringify([stage,detail,wasm?.loaded,error]);if(key!==lastKey){lastAdvance=now;lastKey=key;}
    $('loadTitle').textContent=label;$('loadDetail').textContent=detail;$('loadPhase').textContent=phase;
    el.querySelectorAll('.loadingSteps span').forEach((s,i)=>{s.classList.toggle('done',i+1<stage);s.classList.toggle('current',i+1===stage);});
    $('engineProgress').hidden=stage!==2||!wasm?.total||!!error;if(wasm?.total){$('engineProgress').max=wasm.total;$('engineProgress').value=wasm.loaded;}
    $('loadElapsed').textContent=Math.floor((now-started)/1000)+' s de espera';
    const silence=Math.floor((now-lastSignal)/1000),stuck=Math.floor((now-lastAdvance)/1000);
    $('loadActivity').textContent=silence<5?'Recibiendo señales del juego':`Última señal hace ${silence} s`;
    $('loadWait').hidden=!!error||silence<20&&stuck<90;
    $('loadWait').textContent=silence>=20?`No llegan nuevas señales desde hace ${silence} s. Si sigue así, podés reintentar sin perder los archivos preparados.`:`Este paso lleva ${stuck} s sin avanzar. El juego sigue enviando señales; si no termina, podés reintentar.`;
    $('loadRetry').hidden=!error&&silence<20&&stuck<90;
    document.getElementById('gameState').textContent=phase;
  }
  setInterval(update,500);return {start,message,stage,fail,element:el};
}
