// One bounded verification, waiting for the existing shared test turn. Does not
// release another holder's reservation or launch the game before owning a turn.
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {TURN,reserveTurn,releaseTurn,requireTurn} from '../gpu-capture/lib.mjs';
const root=path.resolve('artifacts/local-loader');fs.mkdirSync(root,{recursive:true});
const deadline=Date.now()+20*60*1000;
while(!fs.readFileSync(TURN,'utf8').includes('Estado: LIBRE')){
  fs.writeFileSync(path.join(root,'test-wait.json'),JSON.stringify({state:'waiting',updated:new Date().toISOString()}));
  if(Date.now()>deadline)throw Error('El turno de pruebas sigue ocupado; no se ejecutó el juego.');
  await new Promise(r=>setTimeout(r,2000));
}
fs.copyFileSync(TURN,'artifacts/respaldo/2026-10-11-cargador-local/PRUEBAS-ANTES.md');
const token=reserveTurn('Codex: comprobar cargador automático local, sin elegir carpeta');
requireTurn(token);fs.writeFileSync(TURN,fs.readFileSync(TURN,'utf8').replace('Quién: Claude','Quién: Codex'));
fs.writeFileSync(path.join(root,'test-wait.json'),JSON.stringify({state:'running',updated:new Date().toISOString()}));
try{
  const stdout=fs.openSync(path.join(root,'game-check.stdout.log'),'w'),stderr=fs.openSync(path.join(root,'game-check.stderr.log'),'w');
  let code;
  try{
    const child=spawn(process.execPath,['tools/local-loader/game-check.mjs',process.argv[2]||'140'],{env:{...process.env,GPUCAP_TURN:token},windowsHide:true,stdio:['ignore',stdout,stderr]});
    code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
  }finally{fs.closeSync(stdout);fs.closeSync(stderr);}
  process.exitCode=code||0;
  console.log(fs.readFileSync(path.join(root,'game-check.stdout.log'),'utf8'));
  if(code)console.log(fs.readFileSync(path.join(root,'game-check.stderr.log'),'utf8'));
}finally{
  releaseTurn(token,'Codex: verificación del cargador finalizada; ver artifacts/local-loader');
  fs.writeFileSync(path.join(root,'test-wait.json'),JSON.stringify({state:'finished',updated:new Date().toISOString()}));
}
