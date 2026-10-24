import fs from 'node:fs/promises';
import path from 'node:path';
import {transform} from 'esbuild';

const files=process.argv.slice(2).map(file=>path.resolve(file));
if(!files.length)throw Error('Uso: node tools/iphone-probe/patch-webview-cache.mjs <r5snap-loader-ui.js> [...]');

const before='m.delivery?.sharedCache&&await activateChunkCache();const e=delivery?.onDemand?["base"]:packageIds(),a=delivery?.onDemand&&m.delivery?.sharedCache;';
const after='let a=!1;if(m.delivery?.sharedCache)try{await activateChunkCache(),a=!0}catch(e){state.cacheWarning=e.message}m.delivery&&(m.delivery.sharedCache=a);const e=delivery?.onDemand?["base"]:packageIds();';

for(const file of files){
  let source=await fs.readFile(file,'utf8');
  if(source.includes(after)){
    console.log(JSON.stringify({file,status:'already-patched'}));
    continue;
  }
  const occurrences=source.split(before).length-1;
  if(occurrences!==1)throw Error(`${file}: se esperó una coincidencia del cargador y aparecieron ${occurrences}.`);
  source=source.replace(before,after);
  const result=await transform(source,{loader:'js',minify:true,sourcemap:false,legalComments:'inline',target:'es2022'});
  await fs.writeFile(file,result.code);
  console.log(JSON.stringify({file,status:'patched',bytes:Buffer.byteLength(result.code)}));
}
