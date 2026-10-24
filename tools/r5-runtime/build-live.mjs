// Local-only build: the output embeds converted game shaders and MUST NOT deploy.
import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,process.env.R5_LIVE_OUT||'artifacts/r5-live');
await mkdir(out,{recursive:true});
const shader=async stage=>await readFile(resolve(root,'artifacts/r5-replay/data',stage+'.wgsl'),'utf8');
await build({entryPoints:[resolve(root,'tools/r5-runtime/live-consumer.mjs')],outfile:resolve(out,'r5snap-codex.js'),bundle:true,format:'iife',target:'es2022',define:{__R5_VERTEX_WGSL__:JSON.stringify(await shader('vert')),__R5_PIXEL_WGSL__:JSON.stringify(await shader('frag'))}});
// Extend a COPY of the compiled JS only; keep Claude's build and defaults intact.
const src=await readFile(resolve(root,process.env.R5_RUNTIME_JS||'artifacts/d1-wasm/d4/gh3-web.js'),'utf8');
const anchor='Module["r3cFrame"] =';
const i=src.indexOf(anchor);if(i<0)throw Error('Compiled runtime handler anchor missing');
const handlers=`Module['r5LiveReport'] = data => self.postMessage({type:'r5LiveReport',data});
Module['r5LiveFrame'] = (bitmap,info) => self.postMessage({type:'r5LiveFrame',bitmap,info},[bitmap]);
`;
await writeFile(resolve(out,'gh3-web.js'),src.slice(0,i)+handlers+src.slice(i));
let html=await readFile(resolve(root,'artifacts/d1-wasm/d4/index.html'),'utf8');
html=html.replace("['r3ayield', 'r3acheck', 'cpasync'", "['waitmulti', 'audiotap', 'r3ayield', 'r3acheck', 'cpasync'");
html=html.replace('Prueba de arranque SIN gráficos, audio ni controles.', 'Prueba gráfica parcial del video GH3_Intro. Todavía no muestra todos los videos, el menú ni una canción jugable.');
html=html.replace('value="10" min="2" max="120"','value="300" min="2" max="600"');
html=html.replace('<option value="null">GPU nula (G1, sin imagen)</option>','<option value="null" selected>Prueba gráfica parcial (R5)</option>');
if(process.env.R5_DEMO_DEFAULTS==='1'){
  html=html.replace('<head>',`<head><script>if(!location.search)location.replace('/?'+new URLSearchParams({cpasync:'1',cpwait:'event',r3acheck:'1',r5snap:'1',r5consumer:'r5snap-codex.js',press:'150:start,175:start',waitmulti:'event'}));</script>`);
}
html=html.replace('<ul id="checks"',`<div id="r5Box" class="card" hidden><canvas id="r5Canvas" width="1280" height="720" style="width:100%;height:auto"></canvas><p id="r5Stat">Draw del video de GH3 en ejecución. Prueba parcial, sin menú 3D ni canción jugable.</p></div><ul id="checks"`);
html=html.replace("} else if (m.type === 'mem') {",` } else if(m.type==='r5LiveReport') {
      result.r5Live=m.data;
    } else if(m.type==='r5LiveFrame') {
      $('r5Canvas').getContext('bitmaprenderer').transferFromImageBitmap(m.bitmap);
      $('r5Box').hidden=false;result.r5Frames=(result.r5Frames||0)+1;result.r5Last=m.info;
      $('r5Stat').textContent='Video GH3: '+result.r5Frames+' draws mostrados · secuencia '+m.info.seq+' · prueba parcial sin canción jugable';
    } else if (m.type === 'mem') {`);
await writeFile(resolve(out,'index.html'),html);
console.log('Prepared local-only '+out+' (runtime copy + CP consumer).');
