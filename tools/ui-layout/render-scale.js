// Internal scene resolution: no game clock, input or audio changes.
(()=>{
  if(window.gh3RenderScale)return;
  const key='gh3-render-scale',valid=value=>[1,.75,.5].includes(value);
  let requested=1,port=null,applied=null,dimensions=null,saveFailed=false,select,status;
  try{const saved=Number(localStorage.getItem(key));if(valid(saved))requested=saved;}catch{}
  const api=window.gh3RenderScale={
    get requested(){return requested;},get applied(){return applied;},get connected(){return !!port;},
    set(value){if(!valid(value))return false;if(value!==requested){applied=null;dimensions=null;}requested=value;
      try{localStorage.setItem(key,String(value));saveFailed=false;}catch{saveFailed=true;}
      send();refresh();return true;
    }
  };
  function send(){try{port?.postMessage({type:'render-scale',scale:requested});}catch{port=null;applied=null;dimensions=null;}}
  function refresh(){
    if(!status)return;
    select.value=String(requested);
    const consumer=new URLSearchParams(location.search).get('r5liveconsumer')||'';
    const unsupported=!!consumer&&!consumer.startsWith('r5snap-native60-');
    select.disabled=unsupported;
    if(unsupported)status.textContent='El modo gráfico actual no admite cambiar la resolución interna.';
    else if(!port)status.textContent='Se aplicará al iniciar el juego.';
    else if(applied===null||applied!==requested&&applied>requested)status.textContent='Aplicando resolución…';
    else status.textContent=`Aplicada: ${Math.round(applied*100)} % · ${dimensions?.join(' × ')}${applied<requested?' · protección automática':''}.`;
    if(saveFailed)status.textContent+=' No se pudo guardar: se usará sólo durante esta visita.';
  }
  // Observe the existing GPU→page port without replacing its frame listener.
  const OriginalWorker=window.Worker;
  function Worker(...args){const worker=new OriginalWorker(...args);
    worker.addEventListener('message',({data})=>{
      if(data?.type!=='r5NativePort'||!data.port)return;
      port=data.port;applied=null;dimensions=null;
      port.addEventListener('message',event=>{
        const m=event.data;
        if(m?.type!=='render-scale-status'||!valid(m.applied)||!valid(m.requested))return;
        if(m.requested!==requested)return;
        applied=m.applied;dimensions=[m.width,m.height];refresh();
      });
      port.start();send();refresh();
    });return worker;
  }
  Worker.prototype=OriginalWorker.prototype;Object.setPrototypeOf(Worker,OriginalWorker);window.Worker=Worker;
  function mount(){
    const graphics=document.querySelector('#gh3Panel section[data-tab="gfx"]');if(!graphics)return;
    const box=document.createElement('div');box.id='gh3Resolution';
    const label=document.createElement('label');label.htmlFor='gh3RenderScale';label.textContent='Resolución interna';
    select=document.createElement('select');select.id='gh3RenderScale';select.setAttribute('aria-describedby','gh3RenderScaleHint gh3RenderScaleStatus');
    for(const [value,text]of [[1,'100 % · 1280 × 720'],[.75,'75 % · 960 × 540'],[.5,'50 % · 640 × 360']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;select.append(option);}
    status=document.createElement('p');status.id='gh3RenderScaleStatus';status.className='soon';status.setAttribute('role','status');
    const hint=document.createElement('p');hint.id='gh3RenderScaleHint';hint.className='soon';hint.textContent='Menor resolución dibuja menos píxeles, con menos nitidez. La protección automática puede bajarla más. Se guarda en este navegador.';
    box.append(label,select,status,hint);graphics.prepend(box);
    select.addEventListener('change',()=>api.set(Number(select.value)));
    const style=document.createElement('style');style.textContent='#gh3Resolution{padding:12px 0;margin-bottom:12px;border-bottom:1px solid var(--line)}#gh3Resolution>label{display:block;font-weight:600;font-size:13px;margin-bottom:8px}#gh3Resolution>select{box-sizing:border-box;width:100%;max-width:100%;min-height:44px;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--box);color:var(--fg)}#gh3Resolution select:focus-visible{outline:2px solid var(--ok);outline-offset:2px}#gh3Resolution .soon{line-height:1.5}';document.head.append(style);
    refresh();observer.disconnect();
  }
  const observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});mount();
})();
