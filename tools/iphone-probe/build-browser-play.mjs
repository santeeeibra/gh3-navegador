// Direct browser preparation: no manual package selection or import step.
// Output remains local until explicitly staged for an authorized deployment.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const out='artifacts/browser-play',demo=out+'/demo',source='artifacts/mobile-private/demo';
fs.mkdirSync(demo,{recursive:true});fs.mkdirSync(demo+'/chunks',{recursive:true});
const header=JSON.parse(fs.readFileSync('artifacts/mobile-private/package-header.json'));
if(!header.diag||!header.touch||header.textureMode!=='rgba8-no-bc')throw Error('Primero reconstruir el paquete móvil integrado.');
for(const f of header.static){const name=f.url.split('/').at(-1);fs.copyFileSync(source+'/'+name,demo+'/'+name);}
fs.copyFileSync('src/original/gh3-touch.js',demo+'/gh3-touch.js');
fs.copyFileSync('src/original/gh3-diag.js',demo+'/gh3-diag.js');
function replaceOnce(text,a,b){if(text.split(a).length!==2)throw Error('Cambió el cargador: '+a);return text.replace(a,b);}
const uiPath=path.resolve('tools/local-loader/ui.mjs'),cachePath=path.resolve('tools/local-loader/cache.mjs');
await build({entryPoints:[uiPath],outfile:demo+'/r5snap-loader-ui.js',bundle:true,format:'esm',platform:'browser',target:'es2022',plugins:[{name:'direct-browser-loader',setup(b){
 b.onLoad({filter:/\.mjs$/},args=>{
  if(args.path!==uiPath&&args.path!==cachePath)return;
  let s=fs.readFileSync(args.path,'utf8');
  if(args.path===cachePath)s=replaceOnce(s,'`/local-chunk/${m.version}/${f.id}/${i}`','`/gh3/chunks/${f.chunks[i].hash}`');
  else{
   s=replaceOnce(s,"fetch('/local-manifest.json'","fetch('/gh3/manifest.json'");
   s=replaceOnce(s,'<option value="first4">Las primeras cuatro</option>','');
   for(const [n,name] of [['02','Talk Dirty to Me'],['03','Hit Me with Your Best Shot'],['04','Story of My Life']])s=replaceOnce(s,`<div><small>${n}</small><b>${name}</b></div>`,'');
   s=replaceOnce(s,'<span class="localBadge">Prueba local</span>','<span class="localBadge">Prueba en navegador</span>');
   s=replaceOnce(s,"$('loaderPrepare').disabled=false;","$('loaderPrepare').disabled=false; $('loaderPlay').disabled=false; $('loaderPrepare').hidden=true;");
   s=replaceOnce(s,'  if(!state.ready)return;','  if(!state.ready){ try{await window.r6ctx?.resume();}catch{} await prepareSelected(); if(!state.ready)return; }');
   s=replaceOnce(s,"}catch(e){fail(e);}finally{running=false;$('loaderPrepare').disabled=$('loaderSongs').disabled=false;$('loaderPause').disabled=true;}","}catch(e){fail(e);}finally{running=false;$('loaderPrepare').disabled=$('loaderSongs').disabled=false;$('loaderPause').disabled=true;if(!state.ready)$('loaderPlay').disabled=false;}");
   s=s.replace('Preparar para jugar','Slow Ride').replace('Listo para preparar las canciones. No hace falta elegir carpeta.','Tocá Jugar. La primera carga prepara los archivos automáticamente.').replace('Archivos guardados en este navegador','Archivos guardados en este navegador');
  }
  return {contents:s,loader:'js',resolveDir:path.dirname(args.path)};
 });
}}]});
const catalog=header.catalog,packageFile='artifacts/mobile-private/GH3-Slow-Ride-privado.gh3mobile',fd=fs.openSync(packageFile,'r'),pre=Buffer.alloc(12);fs.readSync(fd,pre,0,12,0);const start=12+pre.readUInt32LE(8),byHash=new Map(header.chunks.map(c=>[c.hash,c]));
const used=new Set([...catalog.packages.base.files,...catalog.packages.slowride.files].flatMap(id=>catalog.files[id].chunks.map(c=>c.hash)));let bytes=0;
try{for(const hash of used){const c=byHash.get(hash);if(!c)throw Error('Falta una parte del juego.');const b=Buffer.alloc(c.size);let got=0;while(got<c.size){const n=fs.readSync(fd,b,got,c.size-got,start+c.offset+got);if(!n)throw Error('Lectura incompleta.');got+=n;}if(crypto.createHash('sha256').update(b).digest('hex')!==hash)throw Error('Parte dañada.');fs.writeFileSync(demo+'/chunks/'+hash,b);bytes+=b.length;}}finally{fs.closeSync(fd);}
fs.writeFileSync(demo+'/manifest.json',JSON.stringify(catalog));
// Worker fallback reads only dependencies in the hosted list. A missing part
// remains a visible diagnostic error rather than accessing the original folder.
let runtime=fs.readFileSync(demo+'/r5snap-local-fs.js','utf8');
runtime=replaceOnce(runtime,'`/local-chunk/${configuration.version}/${f.id}/${i}`','`/gh3/chunks/${f.chunks[i].hash}`');
runtime=runtime.replace('Falta un archivo y el servidor local no está disponible:','No está disponible una dependencia de esta prueba:');fs.writeFileSync(demo+'/r5snap-local-fs.js',runtime);
const result={out,gameChunks:used.size,gameBytes:bytes,manualImport:false,diag:true,touch:true,textureMode:'rgba8-no-bc'};fs.writeFileSync(out+'/RESULTADO-BUILD.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
