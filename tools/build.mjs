import { build } from 'esbuild';
import { mkdir, copyFile, access } from 'node:fs/promises';
import {copyBrowserPlay} from './iphone-probe/copy-browser-play.mjs';
await mkdir('dist', { recursive: true });
const publicBundle={bundle:true,minify:true,sourcemap:false,legalComments:'inline',target:'es2022'};
await build({ ...publicBundle, entryPoints:['src/app.js'], format:'esm', outfile:'dist/app.js' });
await build({ ...publicBundle, entryPoints:['src/original/app.js'], format:'esm', outfile:'dist/original-app.js' });
await build({ ...publicBundle, entryPoints:['src/graphics/app.js'], format:'esm', outfile:'dist/graphics-app.js' });
for (const file of ['index.html','original.html','graphics.html','style.css']) await copyFile(file, 'dist/'+file);
// Puente de streaming (P3): solo páginas y JS propio, sin datos del juego.
await mkdir('dist/puente', { recursive: true });
for (const n of ['host','viewer']) {
  await build({ ...publicBundle, entryPoints:['src/bridge/'+n+'.js'], format:'esm', outfile:'dist/puente/'+n+'.js' });
  await copyFile('bridge/'+n+'.html', 'dist/puente/'+n+'.html');
}
// Demo técnica Fase 2: lista explícita, nunca fuentes ni datos del juego.
// artifacts/ está en .vercelignore: publicar con `vercel build --prod` + `vercel deploy --prebuilt --prod`.
// Prueba de capacidades para iPhone: memoria, hilos, WebGPU. Sin datos ni código de juego.
await mkdir('dist/iphone', { recursive: true });
await copyFile('tools/iphone-probe/index.html', 'dist/iphone/index.html');
for(const f of ['preparar.html','private-store.js','private-import.js','private-sw.js']) await copyFile('tools/iphone-probe/'+f,'dist/iphone/'+f);

const fase2 = 'artifacts/fase2-threads/';
const fase2Files = ['index.html','frame.html', ...['ok32','ok64','nosafepoint32'].flatMap(v => [`build/threads-${v}.js`,`build/threads-${v}.wasm`])];
if (await access(fase2+'index.html').then(()=>true, ()=>false)) {
  await mkdir('dist/fase2/build', { recursive: true });
  for (const f of fase2Files) await copyFile(fase2+f, 'dist/fase2/'+f);
  console.log('Fase 2 copiada en dist/fase2/ ('+fase2Files.length+' archivos)');
} else console.warn('AVISO: falta artifacts/fase2-threads; dist/ sale SIN /fase2/');
const gh3=await copyBrowserPlay('dist/gh3',{local:process.env.GH3_DELIVERY==='unified-local'});
if(gh3)console.log('Prueba GH3 autorizada copiada en dist/gh3/ ('+gh3+' archivos)');
console.log('Juego compilado en dist/');
