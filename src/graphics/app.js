import {GRAPHICS_PROFILES,graphicsProfile,loadGraphicsProfile,saveGraphicsProfile} from './profiles.js';
import {createRenderer} from './renderer.js';
import {cubeVertices,checkerTexture} from './scene.js';
const $=id=>document.getElementById(id),select=$('graphics-profile'),status=$('graphics-status');
let storage;try{storage=localStorage;}catch{}
let profile=loadGraphicsProfile(storage),renderer,raf=0,frameCount=0,windowStart=0,start=performance.now(),running=false,failed=false,generation=0;
const errors=[];
for(const p of Object.values(GRAPHICS_PROFILES)){const option=document.createElement('option');option.value=p.id;option.textContent=p.label;select.append(option);}select.value=profile;
const evidence=window.__graphicsEvidence={scene:'Escena propia de prueba; no GH3',userAgent:navigator.userAgent,errors,profile,frames:0};
function viewport(){const rect=renderer.canvas.getBoundingClientRect();return {width:rect.width,height:rect.height,pixelRatio:devicePixelRatio};}
function applyProfile(id){profile=graphicsProfile(id).id;select.value=profile;evidence.profile=profile;$('profile-description').textContent=graphicsProfile(profile).description;if(renderer){evidence.plan=renderer.resize(profile,viewport());$('graphics-settings').textContent=`${evidence.plan.width} × ${evidence.plan.height} · MSAA ${evidence.plan.samples}× · Filtrado ${evidence.plan.anisotropy}×`;}return evidence.plan;}
function stop(){running=false;cancelAnimationFrame(raf);}
function reportError(message){failed=true;errors.push(message);status.textContent=message;stop();$('graphics-restart').hidden=false;}
function tick(now){
 if(!running)return;
 try{
  const plan=renderer.plan;renderer.draw(cubeVertices((now-start)/1000,plan.width/plan.height));evidence.frames++;frameCount++;
  if(windowStart&&now-windowStart>=1000){evidence.fps=Math.round(frameCount*1000/(now-windowStart));$('graphics-fps').textContent=`${evidence.fps} FPS de presentación`;frameCount=0;windowStart=now;}
  if(!windowStart)windowStart=now;raf=requestAnimationFrame(tick);
 }catch(e){reportError(String(e));}
}
function resume(){if(renderer&&!running&&!failed&&!document.hidden){running=true;windowStart=0;frameCount=0;raf=requestAnimationFrame(tick);}}
function release(){
 stop();generation++;window.__graphicsProbe=null;const old=renderer;renderer=null;if(old){old.dispose();old.canvas.replaceWith(old.canvas.cloneNode(false));}
}
async function initialize(){
 release();const token=generation;failed=false;const staleCanvas=document.getElementById('graphics-canvas');staleCanvas.replaceWith(staleCanvas.cloneNode(false));status.textContent='Iniciando gráficos…';$('graphics-restart').hidden=true;
 try{
  const canvas=document.getElementById('graphics-canvas');
  const query=new URLSearchParams(location.search);
  const candidate=await createRenderer(canvas,{backend:query.get('backend')||'auto',readback:query.get('readback')==='1',debug:query.get('debug')==='1',onError:message=>{if(token===generation)reportError(message);}});
  if(token!==generation){candidate.dispose();return;}renderer=candidate;evidence.gpu=renderer.metadata;
  renderer.uploadTexture(checkerTexture());applyProfile(profile);evidence.backend=renderer.backend;evidence.fallbackReason=renderer.fallbackReason||'';
  status.textContent=`${renderer.backend} activo${renderer.fallbackReason?' · alternativa compatible activada':''}`;
  window.__graphicsProbe={get renderer(){return renderer;},pause:stop,resume,setProfile:applyProfile,async capture(){await renderer.flush();return {backend:renderer.backend,plan:renderer.plan,errors:[...new Set([...errors,...renderer.errors])],center:renderer.readback?await renderer.readPixel(Math.floor(renderer.plan.width/2),Math.floor(renderer.plan.height/2)):null,gpu:renderer.metadata};}};
  resume();
 }catch(e){if(token===generation)reportError(String(e));}
}
select.addEventListener('change',()=>{try{saveGraphicsProfile(storage,select.value);applyProfile(select.value);}catch(e){reportError(String(e));}});
$('graphics-restart').onclick=initialize;
$('graphics-download').onclick=()=>{const blob=new Blob([JSON.stringify({...evidence,verifiedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='prueba-grafica.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
addEventListener('pagehide',release);
addEventListener('pageshow',event=>{if(event.persisted&&!renderer)initialize();});
addEventListener('resize',()=>{if(renderer)applyProfile(profile);});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else resume();});
applyProfile(profile);initialize();
