// Claude 2026-10-11: abre la copia con notas de poder estelar visibles en el MISMO puerto 5440 (conserva partida, caché y controles).
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const base='http://127.0.0.1:5440/';
let alive=false,mine=false;
try{alive=(await fetch(base+'local-manifest.json')).ok;}catch{}
const isMine=async()=>{try{return /roadVS = [^)]*19815E13AC0DCC92/.test(await (await fetch(base+'r5snap-song-render.js')).text());}catch{return false;}};
if(alive)mine=await isMine();
if(alive&&!mine){console.log('\nHay otro servidor de GH3 abierto en 5440 (el cargador anterior).\nCerrá esa ventana negra (y la de Edge del juego) y volvé a abrir este acceso.\n');process.exitCode=1;}
else{
if(!alive){
  const p=spawn(process.execPath,['tools/d1-wasm/notesfix-server.mjs','5440'],{stdio:'inherit',windowsHide:true});
  p.on('error',e=>console.error(e));
  for(let start=Date.now();;){if(await isMine())break;if(Date.now()-start>10000)throw Error('No arrancó el servidor local.');await new Promise(r=>setTimeout(r,100));}
}
const candidates=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const edge=candidates.find(f=>fs.existsSync(f));if(!edge)throw Error('No encontré Edge. Abrí '+base+' en tu navegador.');
spawn(edge,['--new-window',base],{windowsHide:true,stdio:'ignore'}).unref();
console.log('GH3 abierto (copia con notas estrella). Dejá esta ventana abierta mientras jugás.');
}
