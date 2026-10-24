// Lee el ejecutable local; no instala, ejecuta ni sube archivos.
import {open,stat,writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {GH3_X360_TARGET,identifyGh3Xex} from '../../src/original/gh3-target.js';
const input=process.argv[2];
if(!input){console.error('Uso: node tools/original/verify-xex.mjs <ruta/default.xex> [--out reporte.json]');process.exitCode=2;}
else{
 try{
  const path=resolve(input),info=await stat(path);
  if(!info.isFile())throw Error('La ruta no es un archivo');
  const file=await open(path,'r'),header=Buffer.alloc(4);
  try{await file.read(header,0,4,0);}finally{await file.close();}
  const preliminary=identifyGh3Xex({header,size:info.size});
  let sha256=null;
  if(preliminary.reason==='hash-required'){
   const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);sha256=hash.digest('hex');
  }
  const verdict=identifyGh3Xex({header,size:info.size,sha256});
  const report={checkedAt:new Date().toISOString(),path,size:info.size,sha256,target:GH3_X360_TARGET,...verdict,gameExecuted:false,browserRuntimeReady:false};
  console.log(JSON.stringify(report,null,2));
  const out=process.argv.indexOf('--out');
  if(out>=0){if(!process.argv[out+1])throw Error('Falta ruta para --out');await writeFile(process.argv[out+1],JSON.stringify(report,null,2));}
  process.exitCode=verdict.copyCompatible?0:1;
 }catch(e){console.error(String(e));process.exitCode=2;}
}
