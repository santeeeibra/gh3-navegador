import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {discoverSongPackages} from './songs.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const game=path.resolve(process.env.GH3_LOADER_GAME||'D:/Descargas/GH3LOR-XEX/GH3LOR-XEX/Guitar Hero 3 Legends of Rock');
const source=path.resolve(process.env.GH3_LOADER_SOURCE||'artifacts/d1-wasm/r5pipe/demo'),out=path.resolve(process.env.GH3_LOADER_OUT||'artifacts/local-loader'),demo=path.join(out,'demo'),chunkSize=2*1048576;
fs.mkdirSync(demo,{recursive:true});
const files=[],gameStats=[],buf=Buffer.alloc(chunkSize);
let reusable=null,previousStats;
if(process.argv.includes('--reuse-data')&&fs.existsSync(path.join(out,'catalog.json'))){
  const config=JSON.parse(fs.readFileSync(path.join(out,'server-config.json')));
  if(path.resolve(config.game)===game){reusable=new Map(JSON.parse(fs.readFileSync(path.join(out,'catalog.json'))).files.map(f=>[f.path,f]));previousStats=JSON.parse(fs.readFileSync(path.join(out,'assets.json'))).gameStats;}
}
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(dir,e.name);if(e.isSymbolicLink())throw Error('No se siguen enlaces de archivos.');
  if(e.isDirectory())walk(file);else{
    const rel=path.relative(game,file).replaceAll('\\','/'),st=fs.statSync(file),old=reusable?.get(rel);
    if(old&&old.size===st.size&&previousStats[old.id]?.mtimeMs===st.mtimeMs){files.push({...old,id:files.length});gameStats.push({mtimeMs:st.mtimeMs});continue;}
    const fd=fs.openSync(file,'r'),chunks=[];
    try{for(let offset=0;offset<st.size;offset+=chunkSize){const size=Math.min(chunkSize,st.size-offset);let got=0;while(got<size){const n=fs.readSync(fd,buf,got,size-got,offset+got);if(!n)throw Error('Lectura incompleta.');got+=n;}chunks.push({offset,size,hash:sha(buf.subarray(0,size))});}}finally{fs.closeSync(fd);}
    files.push({id:files.length,path:rel,size:st.size,chunks});gameStats.push({mtimeMs:st.mtimeMs});
  }
}}
walk(path.join(game,'DATA'));
const xex=path.join(game,'default.xex'),st=fs.statSync(xex),xbuf=fs.readFileSync(xex);
if(xbuf.subarray(0,4).toString()!=='XEX2')throw Error('La carpeta no contiene el ejecutable Xbox 360 esperado.');
const xchunks=[];for(let off=0;off<xbuf.length;off+=chunkSize){const b=xbuf.subarray(off,off+chunkSize);xchunks.push({offset:off,size:b.length,hash:sha(b)});}
files.push({id:files.length,path:'default.xex',size:st.size,chunks:xchunks});gameStats.push({mtimeMs:st.mtimeMs});
const traced=JSON.parse(fs.readFileSync('artifacts/manifest/manifest-slowride-completo.json'));
const tracePaths=new Set(traced.files.opened.filter(f=>/^game:\\/i.test(f.path)).map(f=>f.path.slice(6).replaceAll('\\','/').toLowerCase()));
const songFile=f=>/^data\/music\//i.test(f.path)||/^data\/compressed\/songs\//i.test(f.path);
const base=files.filter(f=>tracePaths.has(f.path.toLowerCase())&&!songFile(f));
if(base.length<20)throw Error('La lista base de dependencias no está completa.');
const {packages:songPackages,excluded}=discoverSongPackages(files);
const packages={base:{title:'Arranque y recursos compartidos',files:base.map(f=>f.id)},...songPackages};
const sources={};for(const name of fs.readdirSync(source)){const p=path.join(source,name);if(!fs.statSync(p).isFile()||!(/\.(js|wasm)$/.test(name)||name==='index.html'))continue;sources[name]=sha(fs.readFileSync(p));fs.copyFileSync(p,path.join(demo,name));}
// Patch only the copied page and mount adapter; CPU/GPU/audio/save code stays intact.
let js=fs.readFileSync(path.join(demo,'gh3-web.js'),'utf8');
const workerAnchor='  let files = null, waiting = null;';
if(!js.includes(workerAnchor))throw Error('Worker anchor changed.');
js=js.replace(workerAnchor,'  importScripts("r5snap-local-fs.js");\n'+workerAnchor);
const filesAnchor='    files = e.data.files;';
js=js.replace(filesAnchor,'    if(e.data.localCache) GH3LocalFS.install(WORKERFS,e.data.localCache);\n'+filesAnchor);
fs.writeFileSync(path.join(demo,'gh3-web.js'),js);
let html=fs.readFileSync(path.join(demo,'index.html'),'utf8');
if(!html.includes("w.postMessage({ type: 'files', files: picked });")||!html.includes('if (!files || loading || !window.d4) return;'))throw Error('Page anchors changed.');
html=html.replace("w.postMessage({ type: 'files', files: picked });","w.postMessage({ type: 'files', files: picked, localCache: window.gh3LoaderMount });")
  .replace('if (!files || loading || !window.d4) return;','if(window.gh3Loader?.loadChart)return;\n    if(!files) files=window.gh3LoaderFiles;\n    if (!files || loading || !window.d4) return;')
  .replace('<title>Slow Ride · imagen original parcial</title>','<title>GH3 · cargador local</title>')
  .replace('<h1>GH3 · Slow Ride con imagen original parcial</h1>','<h1>GH3 · entrar y jugar</h1>')
  .replace('Prueba local con gráficos parciales del original, sonido y controles. Los archivos de la carpeta se leen en esta PC; no se suben a ningún lado.','Prueba local del original con gráficos parciales. Prepará las canciones una vez y volvé a jugar desde este navegador.')
  .replaceAll('Elegí la carpeta del juego y tocá Arrancar.','Prepará las canciones y tocá Jugar.')
  .replaceAll('Elegí la carpeta.','Prepará las canciones.')
  // A restored save skips creating memcard/gh.png. The menu movie proves that
  // title/controls were already passed, so don't keep pressing Start for 300s.
  .replace('while (!seen.title && limit(300))','while (!seen.title && !seen.menu && limit(300))')
  .replace('</body>','<script type="module" src="r5snap-loader-ui.js"></script>\n</body>');
fs.writeFileSync(path.join(demo,'index.html'),html);
// Copy-only wording: a restart now restores prepared chunks without a picker.
const panelFile=path.join(demo,'r5snap-panel.js');
fs.writeFileSync(panelFile,fs.readFileSync(panelFile,'utf8').replace('Se reinicia el juego (vas a tener que elegir la carpeta otra vez).','Se reinicia el juego y se reutilizan los archivos preparados.'));
await build({entryPoints:['tools/local-loader/runtime.mjs'],outfile:path.join(demo,'r5snap-local-fs.js'),bundle:true,format:'iife',platform:'browser',target:'es2022'});
await build({entryPoints:['tools/local-loader/ui.mjs'],outfile:path.join(demo,'r5snap-loader-ui.js'),bundle:true,format:'esm',platform:'browser',target:'es2022'});
const loaderSources=Object.fromEntries(['build','ui','songs','chart-loader','theme','controls','loading','runtime','cache','sha256'].map(name=>[name,sha(fs.readFileSync(`tools/local-loader/${name}.mjs`))]));
const content={format:1,chunkSize,files,packages,sourceBuild:sources,loaderSources,xexHash:sha(xbuf)},catalog={...content,version:sha(JSON.stringify(content))};
const assets={gameStats,static:{}};for(const name of fs.readdirSync(demo)){const p=path.join(demo,name);if(fs.statSync(p).isFile())assets.static[name]={hash:sha(fs.readFileSync(p))};}
for(const [name,hash] of Object.entries(sources))if(sha(fs.readFileSync(path.join(source,name)))!==hash)throw Error('La fuente cambió durante el armado.');
fs.writeFileSync(path.join(out,'catalog.json'),JSON.stringify(catalog));fs.writeFileSync(path.join(out,'assets.json'),JSON.stringify(assets));
fs.writeFileSync(path.join(out,'server-config.json'),JSON.stringify({game}));fs.writeFileSync(path.join(out,'sources-sha256.json'),JSON.stringify(sources,null,2));
fs.writeFileSync(path.join(out,'excluded-charts.json'),JSON.stringify(excluded,null,2));
console.log(JSON.stringify({out,files:files.length,baseFiles:base.length,packages:Object.fromEntries(Object.entries(packages).map(([id,p])=>[id,{files:p.files.length,bytes:p.files.reduce((s,i)=>s+files[i].size,0)}])),version:catalog.version}));
