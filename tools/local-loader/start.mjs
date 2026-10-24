import fs from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const base='http://127.0.0.1:5440/';
let live=null;
try{const r=await fetch(base+'local-manifest.json');if(r.ok)live=await r.json();}catch{}
if(!fs.existsSync('artifacts/local-loader/catalog.json')){
  const p=spawn(process.execPath,['tools/local-loader/build.mjs'],{stdio:'inherit',windowsHide:true});
  await new Promise((resolve,reject)=>{p.on('error',reject);p.on('exit',c=>c===0?resolve():reject(Error('No se pudo preparar el cargador.')));});
}
const expected=JSON.parse(fs.readFileSync('artifacts/local-loader/catalog.json')).version;
if(live&&live.version!==expected)throw Error('Cerrá el servidor anterior del cargador y volvé a abrir este acceso.');
if(!live){
  const p=spawn(process.execPath,['tools/local-loader/server.mjs','5440'],{stdio:'inherit',windowsHide:true});
  p.on('error',e=>console.error(e));
  for(let start=Date.now();;){try{if((await fetch(base+'local-manifest.json')).ok)break;}catch{}if(Date.now()-start>10000)throw Error('No arrancó el servidor local.');await new Promise(r=>setTimeout(r,100));}
}
// Use the already installed browser, preserving its storage on a fixed origin.
const candidates=['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const edge=candidates.find(f=>fs.existsSync(f));if(!edge)throw Error('No encontré Edge. Abrí '+base+' en tu navegador.');
spawn(edge,['--new-window',base],{windowsHide:true,stdio:'ignore'}).unref();
console.log('Cargador abierto. Conservá el servidor local abierto mientras jugás.');
