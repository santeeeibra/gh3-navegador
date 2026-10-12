(async()=>{
  const S=GH3PrivateStore,$=id=>document.getElementById(id);let stopped=false,running=false;
  const status=s=>$('status').textContent=s;
  const registration=navigator.serviceWorker.register('private-sw.js',{scope:'/iphone/'});
  async function control(){await registration;await navigator.serviceWorker.ready;if(navigator.serviceWorker.controller)return;await new Promise((resolve,reject)=>{const done=()=>{clearTimeout(t);navigator.serviceWorker.removeEventListener('controllerchange',done);resolve();};const t=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);reject(Error('Recargá esta página para activar el cargador privado.'));},10000);navigator.serviceWorker.addEventListener('controllerchange',done);if(navigator.serviceWorker.controller)done();});}
  registration.catch(e=>status('No pude activar el cargador: '+e.message));
  $('file').onchange=()=>{$('import').disabled=!$('file').files.length;};$('pause').onclick=()=>{stopped=true;};
  $('import').onclick=async()=>{
    if(running)return;running=true;stopped=false;$('import').disabled=$('file').disabled=true;$('pause').disabled=false;$('play').hidden=true;
    let chunks,priv;
    try{
      const file=$('file').files[0];if(!file)throw Error('Elegí el paquete.');
      const prefix=new Uint8Array(await file.slice(0,12).arrayBuffer());
      if(prefix.length!==12||new TextDecoder().decode(prefix.slice(0,8))!=='GH3MOB01')throw Error('Este archivo no es un paquete móvil.');
      const size=new DataView(prefix.buffer).getUint32(8,true);if(size<1||size>8*1048576||12+size>file.size)throw Error('Cabecera inválida.');
      const m=S.validate(JSON.parse(await file.slice(12,12+size).text()),file.size,12+size);
      chunks=await S.openChunks();priv=await S.openPrivate();let done=0,reused=0;
      for(const c of m.chunks){
        if(stopped)throw new DOMException('Preparación pausada. Volvé a elegir el mismo paquete para retomarla.','AbortError');
        let blob=await S.get(chunks,'chunks',c.hash);
        if(blob instanceof Blob&&blob.size===c.size&&await S.hash(blob)===c.hash)reused+=c.size;
        else{blob=file.slice(12+size+c.offset,12+size+c.offset+c.size);if(await S.hash(blob)!==c.hash)throw Error('Una parte del paquete está dañada.');await S.put(chunks,'chunks',c.hash,blob);}
        done+=c.size;$('progress').value=done/(file.size-12-size);status(`${Math.floor(100*$('progress').value)} % · ${(done/1048576).toFixed(1)} MiB guardados · ${(reused/1048576).toFixed(1)} MiB reutilizados`);
        await new Promise(r=>setTimeout(r,0));
      }
      // Commit only when every part is verified. Preserve previous complete package on failure.
      await S.put(priv,'meta','active',m);await control();$('play').hidden=false;status('Paquete listo. Podés abrir la prueba de arranque.');
    }catch(e){status(e.name==='QuotaExceededError'?'No hay espacio suficiente. Las partes guardadas se conservan para reintentar.':e.message);}
    finally{chunks?.close();priv?.close();running=false;$('import').disabled=$('file').disabled=false;$('pause').disabled=true;}
  };
  try{const db=await S.openPrivate();const active=await S.get(db,'meta','active');db.close();if(active){await control();$('play').hidden=false;status('Hay un paquete guardado. Podés abrir la prueba o importar otra versión.');}}catch(e){status(e.message);}
})();
