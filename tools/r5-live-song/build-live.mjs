// Copy delivered song page; NEVER edit Claude's build or regenerate songlive.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {build} from 'esbuild';
const source='artifacts/d1-wasm/songlive/song',out='artifacts/r5-songlive/demo';fs.mkdirSync(out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json')),edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const valid=new Set(edge.results.filter(r=>r.moduleValid).map(r=>r.name.split('_')[1].split('.')[0])),shaders={};
for(const [id,s] of Object.entries(manifest))if(valid.has(id))shaders[id]={id,stage:s.stage,constants:s.constants,code:fs.readFileSync(s.wgsl,'utf8')};
for(const mode of ['road','scene'])await build({entryPoints:['tools/r5-live-song/live-consumer.mjs'],outfile:out+`/r5snap-song-${mode==='road'?'render':'scene'}.js`,bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_SHADERS__:JSON.stringify(shaders),__SONG_MODE__:JSON.stringify(mode)}});
fs.copyFileSync(out+'/r5snap-song-render.js',out+'/r5snap-song-inline.js');
await build({entryPoints:['tools/r5-live-song/thread-consumer.mjs'],outfile:out+'/r5snap-song-render.js',bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_SHADERS__:JSON.stringify(shaders)}});
await build({entryPoints:['tools/r5-live-song/gpu-worker.mjs'],outfile:out+'/r5snap-song-gpu.js',bundle:true,format:'iife',platform:'browser',target:'es2022'});
for(const f of ['gh3-input.js','gh3-song.js','gh3-web.wasm'])fs.copyFileSync(source+'/'+f,out+'/'+f);
let js=fs.readFileSync(source+'/gh3-web.js','utf8'),anchor='Module["r3cFrame"] =';if(!js.includes(anchor))throw Error('Handler anchor absent');
js=js.replace(anchor,`Module['r5SongReport']=data=>self.postMessage({type:'r5SongReport',data});
Module['r5SongFrame']=(bitmap,info,latch)=>self.postMessage({type:'r5SongFrame',bitmap,info,latch},[bitmap]);
${anchor}`);fs.writeFileSync(out+'/gh3-web.js',js);
let page=fs.readFileSync(source+'/index.html','utf8');
const redirectStart=page.indexOf('<head><script>'),redirectEnd=page.indexOf('</script>',redirectStart);
page=page.slice(0,redirectStart)+`<head><script>{const q=new URLSearchParams(location.search);let change=false;for(const [k,v] of Object.entries({song:'1',cpwait:'event',audio:'silent',xma:'decode',waitmulti:'event',audiotap:'1',r5live:'1',r5lite:'1',cpasync:'1',r5liveconsumer:'r5snap-song-render.js',manual:'1'}))if(!q.has(k)){q.set(k,v);change=true;}if(change)location.replace('/?'+q);}</script>`+page.slice(redirectEnd+9);
const handler="if (m.type === 'log') {";
page=page.replace(handler,`if(m.type==='r5SongReport'){result.songRenderer=m.data;return;}
if(m.type==='r5SongFrame'){
try{$('r5Canvas').getContext('bitmaprenderer').transferFromImageBitmap(m.bitmap);$('r5Box').hidden=false;result.songPresented=(result.songPresented||0)+1;result.songLast=m.info;$('r5Stat').textContent='Imagen original parcial · '+result.songPresented+' cuadros presentados · '+m.info.accepted+' dibujos · secuencia '+m.info.seq;}finally{Atomics.store(new Int32Array(m.latch),0,0);}return;
}
${handler}`);
page=page.replace('<title>GH3 X360 · Prueba D4</title>','<title>Slow Ride · imagen original parcial</title>').replace('GH3 Xbox 360 en el navegador · prueba D4','GH3 · Slow Ride con imagen original parcial').replace('Prueba de arranque SIN gráficos, audio ni controles.','Prueba local con gráficos parciales del original, sonido y controles.');
page=page.replace("ctl.after(document.getElementById('songBox'));","ctl.after(document.getElementById('songBox'));ctl.after(document.getElementById('r5Box'));document.getElementById('hw').hidden=true;");
page=page.replace('Canción (autopista PROVISORIA dibujada por la página; audio, aciertos y puntaje son del GH3 original)','Slow Ride · gráficos parciales del original; sonido, controles y juicio del juego');
page=page.replace('const loop = () => { S.draw(cv, window.gh3Input?.stats.frets | 0); requestAnimationFrame(loop); };','const loop = () => {};');
page=page.replace('Ajuste visual (ms):','Ajuste de la referencia provisoria oculta (no mueve la imagen original), ms:');
fs.writeFileSync(out+'/index.html',page);
const sources=Object.fromEntries(fs.readdirSync(source).filter(f=>fs.statSync(source+'/'+f).isFile()).map(f=>[source+'/'+f,crypto.createHash('sha256').update(fs.readFileSync(source+'/'+f)).digest('hex')]));fs.writeFileSync(out+'/sources-sha256.json',JSON.stringify(sources,null,2));console.log(JSON.stringify({out,shaders:Object.keys(shaders).length}));
