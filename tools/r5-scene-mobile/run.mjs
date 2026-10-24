// Isolated derivative of the established real-song runner. Shared sources untouched.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
const label=process.env.SCENE_LABEL||'baseline-pc',variant=process.env.SCENE_VARIANT||'baseline',root='artifacts/r5-scene-mobile';
const source=path.resolve('tools/local-loader/demand-game-check.mjs');let s=fs.readFileSync(source,'utf8');
const options={renderScale:Number(process.env.SCENE_SCALE||1),textureScale:Number(process.env.SCENE_TEX||1),forceRGBA:process.env.SCENE_RGBA==='1'};
for(const name of ['r5snap-song-scene.js','r5snap-song-gpu.js','r5snap-scene-diagnostic.js']){
 const file=root+'/'+variant+'/'+name;let code=fs.readFileSync(file,'utf8');code=code.replace(/^globalThis\.__r5Options=.*;\n/,'').replace('const bc = adapter.features.has("texture-compression-bc");','const bc = adapter.features.has("texture-compression-bc") && !globalThis.__r5Options?.forceRGBA;');fs.writeFileSync(file,'globalThis.__r5Options='+JSON.stringify(options)+';\n'+code);
}
s=s.replaceAll("from 'playwright'",`from '${pathToFileURL(path.resolve('node_modules/playwright/index.mjs')).href}'`)
 .replace(/from '(\.\.?\/[^']+)'/g,(_,p)=>`from '${pathToFileURL(path.resolve(path.dirname(source),p)).href}'`)
 .replace("path.resolve('artifacts/unified-game')",`path.resolve('${root}')`)
 .replace("path.join(root,'real-demand-runs',song+'-'+Date.now())",`path.join(root,'runs','${label}')`)
 .replaceAll("root+'/demo",`root+'/${variant}`)
 .replace('manual=1&r5lite=0',`manual=1&r5lite=${process.env.SCENE_LITE||0}`)
 .replace('full?report.lastNoteMs+500:45000','full?report.lastNoteMs+500:Number(process.env.SCENE_TARGET_MS||45000)')
 .replace('r5liveconsumer=r5snap-song-scene.js',`r5liveconsumer=${process.env.SCENE_CONSUMER||(process.env.SCENE_CAPTURE?'r5snap-scene-diagnostic.js':'r5snap-song-scene.js')}&r5inflight=${process.env.SCENE_INFLIGHT||2}`)
 .replace('presented:d4.songPresented||0','wall:performance.now(),presented:d4.songPresented||0')
 .replace("await page.addInitScript({path:'artifacts/d1-wasm/carga/gh3-stage.js'})", "await page.addInitScript({path:'artifacts/d1-wasm/carga/gh3-stage.js'})")
 .replace("report.openedFiles=[];",fs.readFileSync('tools/r5-scene-mobile/run-hooks.js','utf8')+'\n report.openedFiles=[];');
const staticNames=fs.readdirSync(root+'/'+variant).filter(n=>fs.statSync(root+'/'+variant+'/'+n).isFile());
fs.writeFileSync(root+'/build-result.json',JSON.stringify({staticNames}));fs.mkdirSync(root+'/runs/'+label,{recursive:true});
fs.writeFileSync(root+'/runner-'+label+'.mjs',s);await import(pathToFileURL(path.resolve(root+'/runner-'+label+'.mjs')).href);
