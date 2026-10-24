// One browser delivery for local testing and Vercel. Reads the user's copy only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {integrateMobilePage} from './integrate-mobile-page.mjs';
import {validateManifest} from '../local-loader/cache.mjs';
const out='artifacts/unified-game',demo=out+'/demo',source='artifacts/all-songs/demo';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const catalog=validateManifest(JSON.parse(fs.readFileSync('artifacts/all-songs/catalog.json')));
const game=JSON.parse(fs.readFileSync('artifacts/all-songs/server-config.json')).game;
fs.mkdirSync(demo+'/chunks',{recursive:true});
const names=['index.html','gh3-web.js','gh3-web.wasm','gh3-input.js','gh3-song.js','r5snap-panel.js','r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js','r5snap-song-gpu.js','r5snap-local-fs.js','r5snap-loader-ui.js'];
const sourceHashes={};for(const name of names){const b=fs.readFileSync(source+'/'+name);sourceHashes[name]=sha(b);fs.writeFileSync(demo+'/'+name,b);}
let html=fs.readFileSync(demo+'/index.html','utf8');
html=html.replaceAll("location.replace('/?'+q)","location.replace(location.pathname+'?'+q)");
if(!html.includes("location.pathname+'?'+q"))throw Error('No se preserva /gh3/ al aplicar calidad.');
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><script>window.gh3LoaderConfig={manifest:"/gh3/manifest.json",onDemand:true};</script>');
fs.writeFileSync(demo+'/index.html',html);
const deliverySources=integrateMobilePage(demo);
fs.copyFileSync('artifacts/d1-wasm/carga/gh3-stage.js',demo+'/gh3-stage.js');
fs.copyFileSync('tools/local-loader/chunks-sw.js',demo+'/gh3-chunks-sw.js');
fs.copyFileSync('tools/analytics/gh3-analytics.js',demo+'/gh3-analytics.js');
html=fs.readFileSync(demo+'/index.html','utf8').replace('<title>GH3 · diagnóstico móvil</title>','<title>Guitar Hero III · PC y móvil</title>');
// Conservative phone default; complete graphics remain an explicit option.
html=html.replace("const autoQ=()=>", "const autoQ=()=>matchMedia('(pointer:coarse)').matches?'muy':");
html=html.replace('<script src="gh3-input.js"></script>','<script src="gh3-stage.js"></script>\n<script src="gh3-input.js"></script>');
html=html.replace('<script src="gh3-diag.js"></script>','<script src="gh3-analytics.js"></script>\n<script src="gh3-diag.js"></script>');
fs.writeFileSync(demo+'/index.html',html);
let panel=fs.readFileSync(demo+'/r5snap-panel.js','utf8');panel=panel.replaceAll("location.replace('/?' + u)","location.replace(location.pathname+'?' + u)");fs.writeFileSync(demo+'/r5snap-panel.js',panel);
const m=JSON.parse(JSON.stringify(catalog));
// Retain the expanded shared base from the previous, working public trial.
const old=JSON.parse(fs.readFileSync('artifacts/browser-play/demo/manifest.json'));
const basePaths=new Set(old.packages.base.files.map(id=>old.files[id].path.toLowerCase()));
m.packages.base.files=[...new Set([...m.packages.base.files,...m.files.filter(f=>basePaths.has(f.path.toLowerCase())).map(f=>f.id)])];
m.delivery={chunks:'/gh3/chunks',mode:'on-demand',fullSongTrigger:'first-native-chart-read',sharedCache:true};
m.version=sha(Buffer.from(JSON.stringify({...m,version:undefined})));
validateManifest(m);fs.writeFileSync(demo+'/manifest.json',JSON.stringify(m));
// Public browser modules are minified and never emit source maps. This only
// deters casual copying: code delivered to a browser cannot be made secret.
const opts={bundle:true,platform:'browser',target:'es2022',minify:true,sourcemap:false,legalComments:'inline'};
await build({...opts,entryPoints:['tools/local-loader/runtime.mjs'],outfile:demo+'/r5snap-local-fs.js',format:'iife'});
// The exact same UI source serves both local and hosted paths.
await build({...opts,entryPoints:['tools/local-loader/ui.mjs'],outfile:demo+'/r5snap-loader-ui.js',format:'esm',plugins:[{name:'hosted-wording',setup(b){b.onLoad({filter:/ui\.mjs$/},args=>{if(path.resolve(args.path)!==path.resolve('tools/local-loader/ui.mjs'))return;return {contents:fs.readFileSync(args.path,'utf8').replace('<span class="localBadge">Prueba local</span>','<span class="localBadge">PC y móvil · prueba parcial</span>'),loader:'js',resolveDir:path.dirname(args.path)};});}}]});
const shaderManifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const valid=new Set(edge.results.filter(r=>r.moduleValid).map(r=>r.name.split('_')[1].split('.')[0])),shaders={};
for(const [id,s] of Object.entries(shaderManifest))if(valid.has(id))shaders[id]={id,stage:s.stage,constants:s.constants,code:fs.readFileSync(s.wgsl,'utf8')};
for(const id of ['19815E13AC0DCC92','27643FEB20B8CBBD','10CA3B730086027C'])if(!shaders[id])throw Error('Falta shader '+id);
const renderOpts={...opts,format:'iife',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_SHADERS__:JSON.stringify(shaders)}};
await build({...renderOpts,entryPoints:['tools/r5-live-song/thread-consumer.mjs'],outfile:demo+'/r5snap-song-render.js'});
await build({...renderOpts,entryPoints:['tools/r5-live-song/thread-consumer.mjs'],outfile:demo+'/r5snap-song-colas.js',plugins:[{name:'tails-copy',setup(b){b.onLoad({filter:/thread-consumer\.mjs$/},args=>({contents:fs.readFileSync(args.path,'utf8').replace("'19815E13AC0DCC92']","'19815E13AC0DCC92','27643FEB20B8CBBD','10CA3B730086027C']"),loader:'js',resolveDir:path.dirname(args.path)}));}}]});
await build({...renderOpts,entryPoints:['tools/r5-live-song/live-consumer.mjs'],outfile:demo+'/r5snap-song-scene.js',define:{...renderOpts.define,__SONG_MODE__:'"scene"'}});
await build({...opts,entryPoints:['tools/iphone-probe/mobile-gpu-worker.mjs'],outfile:demo+'/r5snap-song-gpu.js',format:'iife'});
const staticNames=[...names,'gh3-touch.js','gh3-landscape.js','gh3-diag.js','gh3-stage.js','gh3-chunks-sw.js','gh3-analytics.js'];
const resources=new Map();for(const f of m.files)for(const c of f.chunks)resources.set(c.hash,{...c,path:f.path});
let bytes=0;const buffer=Buffer.alloc(m.chunkSize);
for(const [hash,c] of resources){
 const target=demo+'/chunks/'+hash;bytes+=c.size;
 if(process.argv.includes('--program-only')){if(!fs.existsSync(target)||fs.statSync(target).size!==c.size)throw Error('Falta un recurso preparado: '+hash);continue;}
 if(fs.existsSync(target)&&fs.statSync(target).size===c.size&&sha(fs.readFileSync(target))===hash)continue;
 const file=path.resolve(game,...c.path.split('/'));if(!file.startsWith(path.resolve(game)+path.sep))throw Error('Recurso fuera de la copia.');
 const fd=fs.openSync(file,'r');try{let read=0;while(read<c.size){const n=fs.readSync(fd,buffer,read,c.size-read,c.offset+read);if(!n)throw Error('Recurso incompleto.');read+=n;}}finally{fs.closeSync(fd);}
 const b=buffer.subarray(0,c.size);if(sha(b)!==hash)throw Error('La copia cambió: '+c.path);fs.writeFileSync(target,b);
}
for(const [name,hash] of Object.entries(sourceHashes))if(sha(fs.readFileSync(source+'/'+name))!==hash)throw Error('La fuente cambió durante el build.');
const result={source:demo,songs:Object.keys(m.packages).length-1,staticNames,resourceBytes:bytes,chunks:resources.size,initialPackages:['base'],fullSongTrigger:m.delivery.fullSongTrigger,mobileRGBA:true,sourceHashes,deliverySources,gameplayAllSongs:'pending',createdAt:new Date().toISOString()};
fs.writeFileSync(out+'/build-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,sourceHashes:undefined,deliverySources:undefined}));
