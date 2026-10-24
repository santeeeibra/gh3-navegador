// Prebuilt static fallback when the Windows Vercel builder cannot spawn cmd.exe.
// Run tools/build.mjs first. Copy only explicit public infrastructure files.
import fs from 'node:fs';
import path from 'node:path';
const root=['index.html','original.html','graphics.html','style.css','app.js','original-app.js','graphics-app.js'];
const bridge=['host.html','viewer.html','host.js','viewer.js'].map(f=>'puente/'+f);
const iphone=['index.html','preparar.html','private-store.js','private-import.js','private-sw.js'].map(f=>'iphone/'+f);
const phase=['index.html','frame.html',...['ok32','ok64','nosafepoint32'].flatMap(v=>['build/threads-'+v+'.js','build/threads-'+v+'.wasm'])].map(f=>'fase2/'+f);
const files=[...root,...bridge,...iphone,...phase];
// The failed Vercel build removed its output; do not mix it with arbitrary dist content.
if(fs.existsSync('.vercel/output/static'))throw Error('Ya existe static; inspeccionarlo antes de regenerar.');
for(const f of files){const bytes=fs.readFileSync('dist/'+f);if(bytes.length>32*1048576)throw Error('Archivo público inesperadamente grande: '+f);const target='.vercel/output/static/'+f;fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
const routes=[];
for(const dir of ['fase2','iphone']){
 routes.push({src:'^/'+dir+'$',status:307,headers:{Location:'/'+dir+'/'}});
 routes.push({src:'^/'+dir+'(?:/(.*))$',headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin','Cache-Control':'no-cache'},continue:true});
}
routes.push({handle:'filesystem'});
fs.writeFileSync('.vercel/output/config.json',JSON.stringify({version:3,routes},null,2));
const inventory=files.map(file=>({file,size:fs.statSync('dist/'+file).size}));
fs.writeFileSync('artifacts/mobile-private/public-inventory.json',JSON.stringify(inventory,null,2));
console.log(JSON.stringify({publicFiles:files.length,phaseFiles:phase.length,privateGamePublished:false}));
