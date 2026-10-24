import {createClient} from '@supabase/supabase-js';
import {SUPABASE_URL,SUPABASE_ANON_KEY} from './config.js';
export class Online{
 constructor(callbacks){this.cb=callbacks;this.id=crypto.randomUUID();this.peer=null;this.ready=false;this.peerReady=false;this.offset=0;this.samples=[];this.lastPeer=0;this.connected=false;this.round=null;this.timer=setInterval(()=>this.tick(),500);}
 async connect(code,host,test=false){
  await this.leave();this.code=code;this.host=host;this.test=test;this.joined=Date.now();this.members=[];this.admitted=false;this.admission=new Promise((resolve,reject)=>{this.admitResolve=resolve;this.admitReject=reject;});this.admission.catch(()=>{});this.round=null;this.ready=false;this.peerReady=false;this.samples=[];
  if(test){this.bc=new BroadcastChannel('riff-duel-test-'+code);this.bc.onmessage=e=>this.receive(e.data);this.connected=true;this.send({t:'hello',host,name:this.cb.name()});this.cb.status('Prueba local · esperando rival');return;}
  this.client=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  const ch=this.channel=this.client.channel('riff-duel-v1-'+code,{config:{broadcast:{self:false,ack:true},presence:{key:this.id}}});
  ch.on('broadcast',{event:'duel'},({payload})=>this.receive(payload));
  ch.on('presence',{event:'sync'},()=>this.syncPresence());
  await new Promise((resolve,reject)=>{
   let done=false;const timeout=setTimeout(()=>{if(!done){done=true;reject(new Error('No pudimos conectar. Revisá internet y reintentá.'));}},12000);
   ch.subscribe(async status=>{if(done&&!this.connected&&status==='CLOSED')return;
    if(status==='SUBSCRIBED'){this.connected=true;await this.track();if(!done){done=true;clearTimeout(timeout);resolve();}}
    if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){this.connected=false;this.cb.status('Conexión interrumpida · volvé a entrar a la sala');if(this.round)this.cb.abort('Se cortó la conexión');if(!done){done=true;clearTimeout(timeout);reject(new Error('El servicio online no responde. Podés tocar en solitario.'));}}
   });
  });
  await Promise.race([this.admission,new Promise((_,reject)=>setTimeout(()=>reject(new Error('No se pudo confirmar tu lugar en la sala. Reintentá.')),8000))]);if(!this.connected)throw new Error('Sala completa: solo dos jugadores');this.cb.status(host?'Sala creada · compartí el link':'Conectado · esperando al anfitrión');
 }
 async track(){await this.channel?.track({id:this.id,name:this.cb.name(),host:this.host,joined:this.joined,ready:this.ready});}
 syncPresence(){
  const all=Object.values(this.channel.presenceState()).flat().filter(p=>typeof p.id==='string');
  const hosts=all.filter(p=>p.host).sort((a,b)=>a.joined-b.joined||a.id.localeCompare(b.id));const owner=hosts[0];
  const guests=all.filter(p=>!p.host).sort((a,b)=>a.joined-b.joined||a.id.localeCompare(b.id));const guest=guests[0];
  const seats=[owner,guest].filter(Boolean);
  if(all.some(p=>p.id===this.id)&&!seats.some(p=>p.id===this.id)){this.admitReject?.(new Error('Sala completa: solo dos jugadores'));this.cb.status('Sala completa: solo dos jugadores');this.leave();return;}
  if(seats.some(p=>p.id===this.id)){this.admitted=true;this.admitResolve?.();}const peer=seats.find(p=>p.id!==this.id);
  if(peer){clearTimeout(this.departureTimer);this.departureTimer=null;const changed=this.peer!==peer.id;this.peer=peer.id;this.peerName=peer.name;this.peerReady=!!peer.ready;this.lastPeer=performance.now();this.cb.peer(peer.name,this.peerReady);if(changed){this.samples=[];this.send({t:'hello',host:this.host,name:this.cb.name()});}this.maybeStart();}
  else if(this.peer&&!this.departureTimer){const missing=this.peer;this.departureTimer=setTimeout(()=>{this.departureTimer=null;const present=Object.values(this.channel?.presenceState()||{}).flat().some(p=>p.id===missing);if(present||this.peer!==missing)return;this.peer=null;this.peerReady=false;this.ready=false;this.track();this.cb.ready(false);this.cb.peer(null,false);if(this.round)this.cb.abort('Tu rival salió de la sala');this.round=null;},1500);}
 }
 send(data){if(!this.connected)return;const payload={...data,id:this.id,to:this.peer,v:1};if(this.bc)this.bc.postMessage(payload);else this.channel?.send({type:'broadcast',event:'duel',payload}).catch(()=>{});}
 receive(m){
  if(!m||m.v!==1||m.id===this.id||(m.to&&m.to!==this.id))return;
  if(m.t==='hello'&&(!this.peer||this.peer===m.id)){
   if(m.host===this.host)return;
   const changed=this.peer!==m.id;this.peer=m.id;this.peerName=String(m.name||'Rival').slice(0,24);this.lastPeer=performance.now();this.cb.peer(this.peerName,this.peerReady);
   if(changed)this.send({t:'hello',host:this.host,name:this.cb.name()});this.send({t:'ready',ready:this.ready});return;
  }
  if(m.id!==this.peer)return;this.lastPeer=performance.now();
  if(m.t==='ping')this.send({t:'pong',sent:m.sent,hostTime:Date.now()});
  if(m.t==='pong'&&!this.host&&Number.isFinite(m.sent)&&Number.isFinite(m.hostTime)){
   const rtt=Date.now()-m.sent;if(rtt>=0&&rtt<3000){this.samples.push({rtt,offset:m.hostTime-(m.sent+rtt/2)});this.samples=this.samples.slice(-12);this.offset=this.samples.reduce((a,b)=>a.rtt<b.rtt?a:b).offset;this.cb.latency(Math.round(rtt));}
  }
  if(m.t==='ready'&&!this.round){this.peerReady=!!m.ready;this.cb.peer(this.peerName,this.peerReady);this.maybeStart();}
  if(m.t==='start'&&!this.host&&this.ready&&m.song==='midnight-voltage-v1'&&typeof m.round==='string'&&Number.isFinite(m.at)){
   if(this.round?.id===m.round){this.send({t:'startAck',round:m.round});return;}
   if(m.at-(Date.now()+this.offset)<800){this.send({t:'late'});return;}
   this.peerReady=true;this.cb.peer(this.peerName,true);this.round={id:m.round,at:m.at,acked:true};this.send({t:'startAck',round:m.round});this.cb.start(m.at-this.offset,m.round);
  }
  if(m.t==='startAck'&&this.host&&this.round?.id===m.round)this.round.acked=true;
  if(m.t==='late'&&this.host&&this.round){this.send({t:'cancel'});this.cb.abort('La conexión llegó tarde. Marquen listo de nuevo.');this.resetRound();}
  if(m.t==='cancel'){this.cb.abort('El inicio se canceló. Marquen listo de nuevo.');this.resetRound();}
  if(m.t==='score'&&this.round?.id===m.round&&m.stats&&Number.isFinite(m.stats.score)&&m.stats.score>=0&&m.stats.score<1000000)this.cb.score(m.stats,!!m.finished);
  if(m.t==='bye'){if(this.round)this.cb.abort('Tu rival se desconectó');this.peer=null;this.ready=false;this.peerReady=false;this.round=null;this.cb.peer(null,false);}
 }
 async setReady(){if(!this.connected||!this.peer||this.round)return;this.ready=!this.ready;await this.track();this.send({t:'ready',ready:this.ready});this.cb.ready(this.ready);this.maybeStart();}
 maybeStart(){if(!this.host||!this.ready||!this.peerReady||this.round)return;const at=Date.now()+5000,id=crypto.randomUUID();this.round={id,at,acked:false};this.sendStart();this.cb.start(at,id);}
 sendStart(){this.send({t:'start',at:this.round.at,round:this.round.id,song:'midnight-voltage-v1'});}
 tick(){
  if(!this.connected)return;
  if(!this.peer&&this.test)this.send({t:'hello',host:this.host,name:this.cb.name()});
  if(this.peer){this.send({t:'ping',sent:Date.now()});if(!this.round)this.send({t:'ready',ready:this.ready});}
  if(this.host&&this.round&&!this.round.acked){
   if(Date.now()>this.round.at-1000){this.send({t:'cancel'});this.cb.abort('Tu rival no confirmó el inicio. Intenten otra vez.');this.resetRound();}
   else this.sendStart();
  }
  if(this.peer&&performance.now()-this.lastPeer>8000){this.cb.abort('Tu rival dejó de responder');this.peer=null;this.peerReady=false;this.ready=false;this.round=null;this.cb.peer(null,false);}
 }
 stats(stats,finished=false){if(this.round)this.send({t:'score',round:this.round.id,stats,finished});}
 resetRound(){this.round=null;this.ready=false;this.peerReady=false;this.track();this.send({t:'ready',ready:false});this.cb.ready(false);}
 async leave(){clearTimeout(this.departureTimer);this.departureTimer=null;this.send({t:'bye'});this.connected=false;this.bc?.close();this.bc=null;if(this.channel)await this.client.removeChannel(this.channel);this.channel=null;this.peer=null;this.ready=false;this.peerReady=false;this.round=null;}
}