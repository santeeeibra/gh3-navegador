import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';

const source=path.resolve(process.argv[2]||'artifacts/d1-wasm/autopista60-pub/demo');
const destination=path.resolve(process.argv[3]||'artifacts/monitor-diario/demo');
if(source===destination||source.startsWith(destination+path.sep)||destination.startsWith(source+path.sep))throw Error('La copia de revisión debe ser independiente de la fuente.');
const hash=data=>createHash('sha256').update(data).digest('hex');
const engineFiles=['gh3-web.js','gh3-web.wasm','manifest.json'];
const original=Object.fromEntries(engineFiles.map(file=>[file,hash(fs.readFileSync(path.join(source,file)))]));
fs.mkdirSync(destination,{recursive:true});
// Copy regular public files only. Game chunks remain in their separate project.
for(const entry of fs.readdirSync(source,{withFileTypes:true}))if(entry.isFile())fs.copyFileSync(path.join(source,entry.name),path.join(destination,entry.name));
let loader=fs.readFileSync(path.join(source,'r5snap-loader-ui.js'),'utf8');
const replace=(from,to,label)=>{
  if(loader.includes(to))return;
  const count=loader.split(from).length-1;
  if(count!==1)throw Error(`${label}: se esperaba una coincidencia; se encontraron ${count}.`);
  loader=loader.replace(from,to);
};
replace('window.gh3Analytics?.track("load_error",{phase:state.phase||"loader"})','window.gh3Analytics?.error?.(state.phase||"loader",e)','detalle del cargador');
replace('window.gh3Analytics?.once("cache_fallback")','window.gh3Analytics?.once("cache_fallback",{phase:"preparing",error_name:o.name,message:o.message,severity:"recovered"})','detalle de caché alternativa');
replace('window.gh3Analytics?.track("load_error",{phase:"worker"})','window.gh3Analytics?.error?.("worker",t.error||{name:"WorkerError",message:t.message},{resource:t.filename})','detalle del worker');
replace('loading.message(t.data||{})','window.gh3Analytics?.workerMessage?.(t.data),loading.message(t.data||{})','mensajes del worker');
replace('if(!p.ok)throw Error(`No se pudo cargar una parte (${p.status}).`)','if(!p.ok)throw Object.assign(Error(`No se pudo cargar una parte (${p.status}).`),{resource:chunkURL(a,t,r),status:p.status})','HTTP de partes');
replace('catch(p){if(n?.aborted||p.name==="QuotaExceededError"||c===2)throw p}','catch(p){if(!p.resource)try{p.resource=chunkURL(a,t,r)}catch{}if(n?.aborted||p.name==="QuotaExceededError"||c===2)throw p}','recurso de partes');
replace('if(!a.ok)throw Error("No pude obtener la lista de archivos.")','if(!a.ok)throw Object.assign(Error("No pude obtener la lista de archivos."),{resource:delivery?.manifest||"/local-manifest.json",status:a.status})','HTTP del manifiesto');
// The last patch is intentionally strict about the known bundle's bindings.
const analytics=fs.readFileSync('tools/analytics/gh3-analytics.js','utf8');
fs.writeFileSync(path.join(destination,'gh3-analytics.js'),(await transform(analytics,{minify:true,target:'es2022'})).code);
fs.writeFileSync(path.join(destination,'r5snap-loader-ui.js'),(await transform(loader,{minify:true,target:'es2022'})).code);
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
const version=hash(JSON.stringify(original)+loader+analytics).slice(0,16);
html=html.replace(/<meta name="gh3-build" content="[^"]*">\s*/g,'').replace('</head>',`<meta name="gh3-build" content="${version}">\n</head>`);
fs.writeFileSync(path.join(destination,'index.html'),html);
const output=Object.fromEntries(engineFiles.map(file=>[file,hash(fs.readFileSync(path.join(destination,file)))]));
if(JSON.stringify(output)!==JSON.stringify(original))throw Error('Cambió un archivo del motor o del manifiesto.');
fs.mkdirSync('artifacts/monitor-diario',{recursive:true});
fs.writeFileSync('artifacts/monitor-diario/stage-result.json',JSON.stringify({source,destination,version,engine_sha256:output,chunks_copied:false,local_review_only:true},null,2));
console.log(`Copia de revisión preparada; versión ${version}. Motor y manifiesto conservados. No se copiaron partes ni se publicó.`);
