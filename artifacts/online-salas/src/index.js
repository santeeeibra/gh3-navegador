// Salas efímeras: el estado vive en attachments y sobrevive a hibernación.
const json = o => JSON.stringify(o);
const difs = ['easy','medium','hard','expert'];
// Claude 05/11: 20 salas públicas fijas. 1-10 cara a cara, 11-20 coop.
const FIJAS = Array.from({length:20},(_,i)=>'SALA'+String.fromCharCode(65+i));
const limpiarNombre = n => typeof n === 'string' ? n.toUpperCase().replace(/[^A-Z0-9ÑÁÉÍÓÚÜ _-]/g,'').trim().slice(0,14) : '';
const modoFija = c => { const i=FIJAS.indexOf(c); return i<0?null:(i<10?'cara':'coop'); };
export default {
  async fetch(req, env) {
    const u = new URL(req.url);
    const origin = req.headers.get('Origin');
    // Claude 05/11: el juego en Pages (dominio, www y vistas previas *.lvh3.pages.dev) y local pueden abrir salas.
    const ok = o => o === u.origin || /^https:\/\/(www\.)?lasvegasherogame\.com$/.test(o) || /^https:\/\/([a-z0-9-]+\.)?lvh3\.pages\.dev$/.test(o) || /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(o);
    if (origin && !ok(origin)) return new Response('origen', {status:403});
    if (req.method !== 'GET') return new Response('método', {status:405});
    if (u.pathname === '/api/sala/debug') { const r=await env.SALAS.get(env.SALAS.idFromName(u.searchParams.get('n')||'SALAA')).fetch(new Request('https://interno/estado')); return new Response(r.status+' '+await r.text()); }
    if (u.pathname === '/api/sala/lista') {
      const salas=await Promise.all(FIJAS.map(async (codigo,i)=>{
        try{const r=await env.SALAS.get(env.SALAS.idFromName(codigo)).fetch(new Request('https://interno/estado'));const e=await r.json();return {codigo,numero:i+1,modo:modoFija(codigo),...e};}
        catch(e){return {codigo,numero:i+1,modo:modoFija(codigo),jugadores:0,jugando:false,error:String(e).slice(0,120)};}
      }));
      return Response.json({v:'nombres1',salas},{headers:{'Cache-Control':'no-store'}});
    }
    if (u.pathname === '/api/sala/nueva') {
      const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      for(let i=0;i<12;i++) {
        const bytes=crypto.getRandomValues(new Uint32Array(5));
        const codigo=Array.from(bytes,x=>letras[x%letras.length]).join('');if(codigo.startsWith('SALA'))continue;
        const r=await env.SALAS.get(env.SALAS.idFromName(codigo)).fetch(new Request('https://interno/reservar',{method:'POST'}));
        if(r.ok)return Response.json({codigo},{headers:{'Cache-Control':'no-store'}});
        if(r.status!==409)return new Response('No se pudo reservar',{status:503});
      }
      return new Response('No hay código disponible; reintentá',{status:503});
    }
    if (u.pathname === '/api/sala/chat' && req.headers.get('Upgrade')?.toLowerCase() === 'websocket') return env.SALAS.get(env.SALAS.idFromName('LOBBYCHAT')).fetch(new Request('https://interno/chat',req));
    const m = u.pathname.match(/^\/api\/sala\/([A-Z]{5})$/);
    if (!m || req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('solicitud', {status:400});
    return env.SALAS.get(env.SALAS.idFromName(m[1])).fetch(req);
  }
};
export class Sala2 {
  constructor(state) { this.state = state; }
  sockets() { return this.state.getWebSockets().filter(w => !w.deserializeAttachment()?.cerrado); }
  enviar(o, salvo) { for (const w of this.sockets()) if (w !== salvo) try { w.send(json(o)); } catch {} }
  async fetch(req) {
    const ruta=new URL(req.url).pathname;
    if(ruta === '/estado'){const t=this.sockets();return Response.json({vdo:3,nombres:t.map(w=>w.deserializeAttachment().nombre||'').filter(Boolean),jugadores:t.length,jugando:t.some(w=>['jugando','cargando'].includes(w.deserializeAttachment().fase))});}
    if(ruta === '/chat'){
      const todos=this.state.getWebSockets();if(todos.length>=60)return new Response('lleno',{status:503});
      const [a,b]=Object.values(new WebSocketPair());this.state.acceptWebSocket(b);
      b.serializeAttachment({chat:true,id:crypto.randomUUID(),nombre:'',ult:[]});
      b.send(json({t:'chat-hola',n:todos.length+1}));
      return new Response(null,{status:101,webSocket:a});
    }
    const codigo=ruta.match(/^\/api\/sala\/([A-Z]{5})$/)?.[1]??'';
    if(new URL(req.url).pathname === '/reservar' && req.method === 'POST') {
      const reservado=await this.state.storage.transaction(async tx=>{
        if(this.sockets().length || (await tx.get('vence')??0)>Date.now())return false;
        await tx.put('vence',Date.now()+30*60*1000);return true;
      });
      return new Response(null,{status:reservado?201:409});
    }
    if(!modoFija(codigo) && (await this.state.storage.get('vence')??0)<=Date.now() && !this.sockets().length)return new Response('Sala inexistente o vencida',{status:404});
    const sockets = this.sockets();
    if (sockets.length >= 2 || sockets.some(w => w.deserializeAttachment().fase === 'jugando')) return new Response('ocupada', {status:409});
    const [a,b] = Object.values(new WebSocketPair());
    this.state.acceptWebSocket(b);
    const id = crypto.randomUUID();
    b.serializeAttachment({id, anfitrion:sockets.length === 0, fase:'sala', listo:false});
    b.send(json({t:'hola', id, anfitrion:sockets.length === 0, modo:modoFija(codigo)}));
    if(modoFija(codigo)) await this.state.storage.put('modo',modoFija(codigo));
    const seleccion = sockets[0]?.deserializeAttachment().seleccion;
    if (seleccion) { const s=b.deserializeAttachment(); s.seleccion=seleccion; s.fase='cargando'; b.serializeAttachment(s); b.send(json({t:'lista',...seleccion})); }
    this.enviar({t:'jugadores', n:this.sockets().length});
    return new Response(null, {status:101, webSocket:a});
  }
  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > 2048) return;
    let o; try { o=JSON.parse(msg); } catch { return; }
    if (!o || typeof o !== 'object') return;
    const s=ws.deserializeAttachment();
    if (!s || s.cerrado) return;
    if (o.t === 'chat') {
      // Claude 05/11: chat de texto. Máx. 160 caracteres, 4 mensajes cada 8 s por conexión.
      const texto=typeof o.texto === 'string' ? o.texto.replace(/[\u0000-\u001f\u007f<>]/g,' ').replace(/\s+/g,' ').trim().slice(0,160) : '';
      if (!texto) return;
      const ahora=Date.now(), ult=(s.ult||[]).filter(x=>ahora-x<8000);
      if (ult.length>=4) return ws.send(json({t:'chat-lento'}));
      if (s.chat && typeof o.nombre === 'string') s.nombre=limpiarNombre(o.nombre);
      ws.serializeAttachment({...s,ult:[...ult,ahora]});
      const msg={t:'chat',id:s.id,nombre:s.nombre||'JUGADOR',texto,hora:ahora};
      for (const w of this.state.getWebSockets()) { const a=w.deserializeAttachment(); if (w !== ws && a && !a.cerrado && !!a.chat === !!s.chat) try { w.send(json(msg)); } catch {} }
      return;
    }
    if (s.chat) return;
    if (o.t === 'nombre') { const nombre=limpiarNombre(o.nombre), pk=v=>String(v||'').replace(/[^A-Za-z0-9_]/g,'').slice(0,32), modelo=pk(o.modelo), guitarra=pk(o.guitarra); ws.serializeAttachment({...s,nombre,modelo,guitarra}); this.enviar({t:'nombre',id:s.id,nombre,modelo,guitarra},ws); for (const w of this.sockets()) if (w!==ws) { const a=w.deserializeAttachment(); if (a.nombre) ws.send(json({t:'nombre',id:a.id,nombre:a.nombre,modelo:a.modelo||'',guitarra:a.guitarra||''})); } return; }
    if (o.t === 'hora' && Number.isFinite(o.cli)) return ws.send(json({t:'hora',srv:Date.now(),cli:o.cli}));
    if (o.t === 'chau') { this.webSocketClose(ws); ws.close(1000,'salida'); return; }
    if (o.t === 'lista' && s.anfitrion && !this.sockets().some(w=>['jugando','cargando'].includes(w.deserializeAttachment().fase)) && /^[a-z0-9_]{1,64}$/.test(o.cancion) && difs.includes(o.dificultad)) {
      const seleccion={cancion:o.cancion,dificultad:o.dificultad,modo:(await this.state.storage.get('modo'))||(o.modo==='coop'?'coop':'cara'), ronda:crypto.randomUUID()};
      for (const w of this.sockets()) w.serializeAttachment({...w.deserializeAttachment(),seleccion,listo:false,fase:'cargando'});
      this.enviar({t:'lista',...seleccion}); return;
    }
    // Claude 08/11: el anfitrión reinicia la canción en curso: ronda nueva con la misma canción para los dos (salta la elección).
    if (o.t === 'reiniciar' && s.anfitrion && s.seleccion && this.sockets().some(w=>['jugando','cargando','terminado'].includes(w.deserializeAttachment().fase))) {
      const seleccion={...s.seleccion,ronda:crypto.randomUUID()};
      for (const w of this.sockets()) w.serializeAttachment({...w.deserializeAttachment(),seleccion,listo:false,fase:'cargando'});
      this.enviar({t:'lista',...seleccion,reinicio:true}); return;
    }
    if (o.t === 'listo' && s.fase === 'cargando' && o.ronda === s.seleccion?.ronda) {
      ws.serializeAttachment({...s,listo:true});
      const todos=this.sockets();
      if (todos.length === 2 && todos.every(w => {const a=w.deserializeAttachment();return a.listo && a.seleccion?.ronda === o.ronda;})) {
        const goEpoch=Date.now()+3000;
        for (const w of todos) w.serializeAttachment({...w.deserializeAttachment(),fase:'jugando',goEpoch});
        this.enviar({t:'ir',goEpoch,...s.seleccion});
      }
      return;
    }
    // Claude 05/11: coop online, pulsaciones del compañero (máx. 32 por mensaje).
    // Claude 05/11: pedido de revancha; el anfitrión relanza la misma canción cuando los dos lo pidieron.
    // Claude 05/11: señalización de voz WebRTC. El audio va directo entre navegadores; acá solo pasa la oferta/respuesta/candidatos (máx. 12 KB).
    if (o.t === 'rtc' && ['oferta','respuesta','cand','hola','fin','hablando'].includes(o.k) && msg.length <= 12000) { this.enviar({t:'rtc',k:o.k,d:o.d ?? null,id:s.id},ws); return; }
    // Claude 08/11: el anfitrion muestra su pantalla y cursor de los menus al invitado (solo en la sala, nunca jugando/cargando).
    if (o.t === 'menu' && s.anfitrion && !['jugando','cargando'].includes(s.fase)) {
      const ahora=Date.now(); if (ahora-(s.ultimoMenu ?? 0)<40) return;
      const pk=(v,max)=>typeof v==='string'&&/^[a-z0-9_]+$/.test(v)?v.slice(0,max):'', n=v=>Number.isFinite(v)?Math.max(0,Math.min(999,v|0)):0;
      ws.serializeAttachment({...s,ultimoMenu:ahora});
      this.enviar({t:'menu',screen:pk(o.screen,16),group:n(o.group),selected:n(o.selected),song:pk(o.song,64),difficulty:pk(o.difficulty,8),page:pk(o.page,16)},ws); return;
    }
    // Claude 08/11: el invitado le sugiere una cancion al anfitrion (1 por segundo, solo en la sala).
    if (o.t === 'sugerir' && !s.anfitrion && !['jugando','cargando'].includes(s.fase) && typeof o.cancion === 'string' && /^[a-z0-9_]{1,64}$/.test(o.cancion)) {
      const ahora=Date.now(); if (ahora-(s.ultimaSug ?? 0)<1000) return;
      ws.serializeAttachment({...s,ultimaSug:ahora}); this.enviar({t:'sugerir',cancion:o.cancion},ws); return;
    }
    if (o.t === 'revancha' && !['jugando','cargando'].includes(s.fase)) { this.enviar({t:'revancha',id:s.id},ws); return; }
    if (o.t === 'ev' && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda && Number.isFinite(o.song) && Array.isArray(o.ev) && o.ev.length <= 32) {
      this.enviar({t:'ev',ronda:o.ronda,song:o.song,ev:o.ev},ws); return;
    }
    // Claude 08/11: pausa compartida en coop.
    if (o.t === 'pausa' && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda) { this.enviar({t:'pausa',ronda:o.ronda,on:o.on === true},ws); return; }
    if ((o.t === 'estado' || o.t === 'fin') && s.fase === 'jugando' && o.ronda === s.seleccion?.ronda) {
      const {puntos,racha,rock,energia}=o;const prec=Number.isFinite(o.prec)?Math.max(0,Math.min(1,o.prec)):null;
      if (![puntos,racha,rock,energia].every(Number.isFinite) || puntos<0 || puntos>1e9 || racha<0 || racha>1e6 || rock<0 || rock>1 || energia<0 || energia>1) return;
      const ahora=Date.now();
      if (o.t === 'estado' && ahora-(s.ultimo ?? 0)<180) return;
      ws.serializeAttachment({...s,ultimo:ahora,fase:o.t === 'fin'?'terminado':s.fase});
      this.enviar({t:o.t,ronda:s.seleccion.ronda,id:s.id,puntos,racha,rock,energia,activo:o.activo === true,fallida:o.fallida === true,prec,mult:Number.isFinite(o.mult)?Math.max(1,Math.min(8,o.mult|0)):1},ws);
    }
  }
  webSocketClose(ws) {
    const s=ws.deserializeAttachment(); if (!s || s.cerrado) return;
    ws.serializeAttachment({...s,cerrado:true});
    // Claude 05/11: el que queda es anfitrión aunque el rival se haya ido en plena canción, y se le avisa en el mismo mensaje
    // (antes solo se marcaba en el servidor: el cliente seguía creyéndose invitado y nadie podía elegir canción).
    for (const w of this.sockets()) { const a=w.deserializeAttachment(); w.serializeAttachment(a.fase !== 'jugando' ? {...a,anfitrion:true,listo:false,fase:'sala'} : {...a,anfitrion:true}); }
    this.enviar({t:'chau',id:s.id,anfitrion:true},ws);
  }
  webSocketError(ws) { this.webSocketClose(ws); try {ws.close(1011,'conexión');} catch {} }
}
