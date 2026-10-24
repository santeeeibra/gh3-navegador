// Local package only. Never copy the output into dist or Vercel output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {integrateMobilePage} from './integrate-mobile-page.mjs';
const out='artifacts/mobile-private',demo=out+'/demo',source='artifacts/local-loader/demo';
fs.mkdirSync(demo,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex'),sources={};
for(const name of fs.readdirSync(source))if(fs.statSync(source+'/'+name).isFile()){sources[name]=sha(fs.readFileSync(source+'/'+name));fs.copyFileSync(source+'/'+name,demo+'/'+name);}
const manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const valid=new Set(edge.results.filter(r=>r.moduleValid).map(r=>r.name.split('_')[1].split('.')[0])),shaders={};
for(const [id,s] of Object.entries(manifest))if(valid.has(id))shaders[id]={id,stage:s.stage,constants:s.constants,code:fs.readFileSync(s.wgsl,'utf8')};
if(!shaders['19815E13AC0DCC92']||!shaders['89FD5F25CB8034BB'])throw Error('Faltan shaders de notas estrella.');
await build({entryPoints:['tools/r5-live-song/thread-consumer.mjs'],outfile:demo+'/r5snap-song-render.js',bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_SHADERS__:JSON.stringify(shaders)}});
await build({entryPoints:['tools/iphone-probe/mobile-gpu-worker.mjs'],outfile:demo+'/r5snap-song-gpu.js',bundle:true,format:'iife',platform:'browser',target:'es2022'});
let html=fs.readFileSync(demo+'/index.html','utf8');
if(!html.includes("location.replace('/?'+q)"))throw Error('Cambió la navegación del cargador.');
html=html.replace("location.replace('/?'+q)","location.replace(location.pathname+'?'+q)");
html=html.replace('<title>GH3 · cargador local</title>','<title>GH3 · prueba privada de arranque</title>');
fs.writeFileSync(demo+'/index.html',html);
let ui=fs.readFileSync(demo+'/r5snap-loader-ui.js','utf8');
if(!ui.includes('<option value="first4">Las primeras cuatro</option>'))throw Error('Cambió la selección de canciones.');
ui=ui.replace('<option value="first4">Las primeras cuatro</option>','');fs.writeFileSync(demo+'/r5snap-loader-ui.js',ui);
const deliveredSources=integrateMobilePage(demo);
const catalog=JSON.parse(fs.readFileSync('artifacts/local-loader/catalog.json')),config=JSON.parse(fs.readFileSync('artifacts/local-loader/server-config.json'));
const log=fs.readFileSync('artifacts/local-loader/game-1791752598248/runtime.log','utf8').toLowerCase();
const base=new Set(catalog.packages.base.files);
// Include extra dependencies actually observed by the current loader on PC.
for(const f of catalog.files)if(!/^data\/(music|compressed\/songs)\//i.test(f.path)&&log.includes(f.path.replaceAll('/','\\').toLowerCase()))base.add(f.id);
catalog.packages={base:{title:'Arranque y recursos compartidos',files:[...base]},slowride:catalog.packages.slowride};
catalog.version=sha(Buffer.from(JSON.stringify({...catalog,version:undefined})));
const records=new Map(),chunks=[],staticFiles=[];let bodySize=0;
function add(hash,size,file,offset){if(records.has(hash)){if(records.get(hash).size!==size)throw Error('Hash incompatible.');return;}const c={hash,size,offset:bodySize};bodySize+=size;chunks.push(c);records.set(hash,{...c,file,fileOffset:offset});}
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm'};
for(const name of fs.readdirSync(demo)){
 const file=demo+'/'+name;if(!fs.statSync(file).isFile())continue;
 const bytes=fs.readFileSync(file),parts=[];
 for(let offset=0;offset<bytes.length;offset+=2*1048576){const b=bytes.subarray(offset,offset+2*1048576),hash=sha(b);add(hash,b.length,file,offset);parts.push(hash);}
 staticFiles.push({url:'/iphone/private/'+name,type:types[path.extname(name)]||'application/octet-stream',size:bytes.length,parts});
}
for(const id of new Set([...base,...catalog.packages.slowride.files])){
 const f=catalog.files[id],file=path.join(config.game,...f.path.split('/'));if(fs.statSync(file).size!==f.size)throw Error('Cambió el juego.');
 for(const c of f.chunks)add(c.hash,c.size,file,c.offset);
}
const header={format:'gh3-mobile-private-1',title:'Slow Ride · móvil RGBA, táctil y diagnóstico',starNotesFix:true,textureMode:'rgba8-no-bc',diag:true,touch:true,catalog,static:staticFiles,chunks};
const bytes=Buffer.from(JSON.stringify(header)),prefix=Buffer.alloc(12);prefix.write('GH3MOB01');prefix.writeUInt32LE(bytes.length,8);
const filename=out+'/GH3-Slow-Ride-privado.gh3mobile',fd=fs.openSync(filename,'w'),buffer=Buffer.alloc(2*1048576);
try{
 fs.writeSync(fd,prefix);fs.writeSync(fd,bytes);
 for(const r of records.values()){const input=fs.openSync(r.file,'r');try{let got=0;while(got<r.size){const n=fs.readSync(input,buffer,got,r.size-got,r.fileOffset+got);if(!n)throw Error('Lectura incompleta.');got+=n;}const b=buffer.subarray(0,r.size);if(sha(b)!==r.hash)throw Error('Una fuente cambió durante el armado.');fs.writeSync(fd,b);}finally{fs.closeSync(input);}}
}finally{fs.closeSync(fd);}
for(const [name,hash] of Object.entries(sources))if(sha(fs.readFileSync(source+'/'+name))!==hash)throw Error('Cambió la fuente de PC durante el armado.');
const result={filename,size:fs.statSync(filename).size,baseFiles:base.size,chunks:chunks.length,staticFiles:staticFiles.length,starNotesFix:true,textureMode:'rgba8-no-bc',sourceHashes:sources};
for(const [file,hash] of Object.entries(deliveredSources))if(sha(fs.readFileSync(file))!==hash)throw Error('La entrega cambió durante la integración.');
result.deliveredSources=deliveredSources;result.diag=true;result.touch=true;
fs.writeFileSync(out+'/package-result.json',JSON.stringify(result,null,2));fs.writeFileSync(out+'/package-header.json',JSON.stringify(header));console.log(JSON.stringify({...result,sourceHashes:undefined}));
