// Local copy of the delivered R5L runtime. Contains game code/shaders: no deploy.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const source='artifacts/d1-wasm/r5live/d4',out='artifacts/r5-live-menu/demo';
fs.mkdirSync(out,{recursive:true});
const shader=stage=>fs.readFileSync(`artifacts/r5-live-menu/bundle/menu.${stage}.wgsl`,'utf8');
await build({entryPoints:['tools/r5-live-menu/runtime-consumer.mjs'],outfile:`${out}/r5snap-r5l-codex.js`,bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],
 define:{'import.meta.url':'globalThis.location.href',__R5_MENU_VERTEX__:JSON.stringify(shader('vert')),__R5_MENU_FRAGMENT__:JSON.stringify(shader('frag'))}});
let runtime=fs.readFileSync(`${source}/gh3-web.js`,'utf8');
const anchor='Module["r3cFrame"] =';
if(!runtime.includes(anchor))throw Error('Runtime message handler anchor missing');
runtime=runtime.replace(anchor,`Module['r5MenuReport'] = data => self.postMessage({type:'r5MenuReport',data});
  Module['r5MenuFrame'] = (bitmap,info,latch) => self.postMessage({type:'r5MenuFrame',bitmap,info,latch},[bitmap]);
  ${anchor}`);
fs.writeFileSync(`${out}/gh3-web.js`,runtime);
fs.copyFileSync('tools/r5-live-menu/page.html',`${out}/index.html`);
const sources=[`${source}/gh3-web.js`,`${source}/gh3-web.wasm`,'artifacts/r5-live-menu/bundle/menu.vert.wgsl','artifacts/r5-live-menu/bundle/menu.frag.wgsl'];
fs.writeFileSync(`${out}/sources-sha256.json`,JSON.stringify(Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),null,2));
console.log(JSON.stringify({out,wasm:`${source}/gh3-web.wasm`,scope:'Live partial original menu, local only'}));
