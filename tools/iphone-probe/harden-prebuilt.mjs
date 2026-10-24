import fs from 'node:fs/promises';
import path from 'node:path';
import {transform} from 'esbuild';

const requested=process.argv[2];
if(!requested)throw Error('Uso: node tools/iphone-probe/harden-prebuilt.mjs <carpeta-deploy>');
const workspace=path.resolve('.');
const deployRoot=path.resolve(requested);
if(!deployRoot.startsWith(workspace+path.sep))throw Error('El deploy debe estar dentro del proyecto.');
const output=path.join(deployRoot,'.vercel','output');
const gameRoot=path.join(output,'static','gh3');
const configPath=path.join(output,'config.json');
const [entries,config]=await Promise.all([
 fs.readdir(gameRoot,{withFileTypes:true}),
 fs.readFile(configPath,'utf8').then(JSON.parse)
]);

const route=config.routes?.find(item=>item.src==='^/gh3(?:/(.*))$');
if(!route?.headers)throw Error('No se encontró la ruta principal de /gh3/.');
Object.assign(route.headers,{
 'Content-Security-Policy':"frame-ancestors 'none'",
 'X-Frame-Options':'DENY',
 'X-Content-Type-Options':'nosniff',
 'Referrer-Policy':'no-referrer'
});
await fs.writeFile(configPath,JSON.stringify(config));

const maps=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.map'));
if(maps.length)throw Error('El prebuild contiene mapas fuente; revisarlos antes de publicar.');
const scripts=entries.filter(entry=>entry.isFile()&&entry.name.endsWith('.js')&&entry.name!=='gh3-web.js');
let before=0,after=0;
for(const entry of scripts){
 const file=path.join(gameRoot,entry.name);
 const input=await fs.readFile(file,'utf8');
 const result=await transform(input,{loader:'js',minify:true,sourcemap:false,legalComments:'inline',target:'es2022'});
 before+=Buffer.byteLength(input);after+=Buffer.byteLength(result.code);
 await fs.writeFile(file,result.code);
}
console.log(JSON.stringify({deployRoot,scripts:scripts.length,sourceMaps:maps.length,before,after,saved:before-after,headers:route.headers},null,2));
