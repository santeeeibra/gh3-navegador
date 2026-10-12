// R5F: captura de cuadros del menú en Edge con un build aislado, reservando el turno de
// pruebas con identificador propio y cerrando SOLO los procesos que este script abre
// (servidor por su handle de proceso; Edge lo cierra verify-d4 en su finally).
// Uso: node tools/d1-wasm/r5frame-capture.mjs <build-dir> <out-dir> <etiqueta> [puerto]
//   ej.: node tools/d1-wasm/r5frame-capture.mjs artifacts/d1-wasm/r5frame-v2/d4 artifacts/d1-wasm/r5frame-v2/runs r5f-v2-menu 5186
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import {reserveTurn,releaseTurn} from '../gpu-capture/lib.mjs';
const [build,out,label,portArg='5186']=process.argv.slice(2);
if(!build||!out||!label)throw Error('uso: r5frame-capture.mjs <build-dir> <out-dir> <etiqueta> [puerto]');
const port=Number(portArg);
// El puerto debe estar libre: nunca reutilizar un servidor ajeno.
await new Promise((ok,bad)=>{const s=net.createServer().once('error',()=>bad(Error(`puerto ${port} ocupado`))).once('listening',()=>s.close(ok)).listen(port,'127.0.0.1');});
fs.mkdirSync(out,{recursive:true});
const token=reserveTurn(`R5F ${label}: captura GH3 menú en Edge (build ${build}), servidor propio :${port}`);
let server,code=1;
try{
 server=spawn(process.execPath,['tools/d1-wasm/serve-d4.mjs',String(port)],{env:{...process.env,D4_ROOT:build},stdio:['ignore',fs.openSync(`${out}/serve-${port}.log`,'w'),'pipe']});
 await new Promise(r=>setTimeout(r,1500));
 if(server.exitCode!==null)throw Error('servidor terminó');
 const r=spawnSync(process.execPath,['tools/d1-wasm/verify-d4.mjs','230',label,'null','silent','decode'],{stdio:'inherit',timeout:900000,
  env:{...process.env,D4_URL:`http://127.0.0.1:${port}/`,D4_OUT:out,G1_CP_WAIT:'event',G1E_PRESS:'150:start,175:start',G1_R5FRAME:'at:182000,frames:4'}});
 code=r.status??1;
}catch(e){console.error(e.message);}
finally{
 if(server&&server.exitCode===null){server.kill();await new Promise(r=>server.once('exit',r));}
 releaseTurn(token,`R5F ${label}: terminado (exit ${code}); servidor :${port} propio cerrado. Edge cerrado por verify-d4.`);
}
console.log(JSON.stringify({label,exit:code,serverPid:server?.pid,serverExit:server?.exitCode??server?.signalCode}));
process.exitCode=code;
