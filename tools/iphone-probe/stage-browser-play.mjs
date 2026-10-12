// Stage the explicitly authorized direct-link GH3 trial under /gh3/.
// Preserve the existing site and /fase2/, without copying arbitrary artifacts.
import fs from 'node:fs';
import path from 'node:path';
const root='artifacts/browser-play/demo',target='.vercel/output/static/gh3';
const header=JSON.parse(fs.readFileSync('artifacts/mobile-private/package-header.json'));
const staticNames=header.static.map(f=>f.url.split('/').at(-1));
const catalog=JSON.parse(fs.readFileSync(root+'/manifest.json'));
const chunks=[...new Set([...catalog.packages.base.files,...catalog.packages.slowride.files].flatMap(id=>catalog.files[id].chunks.map(c=>c.hash)))];
const files=[...staticNames,'manifest.json',...chunks.map(h=>'chunks/'+h)];
const previous=[];function scan(p,prefix=''){if(!fs.existsSync(p))return;for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.isDirectory())scan(p+'/'+e.name,prefix+e.name+'/');else previous.push(prefix+e.name);}}
scan(target);if(previous.some(f=>!files.includes(f)))throw Error('Hay archivos de una versión anterior: revisar antes de reemplazar.');
for(const name of files){if(!/^[a-zA-Z0-9._/-]+$/.test(name)||name.includes('..'))throw Error('Ruta no permitida.');const file=target+'/'+name;fs.mkdirSync(path.dirname(file),{recursive:true});fs.copyFileSync(root+'/'+name,file);}
const configFile='.vercel/output/config.json',config=JSON.parse(fs.readFileSync(configFile));
config.routes=config.routes.filter(r=>!String(r.src||'').startsWith('^/gh3'));
config.routes.unshift({src:'^/gh3$',status:307,headers:{Location:'/gh3/'}},{src:'^/gh3(?:/(.*))$',headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-cache'},continue:true},{src:'^/gh3/chunks/[a-f0-9]{64}$',headers:{'Content-Type':'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable'},continue:true});
fs.writeFileSync(configFile,JSON.stringify(config,null,2));
const inventory=files.map(file=>({file:'gh3/'+file,size:fs.statSync(root+'/'+file).size}));fs.writeFileSync('artifacts/browser-play/public-inventory.json',JSON.stringify(inventory,null,2));
if(!fs.existsSync('.vercel/output/static/fase2/build/threads-ok32.wasm'))throw Error('Falta /fase2/; no publicar.');
console.log(JSON.stringify({files:files.length,bytes:inventory.reduce((n,f)=>n+f.size,0),route:'/gh3/',originalGameTrial:true,phase2Preserved:true}));
