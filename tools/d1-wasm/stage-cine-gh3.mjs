// Claude 2026-10-12: reemplaza .vercel/output/static/gh3 (salida de `vercel build --prod`) por la copia integrada
// artifacts/d1-wasm/cine/demo, con enlaces duros (sin espacio extra). Lista explícita: programa (staticNames de
// unified-game/build-result.json) + manifest.json + las partes que nombra el manifiesto. Nada más (sin capturas,
// perfiles, wrappers de prueba ni instrucciones locales). Uso: node tools/d1-wasm/stage-cine-gh3.mjs [--dry]
import fs from 'node:fs';import path from 'node:path';
const src=process.env.GH3_SRC||'artifacts/d1-wasm/cine/demo',dst='.vercel/output/static/gh3',dry=process.argv.includes('--dry');
// staticNames + cualquier <script src> local de index.html (ej. gh3-tape.js de la sesión A).
const html=fs.readFileSync(src+'/index.html','utf8'),man=fs.existsSync(src+'/gh3.webmanifest')?JSON.parse(fs.readFileSync(src+'/gh3.webmanifest','utf8')):{icons:[]};
const used=[...html.matchAll(/<script[^>]+src="([\w.-]+\.js)"/g),...html.matchAll(/<link[^>]+href="([\w.-]+\.(?:webmanifest|png))"/g)].map(m=>m[1]).concat(man.icons.map(i=>i.src).filter(n=>/^[\w.-]+$/.test(n)));
used.push(...fs.readdirSync(src).filter(n=>/^logo-[\w.-]+\.png$/.test(n)));  // logo de la marca (lo carga gh3-pro.js)
used.push(...fs.readdirSync(src).filter(n=>/^font-[\w.-]+\.woff2$/.test(n)));  // Claude 2026-10-13 ui2: fuentes locales (las carga gh3-pro.js)
// Consumidores de imagen que la página carga por nombre (?r5liveconsumer=, native60 en PC, hw60): sin esto la PC queda sin imagen (404).
used.push(...fs.readdirSync(src).filter(n=>/^(r5snap-[\w.-]+|hw60[\w.-]*|r5cap-render)\.js$/.test(n)));
const names=[...new Set([...JSON.parse(fs.readFileSync('artifacts/unified-game/build-result.json')).staticNames,...used])];
const m=JSON.parse(fs.readFileSync(src+'/manifest.json'));
const hashes=[...new Set(m.files.flatMap(f=>f.chunks.map(c=>c.hash)))];
if(names.some(n=>!/^[\w.-]+$/.test(n))||hashes.some(h=>!/^[a-f0-9]{64}$/.test(h)))throw Error('Nombre inválido');
const files=[...names,'manifest.json',...hashes.map(h=>'chunks/'+h)];
for(const f of files)if(!fs.existsSync(path.join(src,f)))throw Error('Falta '+f);
let bytes=0;for(const f of files)bytes+=fs.statSync(path.join(src,f)).size;
console.log(JSON.stringify({files:files.length,program:names.length,chunks:hashes.length,bytes}));
if(dry)process.exit(0);
if(!fs.existsSync('.vercel/output/static/fase2'))throw Error('Primero vercel build --prod (falta /fase2/ en la salida)');
fs.rmSync(dst,{recursive:true,force:true});fs.mkdirSync(dst+'/chunks',{recursive:true});
for(const f of files)fs.linkSync(path.join(src,f),path.join(dst,f));
console.log('gh3 listo en',dst);
