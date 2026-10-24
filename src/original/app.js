import{GRAPHICS_PROFILES,loadGraphicsProfile,saveGraphicsProfile}from'../graphics/profiles.js';
import{inspectGameFile,browserCapabilities}from'./probe.js';
const $=id=>document.getElementById(id);
for(const [key,value]of Object.entries(browserCapabilities())){
 const labels={wasm:'Motor WebAssembly',webgl2:'Gráficos WebGL 2',audio:'Audio del navegador',gamepad:'Mandos y guitarras',threads:'Hilos compartidos',secure:'Conexión segura'};
 const row=document.createElement('li');row.textContent=labels[key]+': '+(value?'disponible':'no disponible');$('capabilities').append(row);
}
$('game-file').onchange=async e=>{
 const file=e.target.files[0];if(!file)return;
 $('file-status').textContent='Identificando archivo…';$('details').replaceChildren();
 try{
  const info=await inspectGameFile(file);
  for(const text of [info.name,(info.size/1024/1024).toFixed(1)+' MB',info.format,'Plataforma: '+info.platform]){
   const p=document.createElement('p');p.textContent=text;$('details').append(p);
  }
  $('file-status').textContent=info.next;
 }catch{$('file-status').textContent='No pudimos leer el archivo. Elegilo de nuevo.';}
};

let graphicsStorage;try{graphicsStorage=localStorage;}catch{}
const graphicsSelect=$('graphics-profile');
for(const p of Object.values(GRAPHICS_PROFILES)){const option=document.createElement('option');option.value=p.id;option.textContent=p.label;graphicsSelect.append(option);}
graphicsSelect.value=loadGraphicsProfile(graphicsStorage);
graphicsSelect.onchange=()=>saveGraphicsProfile(graphicsStorage,graphicsSelect.value);
