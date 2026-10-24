const mode = new URLSearchParams(location.search).get('mode') || 'normal';
const names = {normal:'Carga normal', 'corrupt-upload':'Prueba de dato alterado', 'drop-fence':'Prueba de espera perdida'};
const dimensions = [[7,5],[13,3],[31,7],[33,2],[9,17],[65,4]];
const status = document.querySelector('#status'), count = document.querySelector('#count');
const detail = document.querySelector('#detail');
window.probeFinished = null; window.texturePreviews = [];
for (let i = 0; i < 6; i++) {
 const tile = document.createElement('figure'); tile.className = 'tile'; tile.id = `tile-${i+1}`;
 tile.innerHTML = `<div class="image"><span class="pending">Esperando imagen ${i+1}</span></div><figcaption><span>Textura ${String(i+1).padStart(2,'0')} <small>· ${dimensions[i].join(' × ')}</small></span><span class="badge pending">Pendiente</span></figcaption>`;
 document.querySelector('#gallery').append(tile);
}
for (const [id,next] of [['repeat','normal'],['corrupt','corrupt-upload'],['timeout','drop-fence']]) {
 document.querySelector('#'+id).addEventListener('click',()=>{location.search='?mode='+next;});
}
function failure(message) {status.textContent=message;status.classList.add('failure');}
function image(json) {
 const result=JSON.parse(json); window.texturePreviews.push(result);
 const tile=document.querySelector('#tile-'+result.seq), canvas=document.createElement('canvas');
 canvas.width=result.width;canvas.height=result.height;
 canvas.setAttribute('aria-label',`Textura ${result.seq} leída de la placa gráfica`);
 canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(result.rgba),result.width,result.height),0,0);
 tile.querySelector('.image').replaceChildren(canvas);tile.classList.add('loaded');
 const badge=tile.querySelector('.badge');badge.className=result.mismatches?'badge bad':'badge ok';
 badge.textContent=result.mismatches?'Diferencia detectada':'Comprobada';
 count.textContent=`${window.texturePreviews.length} de 6 imágenes recibidas`;
}
function finished(json) {
 const r=JSON.parse(json);window.probeFinished=r;
 if(r.ok){status.textContent='Las 6 imágenes llegaron completas';count.textContent='6 de 6 imágenes comprobadas';detail.textContent='La carga y la confirmación entre los dos hilos funcionaron. Cada píxel coincide con el patrón esperado.';}
 else if(mode==='corrupt-upload'&&r.cases?.[2]?.mismatches===1&&!r.errors?.length){
  status.textContent='El dato alterado fue detectado';detail.textContent='Se cambió un byte de la tercera imagen. La comparación lo detectó y detuvo la carga; las últimas tres imágenes quedan pendientes.';
 }else if(mode==='drop-fence'&&r.timeoutSequence===3&&!r.errors?.length){
  status.textContent='La espera se cortó sin colgar el navegador';detail.textContent='La tercera imagen llegó, pero ocultamos su confirmación. El hilo dejó de esperar a los 3 segundos. Las últimas tres imágenes no se cargan en esta prueba.';
 }else{failure('No se pudo completar la carga');detail.textContent=(r.errors||[]).join(' · ')||'No se recibió el resultado esperado.';}
 for(const button of document.querySelectorAll('button'))button.disabled=false;
}
if(!names[mode]){failure('Modo desconocido');}
else if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){failure('Falta habilitar la memoria compartida');detail.textContent='Abrí esta prueba desde su dirección local, no como archivo.';}
else if(!navigator.gpu){failure('Este navegador no permite esta prueba gráfica');detail.textContent='Probá en Chrome o Edge en esta PC.';}
else {
 status.textContent=names[mode]+' · preparando imágenes…';
 for(const button of document.querySelectorAll('button'))button.disabled=true;
 let timer=setTimeout(()=>{failure('La prueba tardó demasiado');detail.textContent='Podés volver a cargar para reintentar.';for(const b of document.querySelectorAll('button'))b.disabled=false;},25000);
 createGraphicsUploadProbe({arguments:[mode],onTextureResult:image,onProbeResult:json=>{clearTimeout(timer);finished(json);},
  onAbort:error=>{clearTimeout(timer);finished(JSON.stringify({ok:false,errors:[String(error)]}));}
 }).catch(error=>{clearTimeout(timer);finished(JSON.stringify({ok:false,errors:[String(error)]}));});
}
