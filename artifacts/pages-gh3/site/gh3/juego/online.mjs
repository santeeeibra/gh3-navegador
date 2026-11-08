import {mostrarResultados} from './resultados-online.mjs';
import {Voz} from './voz-online.mjs';
import {barraCaras} from './caras-online.mjs';
export const epoch = () => performance.timeOrigin + performance.now();
export const audioStart = (current,go,offset,now=epoch()) => current + Math.max(.05,(go-now-offset)/1000);
export class Online {
 constructor({seleccion,estado,remoto,pausa,resultados=mostrarResultados}) {this.remoto=remoto;this.alPausa=pausa;this.modoElegido='cara';this.resultados=resultados;this.seleccion=seleccion;this.estado=estado;this.offset=0;this.best=Infinity;this.active=false;if(estado){estado.enviarChat=t=>this.decir(t);estado.vozActivar=()=>this.voz.activa?(this.voz.apagar(),false):this.voz.activar();estado.vozSilenciar=()=>this.voz.silenciar();}
  globalThis.__gh3OnlineCaras=()=>({yo:this.look?.modelo||'axel_1',rival:this.lookRival?.modelo||'axel_1',nombreYo:nombrePropio()||'VOS',nombreRival:this.nombreRival||''});
  this.voz=new Voz({send:o=>this.send(o),esHost:()=>this.host,estado:t=>this.estado?.vozEstado?.(t),nivel:(k,n)=>this.estado?.vozNivel?.(k,n)});}
 // Claude 05/11: chat de texto dentro de la sala (solo antes de arrancar la canción, para no molestar la partida).
 decir(t){t=String(t||'').trim().slice(0,160);if(!t)return false;if(this.ws?.readyState!==1){this.estado.chatLinea?.('','Chat sin conexión.','sis');return false;}this.send({t:'chat',texto:t});this.estado.carasChat?.('yo',t);this.estado.chatLinea?.(nombrePropio()||'VOS',t,'yo');return true;}
 // Claude 05/11: un solo paso visible y una instrucción, según el estado de la sala.
 guia(extra){
  const rival=this.nombreRival||'tu rival',coop=this.modoElegido==='coop';
  let paso,txt;
  if(!this.active){paso=0;txt='Elegí una sala para empezar.';}
  else if(this.started){paso=3;txt=coop?'¡A tocar en equipo con '+rival+'! Vos sos la autopista '+(this.host?'izquierda':'derecha')+'.':'¡A tocar! Ganá más puntos que '+rival+'.';}
  else if((this.n||1)<2){paso=1;txt='Esperando otro jugador. Tocá INVITAR y mandale el link.';}
  else if(this.ronda){paso=2;txt='Cargando la canción... arranca sola cuando los dos estén listos.';}
  else if(this.host){paso=2;txt=rival+' ya está. Elegí canción y dificultad en la lista.';}
  else {paso=2;txt=rival+' está eligiendo la canción. Esperá.';}
  this.estado.paso?.(paso,(extra?extra+' ':'')+txt,coop);
  this.estado.chatVer?.(this.active&&!this.started);
  this.estado.carasVer?.(this.active,{modelo:this.look?.modelo||'axel_1',nombre:nombrePropio()||'VOS'},(this.n||1)>=2?{modelo:this.lookRival?.modelo||'axel_1',nombre:this.nombreRival||'RIVAL'}:null);
 }
 send(o){if(o?.t==='estado')this.estado.carasJuego?.('yo',o,this.modo==='coop');if(this.ws?.readyState===1)this.ws.send(JSON.stringify(o));}
 // Claude 05/11: gesto final de las caras (una vez por ronda, cuando están los dos resultados).
 carasFinal(){if(this.local&&this.rival&&this.finCaras!==this.ronda){this.finCaras=this.ronda;this.estado.carasFinal?.(this.local,this.rival,this.modo==='coop');}}
 async conectar(codigo){
  this.salir();this.codigo=codigo;this.estado.sala?.(codigo);this.active=true;this.best=Infinity;
  const u=new URL('/api/sala/'+codigo,location.href);u.protocol=location.protocol==='https:'?'wss:':'ws:';
  const ws=this.ws=new WebSocket(u);
  // Claude 05/11: latido cada 25 s. Por el dominio (Pages Function) el socket se corta a los ~125 s sin tráfico (code 1006),
  // y entre 'lista' e 'ir' no pasa nada. 'hora' ya lo responde el servidor y solo puede mejorar el desfase.
  clearInterval(this.latido);this.latido=setInterval(()=>{if(this.ws!==ws){clearInterval(this.latido);return;}if(ws.readyState===1)this.send({t:'hora',cli:epoch()});},25000);
  ws.onmessage=e=>{if(this.ws!==ws)return;let o;try{o=JSON.parse(e.data);}catch{return;}
   if(o.t==='nombre'){this.nombreRival=o.nombre||'';this.lookRival={modelo:o.modelo||'',guitarra:o.guitarra||''};this.alNombre?.(this.nombreRival,lookTxt(this.lookRival));this.guia();}
   if(o.t==='rtc'){void this.voz.recibir(o);return;}
   if(o.t==='chat'){this.estado.carasChat?.('rival',o.texto);this.estado.chatLinea?.(o.nombre||this.nombreRival||'RIVAL',String(o.texto||''));return;}
   if(o.t==='chat-lento'){this.estado.chatLinea?.('','Vas muy rápido: esperá unos segundos.','sis');return;}
   if(o.t==='jugadores'){this.n=o.n;this.guia();if(this.host&&o.n>=2)setTimeout(()=>this.alMenuHost?.(),150);}
   if(o.t==='menu'&&!this.host){this.alMenuRemoto?.(o);}
   if(o.t==='sugerir'&&this.host){this.alSugerencia?.(o.cancion);}
   if(o.t==='hola'){this.send({t:'nombre',nombre:nombrePropio(),...(this.look||{})});this.host=o.anfitrion;if(o.modo)this.modoElegido=o.modo;this.n=this.host?1:2;this.guia();for(let i=0;i<5;i++)setTimeout(()=>{if(this.ws===ws)this.send({t:'hora',cli:epoch()});},i*150);}
   if(o.t==='hora'){const now=epoch(),rtt=now-o.cli;if(rtt<this.best){this.best=rtt;this.offset=o.srv-(o.cli+now)/2;}}
   if(o.t==='ev'&&o.ronda===this.ronda)this.remoto?.(o);
   if(o.t==='pausa'&&o.ronda===this.ronda){this.alPausa?.(!!o.on);this.estado.chatLinea?.('',(this.nombreRival||'Tu compañero')+(o.on?' pausó.':' siguió.'),'sis');}
   if(o.t==='lista'){this.estado.carasReiniciar?.();this.estado.rival?.(null);this.modo=o.modo==='coop'?'coop':'cara';this.local=this.rival=null;this.desconectado=false;this.resultados(null,null);this.ronda=o.ronda;this.go=null;this.ultima={cancion:o.cancion,dificultad:o.dificultad};this.revYo=this.revRival=false;this.started=false;this.guia();this.seleccion(o);}
   if(o.t==='ir'&&o.ronda===this.ronda){this.go=o.goEpoch;this.started=true;this.guia();this.resolve?.({goEpoch:o.goEpoch,offset:this.offset});this.cleanupWait();}
   if(o.t==='chau'){this.host=true;this.voz.colgarRival();this.desconectado=true;this.resultados(this.local,this.rival,true);this.n=1;this.nombreRival='';this.guia(this.started?'Tu rival salió; podés terminar la canción solo.':'Tu rival salió.');if(!this.started){this.alCortarEleccion?.();this.cancelar('El rival salió antes de empezar.');}}
   if(o.t==='revancha'){this.revRival=true;this.chequearRevancha();this.resultados(this.local,this.rival,this.desconectado);}
   if(o.t==='fin'&&o.ronda===this.ronda){this.rival=o;this.resultados(this.local,this.rival,this.desconectado);this.carasFinal();}
   if((o.t==='estado'||o.t==='fin')&&o.ronda===this.ronda)this.estado.rival?.(o,this.modo);
  };
  ws.onerror=()=>{if(this.ws===ws)this.estado('No se pudo conectar a la sala.');};
  ws.onclose=e=>{if(this.ws!==ws)return;clearInterval(this.latido);console.warn('[online] sala cerrada',e?.code,e?.reason||'');this.desconectado=true;this.resultados(this.local,this.rival,true);this.active=false;
   // Claude 05/11: si el motor estaba cargando o esperando al rival, "Volver a la sala" (terminar con quit) reabre esta misma sala.
   this.reabrir=this.ronda&&!this.started?this.codigo:null;
   this.cancelar('Se cortó la conexión con la sala.');this.estado(this.started?'Se cortó la conexión con la sala. Podés terminar la canción solo.':'Se cortó la conexión con la sala. Volvé a entrar.');};
 }
 terminar(result,completed,quit=false){
  if(quit&&this.reabrir&&!this.started){const c=this.reabrir,m=this.modoElegido;this.reabrir=null;setTimeout(()=>globalThis.__gh3AbrirOnline?.(c,m),0);return;}
  if(!this.ronda||this.local)return;
  this.local={puntos:result?.puntos??0,racha:result?.rachaMax??0,rock:0,energia:0,fallida:!completed||quit};
  this.send({t:'fin',ronda:this.ronda,...this.local});this.resultados(this.local,this.rival,this.desconectado);this.carasFinal();
 }
 pedirRevancha(){if(!this.active||!this.ultima||this.revYo)return;this.revYo=true;this.send({t:'revancha'});this.chequearRevancha();this.resultados(this.local,this.rival,this.desconectado);}
 chequearRevancha(){if(this.host&&this.revYo&&this.revRival&&this.ultima){this.revYo=this.revRival=false;this.elegir(this.ultima.cancion,this.ultima.dificultad);}}
 elegir(cancion,dificultad){if(this.host)this.send({t:'lista',cancion,dificultad,modo:this.modoElegido});else this.guia('La canción la elige '+(this.nombreRival||'el anfitrión')+'.');}
 listo(signal){return new Promise((resolve,reject)=>{
  if(!this.active||!Number.isFinite(this.best)){reject(Error('Sin conexión o reloj sincronizado. Volvé a entrar a la sala.'));return;}
  this.resolve=resolve;this.reject=reject;
  this.abort=()=>this.cancelar('Carga cancelada');this.signal=signal;signal.addEventListener('abort',this.abort,{once:true});
  this.timeout=setTimeout(()=>{this.reabrir=this.codigo;this.cancelar('El rival no terminó de cargar. Volvé a la sala.');},120000);
  if(signal.aborted){this.abort();return;}this.send({t:'listo',ronda:this.ronda});
 });}
 cleanupWait(){clearTimeout(this.timeout);this.signal?.removeEventListener('abort',this.abort);this.resolve=this.reject=null;}
 cancelar(text){this.reject?.(Error(text));this.cleanupWait();}
 salir(){this.alCortarEleccion?.();clearInterval(this.latido);this.reabrir=null;this.voz?.apagar(true);this.estado.carasVer?.(false);this.estado.chatVer?.(false,true);this.estado.rival?.(null);this.estado.sala?.(null);this.nombreRival='';this.cancelar('Saliste de la sala');const ws=this.ws;this.ws=null;ws?.close();this.active=false;this.started=false;this.ronda=null;this.local=this.rival=null;this.resultados(null,null);}
}
// Claude 05/11: barra de estado + tarjeta del rival (cara a cara) con rockómetro y juzgado (precisión).
// Claude 05/11: nombre del jugador (se guarda en este navegador).
export const nombrePropio=()=>{try{return localStorage.getItem('gh3NombreOnline')||'';}catch{return '';}};
export const guardarNombre=n=>{n=String(n||'').toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _-]/g,'').trim().slice(0,14);try{localStorage.setItem('gh3NombreOnline',n);}catch{}return n;};
export const lookTxt=l=>[l?.modelo&&l.modelo.replace(/_[0-9]+$/,""),l?.guitarra].filter(Boolean).map(s=>s.replace(/_/g," ").toUpperCase()).join(" · ");
export function rockHtml(rock){const r=Math.max(0,Math.min(1,rock??0.5));const col=r<1/3?'#ff4b3e':r<2/3?'#f5c542':'#4be37a';
 return '<div style="position:relative;height:14px;border-radius:7px;background:linear-gradient(90deg,#7a1410 0 33%,#7a6410 33% 66%,#146b2c 66%);border:2px solid #000;box-shadow:0 0 0 1px #c9a227"><div style="position:absolute;top:-4px;bottom:-4px;left:calc('+(r*100).toFixed(1)+'% - 3px);width:6px;border-radius:3px;background:'+col+';box-shadow:0 0 8px '+col+'"></div></div>';}
export function panelOnline(callback){
 const box=document.createElement('div');box.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:999999;display:flex;flex-wrap:wrap;justify-content:center;gap:8px 10px;align-items:center;background:#160e0eee;color:#f4ecd8;padding:8px 12px;font:600 14px system-ui,sans-serif;max-width:min(680px,94vw);font-size:16px;border:2px solid #c9a227;border-radius:8px';
 const status=document.createElement('span');status.style.cssText='flex-basis:100%;text-align:center;font:700 17px system-ui;color:#fff';const exit=document.createElement('button');exit.textContent='Salir de online';exit.style.cssText='font:700 13px system-ui;padding:5px 10px;background:#c9271f;color:#fff;border:2px solid #f5c542;border-radius:6px;cursor:pointer';exit.onclick=()=>callback('salir');const inv=document.createElement('button');inv.textContent='Invitar';inv.hidden=true;inv.style.cssText=exit.style.cssText+';background:#2a1a1c;border-color:#6b4a2a';inv.onclick=async()=>{ // Claude 08/11: invitar. Se comparte SOLO apodo (el que ya ve la sala), modo y código; link sin otros parámetros ni datos de la partida.
  const base=(()=>{try{return top.location.origin+top.location.pathname;}catch{return location.origin+'/gh3/';}})();
  const url=base+'?sala='+encodeURIComponent(f.codigo),nom=nombrePropio()||'Un amigo',modo=f.coop?'cooperativo':'cara a cara';
  const texto=nom+' te invita a tocar Guitar Hero III online ('+modo+'). Sala '+f.codigo+':';
  let r='';
  if(navigator.share&&matchMedia('(pointer:coarse)').matches){try{await navigator.share({title:'Guitar Hero III online',text:texto,url});r='Invitación enviada';}catch(e){if(e?.name==='AbortError')return;}}
  if(!r){try{await navigator.clipboard.writeText(texto+String.fromCharCode(10)+url);r='Invitación copiada';}catch{prompt('Copiá y mandá esto:',texto+String.fromCharCode(10)+url);r='Invitar';}}
  inv.textContent=r;setTimeout(()=>inv.textContent='Invitar',2500);};box.append(status,inv,exit);document.body.append(box);
 const card=document.createElement('div');card.hidden=true;card.style.cssText='position:fixed;right:12px;top:50%;transform:translateY(-50%);z-index:999999;width:190px;padding:12px 14px;background:linear-gradient(#1b1012ee,#0d0809ee);border:3px solid #ff4d8d;border-radius:10px;color:#f4ecd8;font:700 14px system-ui,sans-serif;flex-direction:column;gap:7px';document.body.append(card);
 const pasos=document.createElement('div');pasos.style.cssText='flex-basis:100%;justify-content:center;display:flex;flex-wrap:wrap;gap:4px;font:700 11px system-ui;letter-spacing:1px';
 const NOMBRES=['SALA','RIVAL','CANCIÓN','¡A TOCAR!'];const chips=NOMBRES.map((n,i)=>{const c=document.createElement('span');c.textContent=(i+1)+' '+n;c.style.cssText='padding:3px 8px;border-radius:4px;background:#2a1a1c;color:#8a7a62';pasos.append(c);return c;});
 box.prepend(pasos);
 box.style.display='none';
 const f=text=>{status.textContent=text;box.style.display=text?'flex':'none';ubicar();};
 f.paso=(n,text,coop)=>{chips.forEach((c,i)=>{c.style.background=i<n?'#1f4d2c':i===n?'#c9271f':'#2a1a1c';c.style.color=i<=n?'#fff':'#8a7a62';});box.style.display=n?'flex':'none';status.textContent=text;modoTag.textContent=coop?'COOP':'CARA A CARA';pasoActual=n;f.coop=!!coop;inv.style.boxShadow=n===1?'0 0 0 2px #ffd23f,0 0 12px #ffd23f':'none';inv.style.borderColor=n===1?'#ffd23f':'#6b4a2a';ubicar();};
 const modoTag=document.createElement('span');modoTag.style.cssText='font:700 11px system-ui;letter-spacing:1px;color:#ffd23f';pasos.append(modoTag);
 // Claude 05/11: chat de la sala, misma estética que el lobby (vino oscuro, borde dorado). Abajo a la izquierda, plegable.
 const chat=document.createElement('div');chat.style.cssText='position:fixed;left:12px;bottom:12px;z-index:999999;width:min(320px,calc(100vw - 24px));display:none;flex-direction:column;gap:6px;padding:10px 12px;background:#160e0eee;border:2px solid #c9a227;border-radius:8px;color:#f4ecd8;font:600 14px system-ui,sans-serif';
 const cab=document.createElement('button');cab.style.cssText='display:flex;justify-content:space-between;align-items:center;background:none;border:0;padding:0;color:#f5c542;font:700 12px system-ui;letter-spacing:1px;cursor:pointer;text-align:left';
 const cabTxt=document.createElement('span');cabTxt.textContent='CHAT DE LA SALA';const nuevos=document.createElement('span');nuevos.style.cssText='color:#5fe08a';cab.append(cabTxt,nuevos);
 const log=document.createElement('div');log.setAttribute('role','log');log.setAttribute('aria-live','polite');log.setAttribute('aria-label','Chat de la sala');log.style.cssText='height:clamp(80px,16vh,140px);overflow:auto;padding:8px 10px;background:#0c0708;border:2px solid #4b2f1b;border-radius:6px;font:500 14px/1.35 system-ui;overflow-wrap:anywhere';
 const fila=document.createElement('div');fila.style.cssText='display:flex !important;flex-wrap:nowrap;gap:8px';
 const ent=document.createElement('input');ent.maxLength=160;ent.placeholder='Escribile a tu rival';ent.autocomplete='off';ent.setAttribute('aria-label','Mensaje para la sala');ent.style.cssText='flex:1;min-width:0;width:auto;margin:0;box-sizing:border-box;padding:6px 8px;background:#0c0708;color:#f4ecd8;border:2px solid #4b2f1b;border-radius:6px;font:500 15px system-ui;outline:none';
 ent.onfocus=()=>ent.style.borderColor='#f5c542';ent.onblur=()=>ent.style.borderColor='#4b2f1b';
 const env=document.createElement('button');env.textContent='Enviar';env.style.cssText=exit.style.cssText+';background:#2a1a1c;border-color:#6b4a2a';
 fila.append(ent,env);chat.append(cab,log,fila);document.body.append(chat);
 let plegado=false,sinLeer=0;
 const plegar=v=>{plegado=v;if(chat.dataset.lugar==='juego')chat.style.width=v?'auto':'min(280px,calc(100vw - 16px))';log.style.display=v?'none':'';fila.style.setProperty('display',v?'none':'flex','important');cabTxt.textContent=(v?'+ ':'')+'CHAT DE LA SALA';if(!v){sinLeer=0;nuevos.textContent='';}};
 cab.onclick=()=>plegar(!plegado);
 const mandar=()=>{if(f.enviarChat?.(ent.value))ent.value='';};
 env.onclick=mandar;
 ent.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();mandar();}else if(e.key==='Escape')ent.blur();});
 ent.addEventListener('keyup',e=>e.stopPropagation());
 f.chatLinea=(nombre,texto,cls)=>{const d=document.createElement('div');if(cls==='sis'){d.style.cssText='color:#9d8f78;font-style:italic';}else{const n=document.createElement('span');n.style.cssText='font-weight:700;color:'+(cls==='yo'?'#5fe08a':'#f5c542');n.textContent=nombre+': ';d.append(n);}d.append(document.createTextNode(texto));log.append(d);while(log.childElementCount>60)log.firstChild.remove();log.scrollTop=log.scrollHeight;if(plegado&&cls!=='yo'){sinLeer++;nuevos.textContent=sinLeer+' nuevo'+(sinLeer>1?'s':'');}};
 f.chatVer=(v,vaciar)=>{if(vaciar)log.replaceChildren();if(!v&&document.activeElement===ent)ent.blur();chat.style.display=v?'flex':'none';ubicar();};
 // Claude 05/11: controles de voz en la barra de la sala (se ven también tocando). Medidores YO / RIVAL.
 const voz=document.createElement('span');voz.style.cssText='display:none;align-items:center;gap:6px';
 const bVoz=document.createElement('button');bVoz.textContent='Activar voz';bVoz.style.cssText=inv.style.cssText;
 const bMute=document.createElement('button');bMute.textContent='Silenciar';bMute.hidden=true;bMute.style.cssText=inv.style.cssText;
 const medidor=(et,col)=>{const w=document.createElement('span');w.style.cssText='display:inline-flex;align-items:center;gap:3px;font:700 10px system-ui;letter-spacing:1px;color:#cdbf9f';const b=document.createElement('i');b.style.cssText='display:block;width:34px;height:7px;background:#2a1a1c;border:1px solid #4b2f1b;border-radius:3px;overflow:hidden';const r=document.createElement('i');r.style.cssText='display:block;height:100%;width:0;background:'+col+';transition:width 60ms linear';b.append(r);w.append(et,b);w.hidden=true;return {w,r};};
 const mYo=medidor('YO','#5fe08a'),mRiv=medidor('RIVAL','#f5c542');
 const vEst=document.createElement('span');vEst.style.cssText='flex-basis:100%;text-align:center;font:500 12px system-ui;color:#cdbf9f';vEst.hidden=true;
 voz.append(bVoz,bMute,mYo.w,mRiv.w);box.insertBefore(voz,inv);box.append(vEst);
 bVoz.onclick=async()=>{bVoz.disabled=true;const on=await f.vozActivar?.();bVoz.disabled=false;bVoz.textContent=on?'Apagar voz':'Activar voz';bMute.hidden=mYo.w.hidden=mRiv.w.hidden=!on;bMute.textContent='Silenciar';};
 bMute.onclick=()=>{const m=f.vozSilenciar?.();bMute.textContent=m?'Hablar':'Silenciar';bMute.style.borderColor=m?'#ff6b5b':'#6b4a2a';};
 f.vozEstado=t=>{vEst.textContent=t;vEst.hidden=!t;if(!t){bVoz.textContent='Activar voz';bMute.hidden=mYo.w.hidden=mRiv.w.hidden=true;}};
 f.vozNivel=(k,n)=>{(k==='yo'?mYo:mRiv).r.style.width=Math.round(n*100)+'%';caras.hablar(k,n);};
 // Claude 05/11: barra de caras (personaje de cada jugador; la boca sigue la voz).
 const caras=barraCaras();
 f.carasVer=(v,yo,rival)=>{caras.ver(v);if(!v)return;caras.poner('yo',yo.modelo,yo.nombre);caras.poner('rival',rival?.modelo||'',rival?.nombre);};
 f.sala=codigo=>{voz.style.display=codigo&&navigator.mediaDevices&&window.RTCPeerConnection?'inline-flex':'none';f.codigo=codigo;inv.hidden=!codigo;if(!codigo)box.style.display='none';ubicar();};
 f.carasJuego=(l,o,c)=>{caras.juego(l,o,c);if(l==='yo')caras.animo('yo',o);};f.carasChat=(l,t)=>caras.chat(l,t);f.carasFinal=(a,b,c)=>caras.final(a,b,c);f.carasReiniciar=()=>caras.reiniciar();
 f.rival=(o,modo)=>{caras.animo('rival',o);if(o&&o.t==='estado')caras.juego('rival',o,modo==='coop');if(!o||modo==='coop'){card.hidden=true;card.style.display='none';return;}card.hidden=false;card.style.display='flex';const p=o.prec==null?'--':Math.round(o.prec*100)+'%';
  card.innerHTML='<div style="font:24px Impact,system-ui;color:#ff4d8d;letter-spacing:1px">'+(f.nombre||'RIVAL')+(o.t==='fin'?' · TERMINÓ':'')+'</div>'+(f.look?'<div style="font-size:12px;color:#cdbf9f;letter-spacing:1px">'+f.look+'</div>':'')+'<div style="font:30px Impact,system-ui;color:#fff">'+(o.puntos|0).toLocaleString('es')+'</div><div>x'+(o.mult||1)+' · Racha '+(o.racha|0)+'</div><div style="font-size:12px;color:#cdbf9f;letter-spacing:1px">ROCKÓMETRO</div>'+rockHtml(o.rock)+'<div style="font-size:12px;color:#cdbf9f;letter-spacing:1px">JUZGADO</div><div style="font:22px Impact,system-ui;color:#f5c542">'+p+' notas</div>'+(o.fallida?'<div style="color:#ff6b5b">SIN ROCK</div>':'');};
 // Claude 05/11: la barra de la sala va en la página de afuera, arriba del recuadro del juego, y el chat en el panel
 // de la derecha: no tapan la partida. Sin lugar afuera (pantalla completa, celular) la barra queda chica arriba
 // (tocando, solo los botones) y el chat abajo a la derecha, plegado.
 let casa=null,pasoActual=0;try{if(top!==self&&top.document.getElementById('r5Box'))casa=top.document;}catch{}
 const sinCssAjeno='white-space:nowrap;flex:0 0 auto;width:auto;min-width:0;min-height:0;height:auto;margin:0;text-transform:none;box-shadow:none;line-height:1.2;';
 for(const b of [exit,inv,bVoz,bMute,env])b.style.cssText=sinCssAjeno+b.style.cssText;cab.style.cssText=sinCssAjeno+cab.style.cssText;
 function estilo(compacto,tocando){
  Object.assign(box.style,{flexWrap:compacto?'nowrap':'wrap',padding:compacto?'4px 8px':'8px 12px',gap:compacto?'6px':'6px 10px',fontSize:compacto?'13px':'15px'});
  pasos.style.display=compacto?'none':'flex';pasos.style.flexBasis='auto';
  status.style.cssText=compacto?'order:-1;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:left;font:700 13px system-ui;color:#fff':'order:5;flex-basis:100%;text-align:center;font:700 15px system-ui;color:#fff';
  if(tocando)status.style.display='none';
  vEst.style.display=compacto?'none':'';vEst.style.flexBasis='auto';vEst.style.order='4';
  for(const b of [exit,inv,bVoz,bMute]){b.style.fontSize=compacto?'12px':'13px';b.style.padding=compacto?'3px 7px':'5px 10px';}
 }
 function ubicar(){
  const chica=innerHeight<520||innerWidth<760;
  card.style.transform='translateY(-50%)'+(chica?' scale(.68)':'');card.style.transformOrigin='right center';
  // Tocando, las caras van chicas arriba a la izquierda: abajo a los costados está el HUD de cada jugador.
  const cr=document.getElementById('gh3Caras');if(cr){const t=pasoActual===3;cr.style.top=t?'8px':'50%';cr.style.transform=t?'scale('+(chica?.42:.6)+')':'translateY(-50%)'+(chica?' scale(.68)':'');cr.style.transformOrigin=t?'left top':'left center';}
  const logo=v=>{for(const i of casa?.querySelectorAll('.hero img')||[])i.style.visibility=v?'':'hidden';};
  if(box.style.display==='none'&&chat.style.display==='none'){logo(true);return;}
  const W=casa?.defaultView,r5=casa?.getElementById('r5Box');
  const full=casa&&(casa.fullscreenElement||casa.webkitFullscreenElement||casa.body.classList.contains('rlPseudoFull'));
  const rect=r5&&!r5.hidden?r5.getBoundingClientRect():null;
  const libre=!!(rect&&!full&&rect.top>=36&&rect.width>200);
  const raiz=libre?casa.body:document.body;
  if(box.parentNode!==raiz)raiz.append(box);
  logo(!(libre&&box.style.display!=='none'));
  if(libre){
   let tramos=[[rect.left,rect.right]];
   for(const o of casa.querySelectorAll('#rlMobileBar button')){const q=o.getBoundingClientRect();if(!q.width||q.bottom<=0||q.top>=rect.top)continue;const a=q.left-10,b=q.right+10;tramos=tramos.flatMap(([x,y])=>b<=x||a>=y?[[x,y]]:[[x,a],[b,y]].filter(([u,v])=>v-u>60));}
   const [x0,x1]=tramos.sort((p,q)=>(q[1]-q[0])-(p[1]-p[0]))[0]||[rect.left,rect.right],alto=rect.top-6;
   estilo(false,false);
   Object.assign(box.style,{position:'fixed',transform:'',left:x0+'px',right:'auto',top:'auto',bottom:(W.innerHeight-rect.top+4)+'px',maxWidth:(x1-x0)+'px',maxHeight:'',overflow:'hidden'});
   if(box.offsetHeight>alto||x1-x0<520)estilo(true,false);
   box.style.maxHeight=alto+'px';
  }else{
   estilo(true,pasoActual===3);
   Object.assign(box.style,{position:'fixed',left:'50%',right:'auto',top:'4px',bottom:'auto',transform:'translateX(-50%)',maxWidth:'min(680px,94vw)',maxHeight:'',overflow:'hidden'});
  }
  const panel=casa?.getElementById('gh3Panel'),pr=panel?.getBoundingClientRect();
  const enPanel=libre&&pr&&pr.width>220&&pr.height>200&&pr.left>=0&&pr.right<=W.innerWidth+1;
  if(enPanel){
   if(chat.parentNode!==panel)panel.prepend(chat);
   Object.assign(chat.style,{position:'relative',left:'auto',right:'auto',bottom:'auto',width:'auto',margin:'0 0 10px',boxSizing:'border-box'});log.style.height='clamp(70px,14vh,130px)';
   if(chat.dataset.lugar!=='panel'){chat.dataset.lugar='panel';plegar(false);}
  }else{
   if(chat.parentNode!==document.body)document.body.append(chat);
   Object.assign(chat.style,{position:'fixed',left:'8px',right:'auto',bottom:'8px',width:plegado?'auto':'min(280px,calc(100vw - 16px))',margin:'0',boxSizing:'border-box'});log.style.height='clamp(56px,20vh,120px)';
   if(chat.dataset.lugar!=='juego'){chat.dataset.lugar='juego';plegar(true);}
  }
 }
 addEventListener('resize',ubicar);
 if(casa){const W=casa.defaultView;W.addEventListener('resize',ubicar);W.addEventListener('scroll',ubicar,{passive:true,capture:true});casa.addEventListener('fullscreenchange',ubicar);casa.addEventListener('webkitfullscreenchange',ubicar);
  try{const ro=new W.ResizeObserver(()=>ubicar());for(const id of ['r5Box','gh3Panel']){const el=casa.getElementById(id);if(el)ro.observe(el);}}catch{}
  addEventListener('pagehide',()=>{for(const i of casa.querySelectorAll('.hero img'))i.style.visibility='';if(box.ownerDocument===casa)box.remove();if(chat.ownerDocument===casa)chat.remove();});}
 return f;
}
