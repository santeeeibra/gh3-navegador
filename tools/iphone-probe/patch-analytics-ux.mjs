import fs from 'node:fs';
import path from 'node:path';
import {transform} from 'esbuild';

const roots=process.argv.slice(2).map(item=>path.resolve(item));
if(!roots.length)throw Error('Uso: node tools/iphone-probe/patch-analytics-ux.mjs <carpeta-gh3> [...]');
const source=fs.readFileSync('tools/analytics/gh3-analytics.js','utf8');
const analytics=(await transform(source,{loader:'js',minify:true,sourcemap:false,target:'es2022'})).code;

function replaceOne(input,from,to,label,file){
  const count=input.split(from).length-1;
  if(count!==1)throw Error(`${file}: ${label} esperaba una coincidencia y encontró ${count}.`);
  return input.replace(from,to);
}

for(const root of roots){
  const indexFile=path.join(root,'index.html'),loaderFile=path.join(root,'r5snap-loader-ui.js');
  let html=fs.readFileSync(indexFile,'utf8');
  if(!html.includes('src="gh3-analytics.js"'))html=replaceOne(html,'<script src="gh3-diag.js"></script>','<script src="gh3-analytics.js"></script>\n<script src="gh3-diag.js"></script>','script de analítica',indexFile);
  fs.writeFileSync(indexFile,html);
  fs.writeFileSync(path.join(root,'gh3-analytics.js'),analytics);

  let ui=fs.readFileSync(loaderFile,'utf8');
  if(!ui.includes('gh3Analytics')){
    ui=replaceOne(ui,
      'addEventListener("gh3stage",e=>{!delivery?.onDemand||!state.ready||(loading.stage(e.detail),stagePrefetch.event(e.detail))})',
      'addEventListener("gh3stage",e=>{e.detail?.stage==="songPlaying"&&window.gh3Analytics?.song(e.detail.song),!delivery?.onDemand||!state.ready||(loading.stage(e.detail),stagePrefetch.event(e.detail))})',
      'evento de canción',loaderFile);
    ui=replaceOne(ui,'function fail(e){state.error=e.message,document.','function fail(e){state.error=e.message,window.gh3Analytics?.track("load_error",{phase:state.phase||"loader"}),document.','error del cargador',loaderFile);
    ui=replaceOne(ui,'catch(o){state.cacheWarning=o.message}','catch(o){state.cacheWarning=o.message,window.gh3Analytics?.once("cache_fallback")}','fallback de caché',loaderFile);
    ui=replaceOne(ui,'state.phase="ready",state.stats=prepared.stats,$("loaderPlay")','state.phase="ready",state.stats=prepared.stats,window.gh3Analytics?.once("assets_ready"),$("loaderPlay")','recursos listos',loaderFile);

    const start='$("loaderPlay").onclick=async()=>{',end='};var W=window.Worker;';
    const at=ui.indexOf(start),until=ui.indexOf(end,at);
    if(at<0||until<0)throw Error(`${loaderFile}: no se encontró el manejador Jugar.`);
    let handler=ui.slice(at,until);
    handler=replaceOne(handler,start,start+'const e=$("loaderPlay"),a=e.textContent;window.gh3Analytics?.track("play_clicked"),!state.ready&&(e.textContent="Preparando…",$("loaderStatus").textContent="Preparando el juego…",await new Promise(t=>requestAnimationFrame(()=>requestAnimationFrame(t))));','inicio de Jugar',loaderFile);
    handler=replaceOne(handler,'if(await prepareSelected(),!state.ready)return}','if(await prepareSelected(),!state.ready)return e.textContent=a,void 0}','fallo de preparación',loaderFile);
    handler=replaceOne(handler,'}try{await window.r6ctx?.resume()}catch{}state.manualNavigation','}e.textContent="Iniciando…",$("loaderStatus").textContent="Iniciando el motor del juego…";try{await window.r6ctx?.resume()}catch{}state.manualNavigation','inicio del motor',loaderFile);
    ui=ui.slice(0,at)+handler+ui.slice(until);

    ui=replaceOne(ui,'if(loading.message(t.data||{}),t.data?.type!=="localCache")return;','if(loading.message(t.data||{}),t.data?.type==="mark"&&t.data.what==="wasm listo"&&window.gh3Analytics?.once("game_started"),t.data?.type!=="localCache")return;','motor iniciado',loaderFile);
    ui=replaceOne(ui,'a.addEventListener("error",t=>loading.fail("No se pudo continuar con el juego: "+t.message))','a.addEventListener("error",t=>{window.gh3Analytics?.track("load_error",{phase:"worker"}),loading.fail("No se pudo continuar con el juego: "+t.message)})','error del worker',loaderFile);
    ui=(await transform(ui,{loader:'js',minify:true,sourcemap:false,target:'es2022'})).code;
    fs.writeFileSync(loaderFile,ui);
  }
  console.log(JSON.stringify({root,analytics:fs.statSync(path.join(root,'gh3-analytics.js')).size,ui:fs.statSync(loaderFile).size,status:ui.includes('gh3Analytics')?'patched':'missing'}));
}
