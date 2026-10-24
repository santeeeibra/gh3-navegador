// Isolated consumer bundle. No runtime, producer or served song modifications.
import fs from 'node:fs';
import {build} from 'esbuild';
const out='artifacts/r5-live-menu/bundle';fs.mkdirSync(out,{recursive:true});
await build({entryPoints:['tools/r5-live-menu/worker.mjs'],bundle:true,format:'iife',globalName:'R5LiveMenu',platform:'browser',target:'es2022',outfile:`${out}/r5live-menu.js`});
for(const [stage,hash] of [['vert','B43CF443883B8351'],['frag','526B394DE2AB8891']]){
 fs.copyFileSync(`artifacts/r4-wgsl-menu-44/naga/repacked/wgsl/shader_${hash}.ucode.bin.${stage}.spv.wgsl`,`${out}/menu.${stage}.wgsl`);
}
console.log(JSON.stringify({out,files:fs.readdirSync(out),scope:'Standalone consumer; live runtime adapter in build-runtime.mjs'}));
