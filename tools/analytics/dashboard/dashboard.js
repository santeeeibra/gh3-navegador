(()=>{
  const ENDPOINT='https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-analytics-dashboard';
  const labels={page_view:'Visitaron',play_clicked:'Tocaron Jugar',assets_ready:'Prepararon recursos',game_started:'Arrancaron el juego',song_started:'Iniciaron canción'};
  const $=id=>document.getElementById(id);
  const login=$('login'),dashboard=$('dashboard'),form=$('loginForm'),error=$('loginError'),days=$('days');
  const tokenKey='lvh-analytics-admin-token';
  // La sesión queda guardada en este navegador hasta tocar «Salir».
  const cookieName='lvh_admin';
  const cookieGet=()=>{try{const m=document.cookie.match(new RegExp('(?:^|; )'+cookieName+'=([^;]*)'));return m?decodeURIComponent(m[1]):'';}catch{return '';}};
  const cookieSet=value=>{try{document.cookie=cookieName+'='+(value?encodeURIComponent(value):'')+'; path=/estadisticas/; max-age='+(value?31536000:0)+'; SameSite=Strict; Secure';}catch{}};
  const store={get:()=>{let v='';try{v=localStorage.getItem(tokenKey)||'';}catch{}return v||cookieGet();},set:value=>{try{localStorage.setItem(tokenKey,value);}catch{}cookieSet(value);},clear:()=>{try{localStorage.removeItem(tokenKey);}catch{}cookieSet('');}};
  const number=value=>new Intl.NumberFormat('es-AR').format(Number(value)||0);
  const duration=seconds=>seconds==null?'Sin datos':seconds<60?`${seconds} s`:`${Math.floor(seconds/60)} min ${seconds%60} s`;
  const clear=node=>{while(node.firstChild)node.firstChild.remove();};
  const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
  const iconPaths={
    pulse:'M2 12h4l3-8 5 16 3-8h5',grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
    users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-4 M16 3a4 4 0 0 1 0 8',
    history:'M3 5v5h5 M3 10a9 9 0 1 1 2 8 M12 7v5l3 2',message:'M21 11a8 8 0 0 1-8 8H7l-5 3 2-6a8 8 0 1 1 17-5 M7 9h9 M7 13h6',
    refresh:'M20 7v5h-5 M4 17v-5h5 M5 7a8 8 0 0 1 13-2l2 2 M4 17l2 2a8 8 0 0 0 13-2',logout:'M9 4H4v16h5 M9 12h13 M17 7l5 5-5 5',
    filter:'M3 4h18l-7 8v7l-4 2v-9z',check:'M5 12l4 4L19 6',search:'M21 21l-5-5 M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16',
    trend:'M3 17l6-6 4 4 8-10 M15 5h6v6',funnel:'M3 5h18 M6 10h12 M9 15h6 M11 20h2',desktop:'M3 3h18v13H3z M8 21h8 M12 16v5',
    phone:'M7 2h10v20H7z M10 18h4',tablet:'M4 2h16v20H4z M11 18h2',globe:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M3 12h18 M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18',
    music:'M9 18V5l12-3v14 M9 15c-7-2-8 7-1 6l1-3 M21 13c-7-2-8 7-1 6l1-3',shield:'M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6',
    play:'M8 4l12 8-12 8z',clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0 M12 7v5l3 2',download:'M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5',
    alert:'M12 3L2 21h20z M12 9v5 M12 17h.01',location:'M19 9c0 5-7 12-7 12S5 14 5 9a7 7 0 0 1 14 0 M15 9a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    star:'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',robot:'M4 7h16v14H4z M12 7V3 M9 3h6 M8 12h.01 M16 12h.01 M8 17h8',link:'M10 13a5 5 0 0 0 7 0l4-4a5 5 0 0 0-7-7l-2 2 M14 11a5 5 0 0 0-7 0l-4 4a5 5 0 0 0 7 7l2-2'
  };
  const svgNode=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
  function icon(name){const svg=svgNode('svg',{viewBox:'0 0 24 24',class:'icon','aria-hidden':'true',focusable:'false'});svg.append(svgNode('path',{d:iconPaths[name]||iconPaths.pulse}));return svg;}
  document.querySelectorAll('[data-icon]').forEach(node=>node.append(icon(node.dataset.icon)));
  document.querySelectorAll('.app-bar nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelectorAll('.app-bar nav a').forEach(node=>node.removeAttribute('aria-current'));link.setAttribute('aria-current','location');}));
  const palette=['#ee8a9f','#ddbd86','#94b9ee','#8fcfba','#b69dd9','#b3b1b8'];
  const sourceLabels={direct:'Acceso directo',x:'X / Twitter',google:'Google',facebook:'Facebook',instagram:'Instagram',whatsapp:'WhatsApp',tiktok:'TikTok',youtube:'YouTube',email:'Correo',other:'Otros enlaces'};
  const eventIcons={page_view:'globe',play_clicked:'play',assets_ready:'download',game_started:'check',song_started:'music',session_ended:'logout',load_error:'alert',runtime_error:'alert',cache_fallback:'shield',load_cancelled:'clock',performance_sample:'pulse'};
  const categoryLabels={general:'Experiencia general',performance:'Fluidez / lentitud',audio:'Sonido',controls:'Controles',loading:'Carga',graphics:'Imagen / gráficos',suggestion:'Sugerencia',other:'Otro problema'};
  const deviceLabels={phone:'Celular',tablet:'Tablet',desktop:'PC',unknown:'Dispositivo desconocido'};
  const actorLabels={santi:'Prueba · Santi',codex:'Prueba · Codex',claude:'Prueba · Claude',automation:'Prueba · Automatización sin autor',unknown:'Sin identificar'};
  try{const saved=localStorage.getItem('gh3-test-profile');$('testProfile').value=['santi','codex','claude'].includes(saved)?saved:'unknown';}catch{}
  $('profileStatus').textContent='La marca se aplica a las próximas visitas al juego.';
  $('saveProfile').addEventListener('click',()=>{
    try{const value=$('testProfile').value;
      if(value==='unknown')localStorage.removeItem('gh3-test-profile');else localStorage.setItem('gh3-test-profile',value);
      sessionStorage.removeItem('gh3-analytics-session');
      $('profileStatus').textContent=`Guardado: ${actorLabels[value]}. Abrí o recargá el juego para aplicar la marca.`;
    }catch{$('profileStatus').textContent='El navegador no permitió guardar la marca. Usá el enlace de prueba indicado en las instrucciones locales.';}
  });
  let feedbackRows=[];
  const zone='America/Argentina/Buenos_Aires';
  const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
  const activityLabels={page_view:'Entrada a la página',play_clicked:'Intento de jugar',assets_ready:'Recursos preparados',game_started:'Motor iniciado',song_started:'Canción iniciada',session_ended:'Visita terminada',load_error:'Error de carga',cache_fallback:'Caché alternativa · continúa',runtime_error:'Error durante el juego',performance_sample:'Muestra de rendimiento',load_cancelled:'Preparación pausada'};
  let activityOffset=null,activityUntil=null,activityCount=0,activityRequest=0;
  $('activityDate').value=localDate(Date.now());


  // ── Quién usó la página y cada visita paso a paso ──
  const actorOrder=['santi','claude','codex','automation','unknown'];
  const actorInfo={santi:{name:'Santi',short:'S',color:'#ddbd86'},claude:{name:'Claude',short:'Cl',color:'#e8956b'},codex:{name:'Codex',short:'Cx',color:'#94b9ee'},automation:{name:'Robot sin autor',short:'A',color:'#b3b1b8'},unknown:{name:'Sin marca',short:'?',color:'#ee8a9f',note:'posibles jugadores'}};
  const actorOf=m=>actorOrder.includes(m?.tester)?m.tester:'unknown';
  const ago=value=>{const s=Math.max(0,Math.round((Date.now()-new Date(value))/1000));return s<60?'hace instantes':s<3600?`hace ${Math.floor(s/60)} min`:s<86400?`hace ${Math.floor(s/3600)} h`:`hace ${Math.floor(s/86400)} d`;};
  const clock=value=>new Date(value).toLocaleTimeString('es-AR',{timeZone:zone,hour12:false,hour:'2-digit',minute:'2-digit'});
  const avatar=actor=>{const a=el('span','avatar',actorInfo[actor].short);a.style.setProperty('--actor',actorInfo[actor].color);a.setAttribute('aria-hidden','true');return a;};

  function renderActors(data){
    const host=$('actorCards');clear(host);
    const rows=new Map((data.actors||[]).map(row=>[row.actor,row]));
    if(!data.actors){host.append(el('p','empty','El servidor todavía no separa por autor (falta publicar la versión nueva).'));}
    else for(const actor of actorOrder){
      const row=rows.get(actor)||{sessions:0,game_started:0,songs:0,errors:0},info=actorInfo[actor];
      const card=el('article',`actor-card${row.sessions?'':' is-empty'}`);card.style.setProperty('--actor',info.color);
      const top=el('div','actor-top');const name=el('div');name.append(el('strong','',info.name),el('small','',row.last_at?`Última vez ${ago(row.last_at)}`:(info.note||'Sin actividad')));top.append(avatar(actor),name);
      const stats=el('div','actor-stats');for(const [label,value] of [['visitas',row.sessions],['jugaron',row.game_started],['temas',row.songs],['errores',row.errors]]){const b=el('span');b.append(el('b','',number(value)),document.createTextNode(label));if(label==='errores'&&value)b.className='bad';stats.append(b);}
      card.append(top,stats);host.append(card);
    }
    const chartHost=$('actorDaily');clear(chartHost);const legend=$('actorLegend');clear(legend);
    const days=(data.daily||[]).slice(-30);
    if(!days.some(d=>d.by_actor&&Object.keys(d.by_actor).length)){chartHost.append(el('p','empty','Sin datos por autor en este período.'));return;}
    const w=760,h=150,p={l:28,r:6,t:8,b:22},max=Math.max(1,...days.map(d=>Object.values(d.by_actor||{}).reduce((a,b)=>a+b,0)));
    const svg=svgNode('svg',{viewBox:`0 0 ${w} ${h}`,preserveAspectRatio:'none',role:'img','aria-label':'Visitas por día separadas por autor'});
    const bw=(w-p.l-p.r)/days.length;
    for(let i=0;i<=2;i++){const y=p.t+(h-p.t-p.b)*(1-i/2);svg.append(svgNode('line',{class:'grid',x1:p.l,x2:w-p.r,y1:y,y2:y}));const t=svgNode('text',{x:p.l-6,y:y+3,'text-anchor':'end'});t.textContent=number(Math.round(max*i/2));svg.append(t);}
    days.forEach((day,i)=>{let base=h-p.b;for(const actor of actorOrder){const v=day.by_actor?.[actor]||0;if(!v)continue;const bh=v/max*(h-p.t-p.b);base-=bh;
      const r=svgNode('rect',{x:p.l+i*bw+bw*.18,y:base,width:Math.max(2,bw*.64),height:bh,rx:2,fill:actorInfo[actor].color,class:'grow'});r.style.animationDelay=`${i*12}ms`;const tt=svgNode('title');tt.textContent=`${day.date.slice(5).split('-').reverse().join('/')} · ${actorInfo[actor].name}: ${v}`;r.append(tt);svg.append(r);}
      const every=Math.max(1,Math.ceil(days.length/8));if((i%every===0&&days.length-1-i>=every/2)||i===days.length-1){const t=svgNode('text',{x:p.l+i*bw+bw/2,y:h-6,'text-anchor':'middle'});t.textContent=day.date.slice(5).split('-').reverse().join('/');svg.append(t);}
    });
    chartHost.append(svg);
    for(const actor of actorOrder){const s=el('span');const i=el('i');i.style.background=actorInfo[actor].color;s.append(i,document.createTextNode(actorInfo[actor].name));legend.append(s);}
  }

  const stepInfo={page_view:['globe','Entró'],play_clicked:['play','Tocó Jugar'],assets_ready:['download','Cargó'],game_started:['check','Juego arrancó'],song_started:['music','Tema'],session_ended:['logout','Se fue'],load_error:['alert','Error de carga'],runtime_error:['alert','Error en juego'],cache_fallback:['shield','Caché alternativa'],load_cancelled:['clock','Pausó la carga']};
  let seenVisits=new Set(),firstVisitRender=true,visitDay='',visitAudience='';
  function renderVisits(events,hasMore,day){
    if(day!==visitDay||$('audience').value!==visitAudience){firstVisitRender=true;visitDay=day;visitAudience=$('audience').value;}
    const groups=new Map();
    for(const row of events){const key=row.visit||row.attempt;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const allVisits=[...groups.entries()].map(([key,rows])=>{rows.sort((a,b)=>new Date(a.at)-new Date(b.at));const m=rows.find(r=>r.metadata?.tester)?.metadata||rows[0].metadata||{};
      return {key,rows,actor:actorOf(m),meta:rows.find(r=>r.metadata?.geo_country)?.metadata||m,device:rows[0].device,start:rows[0].at,end:rows[rows.length-1].at};}).sort((a,b)=>new Date(b.start)-new Date(a.start));
    const device=$('visitDevice').value;
    const visits=allVisits.filter(v=>device==='all'||(v.device||'unknown')===device);
    // Franja del día: una fila por autor, cada visita es una barra en su horario.
    const strip=$('dayStrip');clear(strip);
    const actors=actorOrder.filter(a=>visits.some(v=>v.actor===a));
    if(actors.length){
      const dayStart=new Date(`${day}T00:00:00-03:00`).getTime(),pct=t=>Math.min(100,Math.max(0,(t-dayStart)/864000));
      const lanes=el('div','strip');
      for(const actor of actors){
        const row=el('div','strip-row'),lane=el('div','lane');row.append(el('span','lane-label',actorInfo[actor].name),lane);
        for(const v of visits.filter(v=>v.actor===actor)){
          const x1=pct(+new Date(v.start)),x2=pct(+new Date(v.end)),bar=el('button','strip-bar');bar.type='button';
          bar.style.cssText=`left:${x1}%;width:max(8px,${x2-x1}%);--actor:${actorInfo[actor].color}`;
          bar.title=bar.ariaLabel=`${actorInfo[actor].name} · ${clock(v.start)}–${clock(v.end)}`;
          bar.addEventListener('click',()=>{const card=document.getElementById(`visit-${v.key}`);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.classList.remove('flash');void card?.offsetWidth;card?.classList.add('flash');});
          lane.append(bar);
        }
        lanes.append(row);
      }
      const axis=el('div','strip-row strip-axis'),ticks=el('div','lane');axis.append(el('span','lane-label',''),ticks);
      for(let hr=0;hr<=24;hr+=6){const t=el('span','',`${String(hr).padStart(2,'0')}h`);t.style.left=`${hr/24*100}%`;ticks.append(t);}
      if(localDate(Date.now())===day){const now=el('i','now-line');now.style.left=`${pct(Date.now())}%`;lanes.querySelectorAll('.lane').forEach(l=>l.append(now.cloneNode()));}
      lanes.append(axis);strip.append(lanes);
    }
    const host=$('visitList');clear(host);
    $('visitScope').textContent=visits.length?`${number(visits.length)} visitas${hasMore?' (hay registros anteriores: tocá «Cargar anteriores» en Actividad)':''}. Tocá una barra para ir a esa visita.`:'';
    if(!visits.length){host.append(el('p','empty','No hubo visitas este día con estos filtros.'));return;}
    for(const v of visits.slice(0,60)){
      const info=actorInfo[v.actor],card=el('article','visit-card');card.id=`visit-${v.key}`;card.style.setProperty('--actor',info.color);
      if(!firstVisitRender&&!seenVisits.has(v.key))card.classList.add('is-new');
      const songs=v.rows.filter(r=>r.event==='song_started');
      const errors=v.rows.filter(r=>r.event==='load_error'||r.event==='runtime_error').length;
      const ended=v.rows.find(r=>r.event==='session_ended');
      const result=errors?['bad',`${errors} error${errors>1?'es':''}`]:songs.length?['good',`Tocó ${songs.length} tema${songs.length>1?'s':''}`]:v.rows.some(r=>r.event==='game_started')?['ok','Llegó al juego']:v.rows.some(r=>r.event==='play_clicked')?['ok','Intentó jugar']:['','Sólo miró'];
      let place=v.meta.geo_country;try{if(place)place=new Intl.DisplayNames(['es'],{type:'region'}).of(place);}catch{}
      const head=el('div','visit-head'),who=el('div','visit-who');
      who.append(el('strong','',info.name),el('small','',[deviceLabels[v.device]||'Dispositivo',v.meta.browser,[v.meta.geo_city,place].filter(Boolean).join(', ')].filter(Boolean).join(' · ')));
      const when=el('div','visit-when');const secs=Math.round((new Date(v.end)-new Date(v.start))/1000);
      when.append(el('strong','',`${clock(v.start)}${secs>59?`–${clock(v.end)}`:''}`),el('small','',ended?.metadata?.seconds!=null?`${duration(ended.metadata.seconds)} en la página`:ago(v.end)));
      head.append(avatar(v.actor),who,el('span',`result ${result[0]}`,result[1]),when);
      const track=el('ol','steps'),samples=[];
      for(const r of v.rows){
        if(r.event==='performance_sample'){samples.push(r.metadata||{});continue;}
        const [ic,label]=stepInfo[r.event]||['pulse','Evento'];const li=el('li',`step${r.event.includes('error')?' bad':r.event==='song_started'?' song':''}`);
        li.append(icon(ic),el('span','',r.event==='song_started'?String(r.metadata?.song||'tema').replaceAll('_',' '):label));
        li.title=`${clock(r.at)} · ${activityLabels[r.event]||label}${r.metadata?.message?` · ${r.metadata.message}`:''}`;track.append(li);
      }
      if(samples.length){const g=samples.map(s=>s.game_pct).filter(Number.isFinite),f=samples.map(s=>s.fps).filter(Number.isFinite),avg=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length);
        const li=el('li','step perf');li.append(icon('pulse'),el('span','',`Rendimiento${g.length?` · juego ${avg(g)} %`:''}${f.length?` · ${avg(f)} img/s`:''}`));track.append(li);}
      card.append(head,track);host.append(card);
    }
    seenVisits=new Set(visits.map(v=>v.key));firstVisitRender=false;
  }

  let activityEvents=[],lastActivity=null;
  function renderActivity(activity,append){
    const host=$('activityList');if(!append){clear(host);activityCount=0;activityEvents=[];}
    activityEvents.push(...activity.events);lastActivity=activity;renderVisits(activityEvents,activity.has_more,activity.day);
    activityOffset=activity.next_offset;activityUntil=activity.until||null;
    for(const row of activity.events){
      const m=row.metadata||{},article=el('article',`activity-item ${row.event==='load_error'||row.event==='runtime_error'?'activity-error':''}`),head=el('div','feedback-item-heading');
      const eventIcon=el('span','event-icon');eventIcon.append(icon(eventIcons[row.event]||'pulse'));article.append(eventIcon);
      head.append(el('strong','',activityLabels[row.event]||'Evento'),el('time','',new Date(row.at).toLocaleTimeString('es-AR',{timeZone:zone,hour12:false})));
      article.append(head,el('p','feedback-context',[row.attempt,row.correlation==='attempt'?'mismo intento':'misma visita; intento desconocido',deviceLabels[row.device]||'Dispositivo desconocido',m.browser||'Navegador no registrado',m.version?`Versión ${m.version}`:'Versión no registrada'].join(' · ')));
      const parts=[];
      let country=m.geo_country;
      try{if(country)country=new Intl.DisplayNames(['es'],{type:'region'}).of(country);}catch{}
      const chips=el('div','event-chips');
      for(const [symbol,label,internal]of [[m.tester&&m.tester!=='unknown'?'robot':'users',actorLabels[m.tester]||actorLabels.unknown,m.tester&&m.tester!=='unknown'],['location',[m.geo_city,m.geo_region,country].filter(Boolean).join(' · ')||'Ubicación no disponible',false]]){
        const chip=el('span',`event-chip${internal?' internal':''}`);chip.append(icon(symbol),document.createTextNode(label));chips.append(chip);
      }
      chips.lastChild.title='Ubicación aproximada por IP; puede diferir de la ubicación real.';
      article.append(chips);
      if(m.phase)parts.push(`Etapa: ${m.phase}`);
      if(m.error_name)parts.push(`Tipo: ${m.error_name}`);
      if(m.message)parts.push(m.message);
      if(m.cause)parts.push(`Causa informada: ${m.cause}`);
      if(m.resource)parts.push(`Recurso: ${m.resource}`);
      if(m.status!=null)parts.push(`HTTP: ${m.status}`);
      if(m.song)parts.push(`Canción: ${m.song}`);
      if(m.severity)parts.push(`Resultado: ${m.severity}`);
      for(const [key,label,suffix] of [['game_pct','Velocidad del juego',' %'],['clock_pct','Avance del reloj',' %'],['fps','Imágenes de la escena','/s'],['audio_underruns_delta','Cortes de audio en el intervalo',''],['audio_skips_delta','Saltos de audio en el intervalo',''],['interval_seconds','Intervalo de muestra',' s'],['cores','Núcleos informados',''],['memory_gb','Memoria informada',' GB']])if(m[key]!=null)parts.push(`${label}: ${number(m[key])}${suffix}`);
      if((row.event==='load_error'||row.event==='runtime_error')&&!row.detail_available)parts.push('Registro antiguo o sin detalle: no permite conocer la causa.');
      article.append(el('p','activity-detail',parts.join('\n')||'Sin información adicional.'));host.append(article);
    }
    activityCount+=activity.events.length;
    if(!activityCount)host.append(el('p','empty','No hay registros con estos filtros.'));
    $('activityScope').textContent=`${number(activityCount)} registros · ${activity.day} · hora de Argentina. Más recientes primero.${activity.has_more?' Hay registros anteriores.':''}`;
    $('activityMore').hidden=!activity.has_more;
  }

  let activityAppended=false;
  async function loadActivity(token,append=false){
    const request=++activityRequest;activityAppended=append;
    if(!append){clear($('activityList'));activityOffset=null;activityUntil=null;activityCount=0;}
    $('activityMore').hidden=true;$('activityRefresh').disabled=true;$('activityScope').textContent='Leyendo registros…';
    const params=new URLSearchParams({view:'activity',audience:$('audience').value,date:$('activityDate').value,type:$('activityType').value,offset:String(append?activityOffset||0:0)});
    if(append&&activityUntil)params.set('until',activityUntil);
    try{
      const response=await fetch(`${ENDPOINT}?${params}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!response.ok)throw new Error(response.status===401?'Volvé a entrar al panel para leer los registros.':'No se pudo leer el registro diario.');
      const data=await response.json();if(request!==activityRequest)return;
      if(!data.activity){$('activityScope').textContent='Registro diario pendiente de publicar en el servidor.';return;}
      renderActivity(data.activity,append);
    }catch(err){if(request===activityRequest){$('activityScope').textContent=err.message||'No se pudo leer el registro diario.';$('activityMore').hidden=!append||activityOffset==null;}}
    finally{if(request===activityRequest)$('activityRefresh').disabled=false;}
  }

  function renderFeedbackList(){
    const host=$('feedbackList');clear(host);
    const category=$('feedbackCategory').value,rating=$('feedbackRating').value;
    const rows=feedbackRows.filter(row=>(category==='all'||row.category===category)&&(rating==='all'||row.rating===Number(rating)));
    if(!rows.length){host.append(el('p','empty','No hay opiniones con estos filtros.'));return;}
    for(const row of rows){
      const article=el('article','feedback-item'),head=el('div','feedback-item-heading');
      head.append(el('strong','',`${row.rating}/5 · ${categoryLabels[row.category]||'Otro'}`),el('time','',new Date(row.created_at).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'})));
      const stars=el('span','rating-stars');stars.setAttribute('aria-hidden','true');for(let i=1;i<=5;i++){const star=icon('star');if(i<=row.rating)star.classList.add('filled');stars.append(star);}head.querySelector('strong').prepend(stars);
      article.append(head,el('p','feedback-context',`${row.nickname||'Sin apodo'} · ${deviceLabels[row.device]||'Dispositivo desconocido'} · ${row.browser||'Otro navegador'}`),el('p','feedback-message',row.message||'Sólo dejó una calificación.'));
      host.append(article);
    }
  }

  function renderFeedback(feedback){
    const summary=$('feedbackSummary');clear(summary);feedbackRows=feedback?.recent||[];
    if(!feedback){summary.append(el('p','empty','Opiniones pendientes de habilitar en el servidor.'));clear($('feedbackRatings'));clear($('feedbackCategories'));$('feedbackScope').textContent='';renderFeedbackList();return;}
    for(const [title,value] of [['Opiniones',number(feedback.total)],['Nota promedio',feedback.average==null?'—':`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:2}).format(feedback.average)} / 5`]]){
      const box=el('div');box.append(el('span','',title),el('strong','',value));summary.append(box);
    }
    bars($('feedbackRatings'),feedback.ratings.map(row=>({label:`${row.rating} / 5`,sessions:row.count})),feedback.total);
    bars($('feedbackCategories'),feedback.categories.map(row=>({label:categoryLabels[row.category]||'Otro',sessions:row.count})),feedback.total);
    $('feedbackScope').textContent=`Se muestran las últimas ${feedbackRows.length} de ${number(feedback.total)} opiniones del período. Los filtros se aplican a estos mensajes.`;
    renderFeedbackList();
  }

  function bars(target,items,total){
    clear(target);
    if(!items.length){target.append(el('p','empty','Todavía no hay datos.'));return;}
    for(const item of items){
      const wrap=el('div','distribution'),head=el('div');
      const label=el('span','distribution-label',item.label);if(item.color){const dot=el('i','color-dot');dot.style.background=item.color;label.prepend(dot);}if(item.icon)label.prepend(icon(item.icon));
      head.append(label,el('span','',number(item.sessions)));
      const bar=el('div','bar'),fill=el('i');fill.style.width=`${total?Math.min(100,item.sessions/total*100):0}%`;if(item.color)fill.style.background=item.color;bar.append(fill);wrap.append(head,bar);target.append(wrap);
    }
  }

  function ring(target,items){
    clear(target);const total=items.reduce((sum,row)=>sum+Math.max(0,Number(row.sessions)||0),0);
    if(!total){target.append(el('p','empty','Sin datos en este período.'));return;}
    const svg=svgNode('svg',{viewBox:'0 0 160 160',role:'img','aria-label':items.map(row=>`${row.label}: ${number(row.sessions)}`).join(', ')});
    const radius=63,circumference=2*Math.PI*radius;let offset=0;
    svg.append(svgNode('circle',{cx:80,cy:80,r:radius,fill:'none',stroke:'#ffffff08','stroke-width':9}));
    for(const row of items){const length=row.sessions/total*circumference;if(!length)continue;
      const circle=svgNode('circle',{cx:80,cy:80,r:radius,fill:'none',stroke:row.color,'stroke-width':9,'stroke-dasharray':`${length} ${circumference-length}`,'stroke-dashoffset':-offset,transform:'rotate(-90 80 80)'});
      const title=svgNode('title');title.textContent=`${row.label}: ${number(row.sessions)} (${Math.round(row.sessions/total*100)} %)`;circle.append(title);svg.append(circle);offset+=length;
    }
    const value=svgNode('text',{x:80,y:78,'text-anchor':'middle',class:'ring-total'});value.textContent=number(total);
    const caption=svgNode('text',{x:80,y:98,'text-anchor':'middle',class:'ring-caption'});caption.textContent='sesiones';svg.append(value,caption);target.append(svg);
  }

  function chart(rows){
    const host=$('dailyChart');clear(host);if(!rows.length)return;
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),w=760,h=260,p={l:34,r:12,t:12,b:28};
    svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.setAttribute('preserveAspectRatio','none');
    const tooltip=el('div','chart-tooltip');tooltip.hidden=true;tooltip.setAttribute('aria-live','polite');
    const max=Math.max(3,...rows.flatMap(row=>[row.visits,row.starts]));
    const x=i=>p.l+(w-p.l-p.r)*(rows.length===1?.5:i/(rows.length-1));
    const y=v=>p.t+(h-p.t-p.b)*(1-v/max);
    for(let i=0;i<=3;i++){const line=document.createElementNS(ns,'line');line.setAttribute('class','grid');line.setAttribute('x1',p.l);line.setAttribute('x2',w-p.r);line.setAttribute('y1',y(max*i/3));line.setAttribute('y2',y(max*i/3));svg.append(line);const tick=svgNode('text',{x:p.l-10,y:y(max*i/3)+3,'text-anchor':'end'});tick.textContent=number(Math.round(max*i/3));svg.append(tick);}
    const defs=svgNode('defs'),gradient=svgNode('linearGradient',{id:'visitFill',x1:0,y1:0,x2:0,y2:1});gradient.append(svgNode('stop',{offset:'0%','stop-color':'#ee8a9f','stop-opacity':.18}),svgNode('stop',{offset:'100%','stop-color':'#ee8a9f','stop-opacity':0}));defs.append(gradient);svg.append(defs);
    const linePoints=rows.map((row,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(row.visits).toFixed(1)}`).join(' ');
    svg.append(svgNode('path',{d:`${linePoints} L${x(rows.length-1)},${y(0)} L${x(0)},${y(0)} Z`,fill:'url(#visitFill)'}));
    const path=(key,cls)=>{const node=document.createElementNS(ns,'path');node.setAttribute('class',cls);node.setAttribute('d',rows.map((row,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(row[key]).toFixed(1)}`).join(' '));svg.append(node);for(let i=0;i<rows.length;i++){if(rows.length>14&&i%Math.ceil(rows.length/10))continue;const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x(i));c.setAttribute('cy',y(rows[i][key]));c.setAttribute('r','3.5');c.setAttribute('fill',key==='visits'?'#dc667f':'#d9b36a');svg.append(c);}};
    path('visits','visits');path('starts','starts');
    const tickEvery=Math.max(1,Math.ceil(rows.length/6));rows.forEach((row,i)=>{
      const point=svgNode('circle',{class:'chart-hit',cx:x(i),cy:y(row.visits),r:8,fill:'transparent',stroke:'none',tabindex:0,role:'img','aria-label':`${row.date}: ${row.visits} visitas, ${row.starts} arranques`});
      const show=()=>{tooltip.textContent=`${row.date.slice(5).split('-').reverse().join('/')} · ${number(row.visits)} visitas · ${number(row.starts)} arranques`;tooltip.hidden=false;};
      for(const event of ['mouseenter','focus'])point.addEventListener(event,show);for(const event of ['mouseleave','blur'])point.addEventListener(event,()=>tooltip.hidden=true);svg.append(point);
      if(i%tickEvery&&i!==rows.length-1)return;const t=document.createElementNS(ns,'text');t.setAttribute('x',x(i));t.setAttribute('y',h-7);t.setAttribute('text-anchor','middle');t.textContent=row.date.slice(5).split('-').reverse().join('/');svg.append(t);
    });host.append(svg,tooltip);
  }

  function render(data,trend){
    renderFeedback(data.feedback);renderActors(data);renderWeekly(data.weekly);renderLastHour(data.live?.last_hour);
    $('updated').textContent=`Actualizado ${new Date(data.generated_at).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'})}`;
    $('rangeLabel').textContent=data.truncated?`Últimos ${data.range_days} días · mostrando desde ${new Date(data.covered_from).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short'})} (hay demasiada actividad; probá un período más corto)`:`Últimos ${data.range_days} días`;$('activeNow').textContent=number(data.totals.active_5m);if(data.live){$('livePlayers').textContent=number(data.live.players);$('liveStages').innerHTML='';for(const s of data.live.by_stage){const li=document.createElement('li');li.textContent=s.label+': '+number(s.players);$('liveStages').append(li);}}$('privacy').textContent=data.privacy;
    const cards=[['Visitas',number(data.totals.visits),'Sesiones únicas','users'],['Tocaron Jugar',number(data.totals.play_clicked),'Sesiones con intento','play'],['Juego iniciado',number(data.totals.game_started),'Sesiones que arrancaron','check'],['Tiempo medio',duration(data.totals.average_session_seconds),'Sólo sesiones cerradas','clock']];
    const kpis=$('kpis');clear(kpis);for(const [title,value,note,symbol] of cards){const shell=el('article','kpi'),core=el('div'),top=el('div','kpi-top');top.append(el('span','',title),icon(symbol));
      const valueRow=el('div');valueRow.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap';valueRow.append(el('strong','',value));if(symbol==='users'&&trend)valueRow.append(trendBadge(trend));
      core.append(top,valueRow,el('small','',note));shell.append(core);
      if(symbol==='users'&&data.daily.some(row=>row.visits>0)){const bars=el('span','mini-bars');bars.setAttribute('aria-hidden','true');const points=data.daily.slice(-12),max=Math.max(1,...points.map(row=>row.visits));for(const row of points){const bar=el('i');bar.style.height=`${row.visits/max*26}px`;bars.append(bar);}shell.append(bars);}kpis.append(shell);}
    const funnel=$('funnel');clear(funnel);const first=Math.max(1,data.funnel[0]?.sessions||1);for(const step of data.funnel){const row=el('div','funnel-row'),top=el('div','funnel-top'),name=el('span','',labels[step.event]||step.event),bar=el('div','bar'),fill=el('i');const pct=step.sessions/first*100;fill.style.width=`${Math.min(100,pct)}%`;bar.append(fill);top.append(icon(eventIcons[step.event]),name,el('strong','',number(step.sessions)),el('small','',`${Math.round(pct)} %`));row.append(top,bar);funnel.append(row);}
    chart(data.daily);
    const devices=data.devices.map((row,index)=>({...row,label:deviceLabels[row.label]||row.label,icon:['desktop','phone','tablet'].includes(row.label)?row.label:'users',color:palette[index%palette.length]}));
    const sources=data.sources.map((row,index)=>({...row,label:sourceLabels[row.label]||row.label,color:palette[index%palette.length]}));
    ring($('deviceChart'),devices);ring($('sourceChart'),sources);bars($('devices'),devices,devices.reduce((n,row)=>n+row.sessions,0));bars($('sources'),sources,sources.reduce((n,row)=>n+row.sessions,0));
    const songs=$('songs');clear(songs);if(!data.songs.length)songs.append(el('p','empty','Todavía no se registraron canciones.'));else data.songs.slice(0,8).forEach((item,index)=>{const row=el('div','rank-row'),body=el('div','song-body'),bar=el('div','bar'),fill=el('i');fill.style.width=`${item.starts/Math.max(1,...data.songs.map(s=>s.starts))*100}%`;bar.append(fill);body.append(el('strong','',item.song.replaceAll('_',' ')),bar);row.append(el('span','',String(index+1).padStart(2,'0')),body,el('em','',`${number(item.starts)} inicios`));songs.append(row);});
    const health=$('health');clear(health);const metrics=el('div','health-metrics');for(const [label,value] of [['Errores de carga',data.totals.load_errors],['Caché alternativa',data.totals.cache_fallbacks]]){const box=el('div');box.append(el('span','',label),el('strong','',number(value)));metrics.append(box);}health.append(metrics);if(data.error_phases.length){data.error_phases.forEach((item,index)=>{const row=el('div','rank-row');row.append(el('span','',String(index+1).padStart(2,'0')),el('strong','',item.phase),el('em','',`${number(item.errors)} errores`));health.append(row);});}else health.append(el('p','empty','Sin errores de carga en este período.'));
  }

  // Claude 2026-10-22: resumen por semana (gh3_dashboard_weekly) y última hora (gh3_dashboard_last_hour).
  const dm=iso=>iso.slice(8,10)+'/'+iso.slice(5,7);
  const weekLabel=iso=>{const end=new Date(Date.parse(iso+'T12:00:00Z')+6*86400000).toISOString().slice(0,10);return `${dm(iso)} al ${dm(end)}`;};
  function renderWeekly(weeks){
    const compare=$('weekCompare'),table=$('weekTable');clear(compare);clear(table);
    if(!Array.isArray(weeks)||!weeks.length){compare.append(el('p','empty','El resumen por semana aparece cuando se aplique el SQL nuevo en la base.'));return;}
    // La semana en curso está incompleta: las tarjetas comparan la última semana completa con la anterior.
    const now=weeks.at(-1),last=weeks.at(-2)||{},prev=weeks.at(-3)||{};
    for(const [label,key] of [['Visitas','visits'],['Jugaron','played'],['Canciones tocadas','songs'],['Errores','errors']]){
      const box=el('div'),a=Number(last[key])||0,b=Number(prev[key])||0,pct=b?Math.round((a-b)/b*100):null;
      box.append(el('span','',`${label} · semana ${last.week?weekLabel(String(last.week).slice(0,10)):''}`),el('strong','',number(a)));
      const note=el('small','',`anterior: ${number(b)} · en curso: ${number(now[key])}`);
      if(pct!=null){const delta=el('b',(key==='errors'?pct<=0:pct>=0)?'up':'down',` ${pct>0?'+':''}${pct} %`);note.append(delta);}
      box.append(note);compare.append(box);
    }
    const head=el('tr');for(const h of ['Semana','Visitas','Jugaron','Con canción','Canciones','Celular','Errores','Tiempo medio','Más tocada'])head.append(el('th','',h));table.append(head);
    // Sin las semanas viejas vacías (antes de que hubiera datos).
    const first=weeks.findIndex(w=>Number(w.visits)>0||Number(w.songs)>0);
    for(const w of weeks.slice(Math.max(0,first)).reverse()){
      const row=el('tr',w===now?'now':'');
      row.append(el('td','',weekLabel(String(w.week).slice(0,10))+(w===now?' (en curso)':'')));
      for(const key of ['visits','played','with_song','songs','phone','errors'])row.append(el('td','',number(w[key])));
      row.append(el('td','',w.avg_seconds==null?'—':duration(Number(w.avg_seconds))),el('td','song',w.top_song?`${w.top_song} (${number(w.top_song_starts)})`:'—'));
      table.append(row);
    }
  }
  function renderLastHour(h){
    const host=$('lastHour');clear(host);if(!h)return;
    host.append(el('p','last-hour-title','Última hora'));
    const grid=el('div','lh-grid');for(const [value,label] of [[h.sessions,'sesiones'],[h.game_started,'arrancaron'],[h.songs,'canciones'],[h.errors,'errores']]){const box=el('div');box.append(el('b','',number(value)),el('span','',label));grid.append(box);}host.append(grid);
    if(h.top_songs?.length){const ol=el('ol');for(const s of h.top_songs)ol.append(el('li','',`${s.song} (${number(s.starts)})`));host.append(ol);}
  }

  let summaryRequest=0,loading=false;
  // Claude 2026-10-24: menos consumo de Supabase (egreso y llamadas): refresco cada 60 s, se frena tras 10 min sin tocar la pantalla y el período de 90 días se pide cada 10 min.
  const LIVE_MS=60000,IDLE_MS=600000,WIDE_MS=600000;let lastTouch=Date.now();
  for(const type of ['pointerdown','keydown','scroll','touchstart'])addEventListener(type,()=>{lastTouch=Date.now();},{passive:true});
  async function fetchSummary(token,period){
    const response=await fetch(`${ENDPOINT}?days=${period}&audience=${$('audience').value}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
    if(response.status===401)throw Object.assign(new Error('La contraseña no es válida.'),{auth:true});
    if(!response.ok)throw new Error('El panel no pudo leer los datos.');
    return response.json();
  }

  // Compara el período elegido con el anterior de igual largo (usa los 90 días). Verde si sube o si hoy supera a ayer; rojo si baja.
  function trendOf(wide,period){
    if(!wide||wide.truncated||period>=90)return null;
    const daily=wide.daily||[],current=daily.slice(-period),previous=daily.slice(-2*period,-period);
    if(previous.length<period)return null;
    const sum=rows=>rows.reduce((n,row)=>n+row.visits,0);
    const c=sum(current),p=sum(previous);
    const today=daily.at(-1)?.visits??0,yesterday=daily.at(-2)?.visits??0;
    return {up:c>=p||today>yesterday,pct:p?Math.round((c-p)/p*100):null,c,p};
  }

  function trendBadge(trend){
    const span=el('span','');
    span.style.cssText=`display:inline-flex;align-items:center;gap:4px;font-size:.8rem;font-weight:600;color:${trend.up?'#6fd39a':'#e05c6e'}`;
    const svg=svgNode('svg',{viewBox:'0 0 10 10',width:12,height:12,'aria-hidden':'true'});
    svg.append(svgNode('polygon',{points:trend.up?'5,1 9.5,9 0.5,9':'5,9 9.5,1 0.5,1',fill:'currentColor'}));
    span.append(svg,el('span','',trend.pct==null?'':`${trend.pct>0?'+':''}${trend.pct} %`));
    span.title=`Período actual: ${number(trend.c)} visitas · período anterior: ${number(trend.p)} visitas`;
    return span;
  }

  async function load(token,{activity=true}={}){
    const request=++summaryRequest;loading=true; // Claude 2026-10-22: el ciclo en vivo no lanza otra carga mientras ésta sigue.
    $('notice').hidden=true;$('refresh').disabled=true;
    try{
      const period=Number(days.value),cacheKey=`lvh-cache:${period}:${$('audience').value}`;
      // Claude 2026-10-24: se pinta al instante lo último guardado; los datos nuevos lo reemplazan al llegar.
      if(!dashboard.dataset.painted||dashboard.dataset.painted!==cacheKey){try{const c=JSON.parse(localStorage.getItem(cacheKey)||'null');if(c?.data){render(c.data,trendOf(c.wide,period));login.hidden=true;dashboard.hidden=false;dashboard.dataset.painted=cacheKey;$('updated').textContent=`Datos guardados de hace ${Math.max(1,Math.round((Date.now()-c.t)/60000))} min · actualizando…`;}}catch{}}
      let prior=null;try{prior=JSON.parse(localStorage.getItem(cacheKey)||'null');}catch{}
      const wideFresh=prior?.wide&&Date.now()-(prior.tw||0)<WIDE_MS;
      const widePromise=period>=90?Promise.resolve(null):wideFresh?Promise.resolve(prior.wide):fetchSummary(token,90).catch(()=>null);
      const data=await fetchSummary(token,period);
      if(request!==summaryRequest)return false;
      render(data,null);login.hidden=true;dashboard.hidden=false;dashboard.dataset.painted=cacheKey;if(window.lvhPushPaint&&!window.lvhPushShown){window.lvhPushShown=true;window.lvhPushPaint();}
      const wide=await widePromise;
      if(request!==summaryRequest)return false;
      try{localStorage.setItem(cacheKey,JSON.stringify({t:Date.now(),tw:wideFresh?prior.tw:Date.now(),data,wide}));}catch{}
      lastLoad=Date.now();render(data,trendOf(wide,period));login.hidden=true;dashboard.hidden=false;error.textContent='';if(activity)await loadActivity(token);return true;
    }catch(err){if(request!==summaryRequest)return false;if(err.auth){store.clear();login.hidden=false;dashboard.hidden=true;error.textContent=err.message;}else{const notice=$('notice');notice.textContent=err.message||'No se pudo actualizar.';notice.hidden=false;}return false;
    }finally{if(request===summaryRequest){$('refresh').disabled=false;loading=false;}}
  }

  // Se guarda al entrar; si la contraseña es incorrecta, load() la borra al recibir 401.
  form.addEventListener('submit',async event=>{event.preventDefault();const token=$('password').value.trim();store.set(token);await load(token);});
  $('refresh').addEventListener('click',()=>load(store.get()));days.addEventListener('change',()=>load(store.get()));
  $('audience').addEventListener('change',()=>{activityRequest++;load(store.get());});
  $('logout').addEventListener('click',()=>{store.clear();try{Object.keys(localStorage).filter(k=>k.startsWith('lvh-cache:')).forEach(k=>localStorage.removeItem(k));}catch{}activityRequest++;summaryRequest++;clear($('activityList'));dashboard.hidden=true;login.hidden=false;$('password').value='';$('password').focus();});
  $('activityRefresh').addEventListener('click',()=>loadActivity(store.get()));
  $('activityDate').addEventListener('change',()=>loadActivity(store.get()));
  $('activityType').addEventListener('change',()=>loadActivity(store.get()));
  $('activityMore').addEventListener('click',()=>loadActivity(store.get(),true));
  $('visitDevice').addEventListener('change',()=>{if(lastActivity)renderVisits(activityEvents,lastActivity.has_more,lastActivity.day);});
  $('feedbackCategory').addEventListener('change',renderFeedbackList);$('feedbackRating').addEventListener('change',renderFeedbackList);
  // En vivo: relee resumen y registros de hoy cada 20 s mientras la pestaña está visible.
  let live=true,lastLoad=0;try{live=localStorage.getItem('gh3-monitor-live')!=='0';}catch{}
  const liveButton=$('liveMode');
  const paintLive=()=>{liveButton.setAttribute('aria-pressed',String(live));liveButton.classList.toggle('off',!live);};
  liveButton.addEventListener('click',()=>{live=!live;try{localStorage.setItem('gh3-monitor-live',live?'1':'0');}catch{}paintLive();});paintLive();
  setInterval(()=>{
    if(lastLoad)$('liveAgo').textContent=` · ${Math.max(0,Math.round((Date.now()-lastLoad)/1000))} s`;
    const token=store.get();
    if(!live||!token||loading||dashboard.hidden||document.visibilityState==='hidden'||Date.now()-lastLoad<LIVE_MS||Date.now()-lastTouch>IDLE_MS)return;
    // Resumen siempre; registros sólo si son de hoy y no hay páginas anteriores cargadas (no pisar lo que se mira).
    load(token,{activity:$('activityDate').value===localDate(Date.now())&&!activityAppended});
  },1000);
  // Al volver a la pestaña o ventana, actualiza de inmediato en vez de esperar el próximo ciclo.
  document.addEventListener('visibilitychange',()=>{lastTouch=Date.now();const token=store.get();if(live&&token&&!loading&&!dashboard.hidden&&document.visibilityState==='visible'&&Date.now()-lastLoad>=LIVE_MS)load(token,{activity:$('activityDate').value===localDate(Date.now())&&!activityAppended});});

  // Claude 2026-10-24: avisos push (service worker + suscripción guardada en la función gh3-push).
  (function setupPush(){
    const PUSH='https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-push';
    const box=$('pushBox'),text=$('pushText'),toggle=$('pushToggle'),prefsBox=$('pushPrefs');
    if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window)){
      const ios=/iPhone|iPad/.test(navigator.userAgent);
      box.hidden=false;toggle.hidden=true;
      text.textContent=ios?'Para recibir avisos, agregá este panel a la pantalla de inicio (Compartir > Agregar a inicio) y abrilo desde ahí.':'Este navegador no admite avisos.';
      return;
    }
    const b64=v=>{const pad='='.repeat((4-v.length%4)%4),raw=atob((v+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));};
    const call=(action,body)=>fetch(`${PUSH}?action=${action}`,{method:'POST',headers:{authorization:`Bearer ${store.get()}`,'content-type':'application/json'},body:JSON.stringify(body||{})}).then(r=>{if(!r.ok)throw new Error('push_'+r.status);return r.json();});
    const prefs=()=>({feedback:$('pushFeedback').checked,alerts:$('pushAlerts').checked,digest:$('pushDigest').checked});
    const registration=()=>navigator.serviceWorker.register('sw.js',{scope:'./'}).then(()=>navigator.serviceWorker.ready);
    async function paint(){
      box.hidden=false;
      let sub=null;try{sub=await (await registration()).pushManager.getSubscription();}catch{}
      const on=!!sub&&Notification.permission==='granted';
      toggle.textContent=on?'Desactivar avisos':'Activar avisos';prefsBox.hidden=!on;
      text.textContent=Notification.permission==='denied'?'Los avisos están bloqueados en los ajustes del celular o del navegador.':on?'Avisos activados en este dispositivo.':'Avisos al celular: comentarios, calificaciones, rendimiento y crecimiento.';
      try{const saved=JSON.parse(localStorage.getItem('lvh-push-prefs')||'{}');for(const [id,k] of [['pushFeedback','feedback'],['pushAlerts','alerts'],['pushDigest','digest']])if(saved[k]===false)$(id).checked=false;}catch{}
    }
    toggle.addEventListener('click',async()=>{
      toggle.disabled=true;
      try{
        const reg=await registration(),current=await reg.pushManager.getSubscription();
        if(current){await call('unsubscribe',{endpoint:current.endpoint}).catch(()=>{});await current.unsubscribe();}
        else{
          if(await Notification.requestPermission()!=='granted')throw new Error('denied');
          const {key}=await fetch(`${PUSH}?action=key`).then(r=>r.json());
          if(!key)throw new Error('sin clave');
          const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64(key)});
          await call('subscribe',{subscription:sub.toJSON(),prefs:prefs()});
          await call('test');
        }
      }catch(err){text.textContent='No se pudieron activar los avisos ('+(err.message||'error')+').';toggle.disabled=false;return;}
      toggle.disabled=false;paint();
    });
    const savePrefs=async()=>{try{localStorage.setItem('lvh-push-prefs',JSON.stringify(prefs()));}catch{}const sub=await (await registration()).pushManager.getSubscription().catch(()=>null);if(sub)call('subscribe',{subscription:sub.toJSON(),prefs:prefs()}).catch(()=>{});};
    for(const id of ['pushFeedback','pushAlerts','pushDigest'])$(id).addEventListener('change',savePrefs);
    $('pushTest').addEventListener('click',()=>call('test').catch(()=>{text.textContent='No se pudo enviar la prueba.';}));
    window.lvhPushPaint=paint;
  })();
  // Con la contraseña guardada se entra directo: mientras llegan los datos se ve «Cargando…», no el formulario.
  const saved=store.get();if(saved){login.hidden=true;dashboard.hidden=false;$('updated').textContent='Cargando datos…';load(saved);}
})();
