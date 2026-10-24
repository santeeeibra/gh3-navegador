(()=>{
  if(window.gh3Analytics)return;
  const endpoint='https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-analytics';
  const started=Date.now(),sent=new Set();
  const makeId=()=>{
    if(crypto.randomUUID)return crypto.randomUUID();
    const b=crypto.getRandomValues(new Uint8Array(16));b[6]=b[6]&15|64;b[8]=b[8]&63|128;
    const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
  };
  let sessionId;
  try{sessionId=sessionStorage.getItem('gh3-analytics-session')||makeId();sessionStorage.setItem('gh3-analytics-session',sessionId);}catch{sessionId=makeId();}
  // Enlaces etiquetados (?src=whatsapp) ganan sobre el referrer; la etiqueta queda en la sesión de la pestaña.
  const campaign=(()=>{const known=['whatsapp','tiktok','youtube','email'];try{const tag=(new URL(location.href).searchParams.get('src')||'').toLowerCase();if(known.includes(tag)){sessionStorage.setItem('gh3-analytics-src',tag);return tag;}return sessionStorage.getItem('gh3-analytics-src')||'';}catch{return'';}})();
  const source=campaign||(()=>{try{const h=new URL(document.referrer).hostname.toLowerCase();if(h==='t.co'||h.endsWith('.x.com')||h==='x.com'||h.endsWith('.twitter.com')||h==='twitter.com')return'x';if(h.includes('google.'))return'google';if(h.endsWith('facebook.com')||h.endsWith('fb.com'))return'facebook';if(h.endsWith('instagram.com'))return'instagram';return h?'other':'direct';}catch{return'direct';}})();
  const device=(()=>{const touch=navigator.maxTouchPoints>0||matchMedia('(pointer:coarse)').matches;if(!touch)return'desktop';return Math.min(screen.width,screen.height)>=600?'tablet':'phone';})();
  const ua=navigator.userAgent||'';
  const browser=/Edg(?:e|A|iOS)?\//.test(ua)?'Edge':/Firefox|FxiOS/.test(ua)?'Firefox':/Chrome|CriOS/.test(ua)?'Chrome':/Safari/.test(ua)?'Safari':'Otro';
  const text=(value,max=180)=>String(value??'').slice(0,2000)
    .replace(/https?:\/\/[^\s<>"']+/gi,raw=>{try{return new URL(raw).pathname;}catch{return'[recurso]';}})
    .replace(/((?:\/?[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:js|wasm|json|bik|xen))[?#][^\s<>"']*/gi,'$1')
    .replace(/\bBearer\s+[^\s,;]+/gi,'[credencial oculta]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[oculto]')
    .replace(/\b(?:authorization|token|password|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,'[credencial oculta]')
    .replace(/\b(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g,'[oculto]')
    .replace(/\b[A-Z]:[\\/][^\s<>"']+/gi,'[ruta local]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[correo oculto]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g,'[dirección oculta]')
    .replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
  const resource=value=>{try{const u=new URL(String(value),location.href);return /^https?:$/.test(u.protocol)&&/^\/(?:gh3\/)?(?:chunks\/[a-f0-9]{64}|[a-zA-Z0-9_./-]+\.(?:js|wasm|json|bik|xen))$/.test(u.pathname)?u.pathname.slice(0,220):'';}catch{return'';}};
  const version=text(document.querySelector?.('meta[name="gh3-build"]')?.content||'sin-identificar',64);
  const context={browser,version};
  if(Number.isFinite(navigator.hardwareConcurrency))context.cores=navigator.hardwareConcurrency;
  if(Number.isFinite(navigator.deviceMemory))context.memory_gb=navigator.deviceMemory;
  let attemptId=makeId(),sampleTimer=null,playing=false,songName='',previousAudio=null;
  const clean=m=>{
    const out={...context,...window.gh3VisitContext?.data,attempt_id:attemptId};
    for(const key of ['phase','error_name','message','cause','song','severity'])if(typeof m?.[key]==='string')out[key]=text(m[key],key==='message'||key==='cause'?180:48);
    if(m?.resource){const path=resource(m.resource);if(path)out.resource=path;}
    for(const [key,max] of Object.entries({status:599,game_pct:1000,clock_pct:1000,fps:1000,audio_underruns_delta:1e9,audio_skips_delta:1e9,interval_seconds:86400,seconds:86400}))if(typeof m?.[key]==='number'&&Number.isFinite(m[key])&&m[key]>=0&&m[key]<=max)out[key]=m[key];
    if(typeof m?.played==='boolean')out.played=m.played;
    // Reserve margin below the 2048-byte JSONB constraint, including Unicode.
    while(new TextEncoder().encode(JSON.stringify(out)).length>1400){if(out.cause){delete out.cause;continue;}if(out.message){out.message=out.message.slice(0,Math.floor(out.message.length/2));continue;}delete out.resource;break;}
    return out;
  };
  const payload=(event,metadata={})=>JSON.stringify({event,session_id:sessionId,source,device,metadata:clean(metadata)});
  const allowed=new Set(['page_view','play_clicked','assets_ready','game_started','song_started','session_ended','load_error','cache_fallback','performance_sample','runtime_error','load_cancelled','heartbeat']);
  let windowStarted=Date.now(),windowCount=0;
  const track=(event,metadata={})=>{
    if(!allowed.has(event))return;
    const now=Date.now();if(now-windowStarted>=60000){windowStarted=now;windowCount=0;}if(windowCount>=16)return;
    if(event==='play_clicked'){attemptId=makeId();playing=false;stopSamples();}
    windowCount++;
    // Snapshot the attempt before waiting for location; clicks can rotate it.
    const captured=clean(metadata);
    const send=()=>{try{return fetch(endpoint,{method:'POST',mode:'cors',keepalive:true,headers:{'content-type':'text/plain;charset=UTF-8'},body:JSON.stringify({event,session_id:sessionId,source,device,metadata:{...clean(captured),attempt_id:captured.attempt_id}})}).catch(()=>{});}catch{}};
    return window.gh3VisitContext?.ready?window.gh3VisitContext.ready.then(send):send();
  };
  const once=(event,metadata={})=>{if(sent.has(event))return;sent.add(event);return track(event,metadata);};
  const song=s=>track('song_started',{song:String(s||'unknown')});
  // Claude 2026-10-22: cada error igual se manda una vez por visita y como máximo 20 errores por visita
  // (antes se repetía cada 5 s y unos pocos jugadores llenaban el registro: ~680 errores/hora).
  const sentErrors=new Set();let errorBudget=20;
  const reportError=(phase,error,extra={})=>{
    const metadata={phase,error_name:text(error?.name||'Error',48),message:text(error?.message||error||'Sin mensaje'),cause:text(error?.cause?.message||error?.cause||''),resource:extra.resource||error?.resource,status:extra.status??error?.status,severity:extra.severity||'failed',...extra};
    const event=metadata.error_name==='AbortError'?'load_cancelled':extra.runtime?'runtime_error':'load_error';
    const key=`${event}:${phase}:${metadata.error_name}:${metadata.message}`;
    if(sentErrors.has(key)||errorBudget<=0)return;sentErrors.add(key);errorBudget--;
    return track(event,metadata);
  };
  function audioSnapshot(){const a=window.gh3Diag?.audio||{};let clock;try{clock=window.gh3Song?.clock?.();}catch{}return {at:Date.now(),underruns:a.underruns,skips:a.skips,clock};}
  function stopSamples(){if(sampleTimer!==null){clearTimeout(sampleTimer);sampleTimer=null;}previousAudio=null;}
  function armSamples(){
    if(!playing||document.visibilityState==='hidden'||sampleTimer!==null)return;
    previousAudio=audioSnapshot();
    sampleTimer=setTimeout(()=>{
      sampleTimer=null;
      if(!playing||document.visibilityState==='hidden'||window.gh3Diag?.stage!=='cancion'){stopSamples();return;}
      const diag=window.gh3Diag,speed=diag.speed||{},current=audioSnapshot();
      // A paused or finished clock is not an active-song sample.
      if(!Number.isFinite(current.clock)||!Number.isFinite(previousAudio.clock)||current.clock<=previousAudio.clock){armSamples();return;}
      const data={song:songName,game_pct:speed.juegoPct,clock_pct:speed.relojPct,fps:speed.imgS,interval_seconds:Math.round((current.at-previousAudio.at)/1000)};
      for(const [sourceKey,targetKey] of [['underruns','audio_underruns_delta'],['skips','audio_skips_delta']])if(Number.isFinite(current[sourceKey])&&Number.isFinite(previousAudio[sourceKey])&&current[sourceKey]>=previousAudio[sourceKey])data[targetKey]=current[sourceKey]-previousAudio[sourceKey];
      track('performance_sample',data);armSamples();
    },60000); // Claude 2026-10-22: cada 60 s (antes 30): mitad de muestras, mismo promedio.
  }
  const workerMessage=data=>{
    if(data?.type==='diag'&&(/-error$/.test(data.what||'')||data.what==='worker-rejection')&&!/Streaming-error$/.test(data.what||''))reportError('worker',{name:'WorkerError',message:data.error||data.what},{resource:data.url||data.file,status:data.status,runtime:true});
    if(data?.type==='songLoad'&&data.error)reportError('song',{name:'SongLoadError',message:data.error},{resource:data.resource,status:data.status});
    if(data?.type==='exit'&&data.code!==0)reportError('worker',{name:'EngineExit',message:`El motor terminó (${data.code}): ${data.what||'sin detalle'}`},{runtime:true});
    // Claude 2026-10-22 gpuval: errores de validación WebGPU recuperados (ya no cortan la imagen): mensaje real, una vez por mensaje.
    const val=data?.type==='r5SongReport'&&data.data?.temporal?.validacion;if(val&&val.ultimo){const seen=window.__gh3ValSeen||(window.__gh3ValSeen=new Set());if(!seen.has(val.ultimo)&&seen.size<5){seen.add(val.ultimo);reportError('renderer',{name:'GPUValidation',message:val.ultimo,cause:val.donde||''},{runtime:true,severity:'recovered'});}}
    if(data?.type==='r5SongReport'&&data.data?.fatal)reportError('renderer',{name:'RendererError',message:data.data.fatal},{runtime:true});
  };
  window.gh3Analytics={track,once,song,error:reportError,workerMessage,sessionId};
  let stageNow='idle';const LIVE_STAGE={preview:'menu',loadStart:'loading',levelConfirmed:'loading',songPlaying:'playing'};
addEventListener('gh3stage',({detail})=>{stopSamples();playing=detail?.stage==='songPlaying';songName=String(detail?.song||'unknown');stageNow=LIVE_STAGE[detail?.stage]||'idle';if(playing)armSamples();});
// Latido para el panel «En vivo»: sin esto no hay forma de saber quién sigue jugando.
setInterval(()=>{if(document.visibilityState!=='hidden')track('heartbeat',{stage:stageNow});},20000);
  document.addEventListener?.('visibilitychange',()=>{stopSamples();if(document.visibilityState!=='hidden')armSamples();});
  addEventListener('error',event=>{
    const t=event.target,tag=t&&t!==window&&t.tagName?String(t.tagName).toLowerCase():'';
    const url=t?.src||t?.currentSrc||t?.href||event.filename;
    if(url&&String(url).includes('vercel.live/'))return;
    // 2026-10-24: sin esto 400+ errores quedaban sin archivo; ahora van la etiqueta (img/script/link) y la URL (o línea) para saber qué falla.
    const where=url||(event.lineno?`línea ${event.lineno}:${event.colno||0}`:'');
    reportError('page',event.error||{name:'Error',message:event.message||'No se pudo cargar el recurso'},{resource:where?`${tag?tag+' ':''}${where}`:tag||'sin dato',runtime:true});
  },true);
  addEventListener('unhandledrejection',event=>reportError('promise',event.reason,{runtime:true}));
  once('page_view');
  let ended=false;
  addEventListener('pagehide',()=>{if(ended)return;ended=true;playing=false;stopSamples();const body=payload('session_ended',{seconds:Math.round((Date.now()-started)/1000),played:sent.has('game_started')});try{navigator.sendBeacon(endpoint,body);}catch{}});
})();
