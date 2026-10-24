import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
const source = path.resolve('artifacts/d1-wasm/ui3/demo');
const destination = path.resolve('artifacts/ui-layout/demo');
fs.mkdirSync(destination,{recursive:true});
// Hard links preserve the source and avoid duplicating the game bytes locally.
for (const name of fs.readdirSync(source)) {
  if (!fs.statSync(path.join(source,name)).isFile()) continue;
  const target=path.join(destination,name);
  if (!fs.existsSync(target)) fs.linkSync(path.join(source,name),target);
}
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
fs.mkdirSync(path.join(destination,'chunks'),{recursive:true});
for(const hash of new Set(manifest.files.flatMap(file=>file.chunks.map(chunk=>chunk.hash)))) {
  if(!/^[a-f0-9]{64}$/.test(hash)) throw Error('Hash inválido');
  const target=path.join(destination,'chunks',hash);
  if(!fs.existsSync(target)) fs.linkSync(path.join(source,'chunks',hash),target);
}
let html=fs.readFileSync(path.join(source,'index.html'),'utf8');
html=html.replace('</head>','<script src="gh3-layout.js" defer></script>\n</head>');
html=html.replace('<script src="gh3-input.js">','<script src="gh3-strum-keys.js"></script>\n<script src="gh3-input.js">');
const temp=path.join(destination,'index.html.new');
fs.writeFileSync(temp,html);
fs.renameSync(temp,path.join(destination,'index.html'));
await build({entryPoints:['tools/ui-layout/layout.js'],bundle:true,format:'iife',loader:{'.css':'text'},outfile:path.join(destination,'gh3-layout.js')});
await build({entryPoints:['tools/ui-layout/strum-keys.js'],bundle:true,format:'iife',outfile:path.join(destination,'gh3-strum-keys.js')});
const originalInput=fs.readFileSync(path.join(source,'gh3-input.js'),'utf8');
const anchor='"rasgueo abajo":["ArrowDown"]';
if(originalInput.split(anchor).length!==2) throw Error('Revisar versión de entrada antes de aplicar STRUM');
const inputTemp=path.join(destination,'gh3-input.js.new');
fs.writeFileSync(inputTemp,originalInput.replace(anchor,'"rasgueo abajo":["ArrowDown","KeyK"]'));
fs.renameSync(inputTemp,path.join(destination,'gh3-input.js'));
console.log(destination);
