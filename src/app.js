import {Engine} from './engine.js';
import {SONG,CHART,renderSong} from './song.js';
import {Online} from './online.js';
const $=id=>document.getElementById(id), params=new URLSearchParams(location.search), test=params.has('test');
const engine=new Engine(CHART), frets=new Set(), held=new Map(), colors=['#79d46a','#f25b6b','#f1cf61','#5aa5fa','#f49a50'];
let ctx,buffer,gain,source,audioStart=0,playing=false,duel=false,roundId=null,offset=0,lastSent=0,peerStats=null,peerFinished=false,feedbackUntil=0,lastFeedback='',calibrator=null;
try{$('name').value=localStorage.getItem('riff-name')||'Guitarrista';offset=Number(localStorage.getItem('riff-offset'))||0;}catch{}
$('offset').value=offset;$('offset-label').textContent=offset+' ms';
function status(s){$('status').textContent=s;}
function safeName(){return $('name').value.trim().slice(0,24)||'Guitarrista';}
const online=new Online({
 name:safeName,status,
 peer:(name,ready)=>{$('peer-name').textContent=name||'Esperando rival…';$('peer-ready').textContent=name?(ready?'Listo ✓':'Sin confirmar'):'—';$('rival-label').textContent=name||'RIVAL';$('ready').disabled=!name||playing;},
 ready:value=>{$('me-ready').textContent=value?'Listo ✓':'Sin confirmar';$('ready').textContent=value?'CANCELAR LISTO':'ESTOY LISTO';},
 latency:rtt=>{$('connection').textContent='● ONLINE · '+rtt+' ms';},
 start:(at,id)=>start(at,true,id),
 abort:reason=>{if(playing)stop(reason);status(reason);$('ready').disabled=!online.peer;},
 score:(stats,finished)=>{peerStats=stats;$('rival-score').textContent=Math.floor(stats.score).toLocaleString('es-AR');if(finished&&!playing&&duel)showResults();}
});
async function audio(){
 if(!ctx){ctx=new AudioContext();gain=ctx.createGain();gain.gain.value=Number($('volume').value)/100;gain.connect(ctx.destination);status('Preparando la canción…');buffer=renderSong(ctx);}
 await ctx.resume();if(ctx.state!=='running')throw new Error('Tocá un botón para habilitar el audio.');
}
function releaseAll(){held.clear();frets.clear();document.querySelectorAll('[data-lane]').forEach(b=>b.classList.remove('pressed'));}
function press(lane,key,down){
 if(down)held.set(key,lane);else held.delete(key);frets.clear();for(const l of held.values())frets.add(l);
 document.querySelectorAll('[data-lane]').forEach(b=>b.classList.toggle('pressed',frets.has(Number(b.dataset.lane))));
 if(down&&playing)engine.hit(songTime(),frets,false);
}
function songTime(){return ctx?ctx.currentTime-audioStart-offset/1000:0;}
function strum(){if(playing)engine.hit(songTime(),frets,true);}
function star(){if(playing)engine.activate(songTime());}
async function start(at=Date.now()+700,isDuel=false,id=null){
 try{await audio();}catch(e){status(e.message);return;}
 if(playing)return;
 if(at<Date.now()+100&&isDuel){online.send({t:'late'});status('El inicio llegó tarde. Volvé a marcar listo.');return;}
 clearInterval(calibrator);calibrator=null;source?.stop();releaseAll();engine.reset();peerStats=null;peerFinished=false;duel=isDuel;roundId=id;
 $('results').hidden=true;$('stop').hidden=false;$('solo').disabled=true;$('create').disabled=true;$('join').disabled=true;$('ready').disabled=true;
 $('mode').textContent=isDuel?'DUELO ONLINE / MISMA CANCIÓN':'ENSAYO / SOLITARIO';$('rival-score').textContent=isDuel?'0':'—';
 audioStart=ctx.currentTime+Math.max(.05,(at-Date.now())/1000);
 source=ctx.createBufferSource();source.buffer=buffer;source.connect(gain);source.start(audioStart);
 playing=true;if(innerWidth<700)document.querySelector('.stage').scrollIntoView({block:'start'});status(isDuel?'Duelo preparado · empezamos juntos':'Escuchá el pulso de entrada.');lastSent=0;
}
function stop(reason='Canción abandonada'){
 if(!playing)return;playing=false;source?.stop();source=null;releaseAll();$('overlay').hidden=false;$('overlay').querySelector('strong').innerHTML='VOLVÉ A<br>ENCENDERLO.';$('overlay').querySelector('p').textContent=reason;
 $('stop').hidden=true;$('solo').disabled=!!online.connected;$('create').disabled=!!online.connected;$('join').disabled=!!online.connected;status(reason);
}
function finish(){
 playing=false;source?.stop();source=null;releaseAll();$('stop').hidden=true;$('solo').disabled=!!online.connected;$('create').disabled=!!online.connected;$('join').disabled=!!online.connected;
 if(duel)online.stats(engine.snapshot(),true);showResults();status(duel?'Duelo terminado. Salí de la sala para armar otra sesión.':'Buena sesión. Podés volver a tocar.');
}
function showResults(){
 const s=engine.snapshot(),box=$('results');box.replaceChildren();box.hidden=false;
 const title=document.createElement('strong');title.textContent=duel&&peerStats&&peerFinished?(s.score===peerStats.score?'EMPATE DE GUITARRAS':s.score>peerStats.score?'EL ESCENARIO ES TUYO':'EL RIVAL SE LLEVÓ EL BIS'):'FIN DEL SET';box.append(title);
 const line=document.createElement('div');line.textContent=s.score.toLocaleString('es-AR')+' puntos · '+Math.round(s.hits/CHART.length*100)+'% de precisión · racha máxima '+s.best;box.append(line);
 if(duel){const other=document.createElement('div');other.textContent=peerStats&&peerFinished?'Rival: '+Math.floor(peerStats.score).toLocaleString('es-AR')+' puntos':'Esperando el resultado del rival…';box.append(other);}
 $('overlay').hidden=false;$('overlay').querySelector('strong').innerHTML='UN RIFF<br>MÁS.';$('overlay').querySelector('p').textContent='Tu resultado está debajo de la pista.';
}
async function connect(host){
 if(playing)return;try{
  await audio();status('Conectando la sala…');
  const code=host?Array.from(crypto.getRandomValues(new Uint8Array(8)),x=>x.toString(16).padStart(2,'0')).join('').toUpperCase():$('code').value.trim().toUpperCase();
  if(!/^[A-Z0-9-]{6,24}$/.test(code))throw new Error('Usá el código de la invitación (6 a 24 letras o números).');
  await online.connect(code,host,test);
  $('room').hidden=false;$('room-code').textContent=code;$('me-name').textContent=safeName()+' (vos)';$('me-ready').textContent='Sin confirmar';$('solo').disabled=true;$('create').disabled=true;$('join').disabled=true;$('name').disabled=true;
  const url=new URL(location.href);url.searchParams.set('room',code);history.replaceState(null,'',url);$('connection').textContent=test?'● PRUEBA LOCAL':'● ONLINE';status(host?'Sala creada. Copiá la invitación y esperá a tu amigo.':'En la sala. Ambos deben marcar “listo”.');
 }catch(e){await online.leave();status(e.message);$('connection').textContent='● SIN CONEXIÓN';}
}
$('solo').onclick=()=>start();$('create').onclick=()=>connect(true);$('join').onclick=()=>connect(false);$('ready').onclick=async()=>{try{await audio();await online.setReady();}catch(e){status(e.message);}};
$('leave').onclick=async()=>{if(playing)stop('Saliste del duelo');await online.leave();$('room').hidden=true;$('name').disabled=false;$('solo').disabled=false;$('create').disabled=false;$('join').disabled=false;$('connection').textContent='● SOLITARIO';$('rival-label').textContent='RIVAL';$('rival-score').textContent='—';const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);status('Podés crear una sala nueva o tocar en solitario.');};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);status('Invitación copiada. Mandásela a tu amigo.');}catch{status('Copiá la dirección del navegador para invitar.');}};
$('stop').onclick=()=>{if(duel){online.send({t:'cancel'});online.resetRound();}stop();$('ready').disabled=!online.peer;};
$('offset').oninput=()=>{offset=Number($('offset').value);$('offset-label').textContent=offset+' ms';try{localStorage.setItem('riff-offset',offset);}catch{}};
$('name').onchange=()=>{try{localStorage.setItem('riff-name',safeName());}catch{}};
$('volume').oninput=()=>{if(gain)gain.gain.value=Number($('volume').value)/100;};
$('calibrate').onclick=async()=>{
 if(playing){status('Calibrá antes de empezar la canción.');return;}
 await audio();clearInterval(calibrator);let count=0;const pulse=()=>{const osc=ctx.createOscillator(),g=ctx.createGain();osc.frequency.value=880;g.gain.setValueAtTime(.12,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.08);osc.connect(g);g.connect(gain);osc.start();osc.stop(ctx.currentTime+.1);$('calibrate').textContent='PULSO '+(++count);if(count===12){clearInterval(calibrator);calibrator=null;$('calibrate').textContent='ESCUCHAR PULSO';}};
 pulse();calibrator=setInterval(pulse,500);status('Escuchá el pulso y ajustá el desfase antes de tocar.');
};
const keys=['KeyA','KeyS','KeyD','KeyF','KeyG'];
addEventListener('keydown',e=>{
 if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName)||e.repeat)return;
 const lane=keys.indexOf(e.code);if(lane>=0){e.preventDefault();press(lane,e.code,true);}
 else if(['ArrowUp','ArrowDown','Enter'].includes(e.code)){e.preventDefault();strum();}
 else if(e.code==='Space'){e.preventDefault();star();}
});
addEventListener('keyup',e=>{const lane=keys.indexOf(e.code);if(lane>=0)press(lane,e.code,false);});
addEventListener('blur',releaseAll);
document.querySelectorAll('[data-lane]').forEach(b=>{
 const lane=Number(b.dataset.lane);b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);press(lane,'pointer'+e.pointerId,true);};
 for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,e=>press(lane,'pointer'+e.pointerId,false));
});
$('strum').onpointerdown=e=>{e.preventDefault();strum();};$('star').onclick=star;
let padPrevious=[];
function gamepad(){
 const pad=navigator.getGamepads?.()?.find(Boolean);if(!pad){if(padPrevious.some(Boolean)){for(let i=0;i<5;i++)press(i,'pad'+i,false);padPrevious=[];}return;}
 const values=pad.buttons.map(b=>b.pressed);
 for(let i=0;i<5;i++)if(values[i]!==padPrevious[i])press(i,'pad'+i,!!values[i]);
 if((values[12]&&!padPrevious[12])||(values[13]&&!padPrevious[13]))strum();if(values[5]&&!padPrevious[5])star();padPrevious=values;
}
const canvas=$('track'),c=canvas.getContext('2d');let w=0,h=0;
function resize(){const rect=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);w=rect.width;h=rect.height;canvas.width=w*dpr;canvas.height=h*dpr;c.setTransform(dpr,0,0,dpr,0,0);}
new ResizeObserver(resize).observe(canvas);
function position(lane,z){const factor=.16+.84*z,half=w*.44*factor;return {x:w/2-half+(lane+.5)*half*2/5,y:28+z*(h-65),width:half*2/5};}
function draw(time){
 c.clearRect(0,0,w,h);const topL=w*.4296,topR=w*.5704,bottomL=w*.06,bottomR=w*.94,y=h-37;
 c.beginPath();c.moveTo(topL,28);c.lineTo(topR,28);c.lineTo(bottomR,y);c.lineTo(bottomL,y);c.closePath();
 const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,'#1c1422');g.addColorStop(1,time<engine.starUntil?'#152833':'#1a1520');c.fillStyle=g;c.fill();
 c.strokeStyle='#654750';c.lineWidth=1;c.stroke();
 for(let lane=0;lane<=5;lane++){c.beginPath();c.moveTo(topL+(topR-topL)*lane/5,28);c.lineTo(bottomL+(bottomR-bottomL)*lane/5,y);c.strokeStyle=lane===0||lane===5?'#976845':'#ffffff17';c.stroke();}
 for(let beat=0;beat<10;beat++){const dt=beat*.5-((time% .5+.5)%.5),z=1-dt/3;if(z<0)continue;const p=position(0,z),q=position(4,z);c.beginPath();c.moveTo(p.x-p.width/2,p.y);c.lineTo(q.x+q.width/2,q.y);c.strokeStyle='#ffffff0d';c.stroke();}
 for(const note of engine.notes){
  const z=1-(note.time-time)/3;if(z<0||z>1.2)continue;
  if(note.state==='miss')continue;
  for(const lane of note.lanes){
   const p=position(lane,z),color=note.phrase!==null?'#f9dfa4':colors[lane];
   if(note.duration&&(note.state==='pending'||note.sustainUntil!==null)){
    const endZ=Math.max(0,1-(note.time+note.duration-time)/3),end=position(lane,endZ),tailStart=note.state==='hit'?position(lane,1):p;
    c.beginPath();c.moveTo(end.x-end.width*.07,end.y);c.lineTo(end.x+end.width*.07,end.y);c.lineTo(tailStart.x+tailStart.width*.08,tailStart.y);c.lineTo(tailStart.x-tailStart.width*.08,tailStart.y);c.closePath();c.fillStyle=color+'99';c.fill();
   }
   if(note.state!=='pending')continue;
   c.save();c.translate(p.x,p.y);c.scale(1,.48);c.shadowColor=color;c.shadowBlur=8;c.fillStyle='#100c15';c.beginPath();c.arc(0,0,p.width*.31,0,Math.PI*2);c.fill();c.lineWidth=3;c.strokeStyle=color;c.stroke();c.shadowBlur=0;c.fillStyle=color;c.beginPath();c.arc(0,0,p.width*.21,0,Math.PI*2);c.fill();if(note.hopo){c.fillStyle='#fff4e3';c.beginPath();c.arc(0,0,p.width*.10,0,Math.PI*2);c.fill();}c.restore();
  }
 }
 c.beginPath();c.moveTo(bottomL,y);c.lineTo(bottomR,y);c.strokeStyle='#eee0c299';c.lineWidth=2;c.stroke();
 for(let lane=0;lane<5;lane++){const p=position(lane,1);c.save();c.translate(p.x,p.y);c.scale(1,.5);c.shadowColor=colors[lane];c.shadowBlur=frets.has(lane)?22:0;c.beginPath();c.arc(0,0,p.width*.32,0,Math.PI*2);c.fillStyle=frets.has(lane)?colors[lane]:'#17121c';c.fill();c.strokeStyle=colors[lane];c.lineWidth=3;c.stroke();c.restore();}
}
function frame(now){
 gamepad();const time=playing?songTime():-1;
 if(playing){
  engine.update(time,frets);$('score').textContent=Math.floor(engine.score).toString().padStart(6,'0');$('streak').textContent=engine.streak;$('multiplier').textContent='×'+engine.multiplier(time);$('energy').style.width=engine.energy+'%';$('star').disabled=engine.energy<50||time<engine.starUntil;
  const left=Math.max(0,Math.ceil(SONG.duration-Math.max(0,time)));$('clock').textContent=String(Math.floor(left/60)).padStart(2,'0')+':'+String(left%60).padStart(2,'0');$('progress').style.width=Math.min(100,Math.max(0,time)/SONG.duration*100)+'%';
  if(time<0){$('overlay').hidden=false;$('overlay').querySelector('strong').textContent=String(Math.ceil(-time));$('overlay').querySelector('p').textContent=duel?'Empezamos juntos. Prepará los trastes.':'Prepará los trastes.';}else $('overlay').hidden=true;
  if(engine.feedback!==lastFeedback){lastFeedback=engine.feedback;feedbackUntil=now+650;}
  $('feedback').textContent=now<feedbackUntil?engine.feedback:'';
  if(duel&&now-lastSent>200){online.stats(engine.snapshot());lastSent=now;}
  if(time>=SONG.duration)finish();
 }else $('feedback').textContent='';
 draw(time);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if(params.get('room')){$('code').value=params.get('room').toUpperCase();status('Tenés una invitación. Elegí tu nombre y tocá la flecha para entrar.');}
if(test){document.title='PRUEBA LOCAL · Riff Duel';status('Modo de prueba local: conecta pestañas de este navegador.');}
window.riffDebug={engine,online,get playing(){return playing;},get songTime(){return songTime();},get roundId(){return roundId;}};
