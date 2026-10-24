import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export async function stageVisitContext(destination){
  const scripts={};
  for(const name of ['gh3-visit-context.js','gh3-analytics.js']){
    scripts[name]=await fs.readFile(path.resolve('tools/analytics',name));
    // Atomic replacement: source demos may be hard-linked by the game staging.
    const target=path.join(destination,name),tmp=target+'.visit-tmp';
    await fs.writeFile(tmp,scripts[name]);await fs.rename(tmp,target);
  }
  const index=path.join(destination,'index.html');
  let html=await fs.readFile(index,'utf8');
  html=html.replace(/<script src="gh3-visit-context\.js"><\/script>\s*/g,'');
  if(!html.includes('<script src="gh3-analytics.js"></script>'))throw Error('No se encontró el script de estadísticas.');
  html=html.replace('<script src="gh3-analytics.js"></script>','<script src="gh3-visit-context.js"></script>\n<script src="gh3-analytics.js"></script>');
  // Hash THIS game build plus telemetry, even when its source had no build meta.
  const hash=createHash('sha256');
  for(const name of ['gh3-web.js','gh3-web.wasm','manifest.json'])hash.update(await fs.readFile(path.join(destination,name)));
  for(const bytes of Object.values(scripts))hash.update(bytes);
  html=html.replace(/<meta name="gh3-build" content="[^"]*">\s*/g,'').replace('<script src="gh3-visit-context.js">',`<meta name="gh3-build" content="${hash.digest('hex').slice(0,16)}">\n<script src="gh3-visit-context.js">`);
  const tmp=index+'.visit-tmp';await fs.writeFile(tmp,html);await fs.rename(tmp,index);
}

export async function stageGeoFunction(outputRoot){
  const folder=path.join(outputRoot,'functions/api/gh3-location.func');
  await fs.mkdir(folder,{recursive:true});
  await fs.copyFile('tools/analytics/geo-handler.mjs',path.join(folder,'index.mjs'));
  await fs.writeFile(path.join(folder,'.vc-config.json'),JSON.stringify({runtime:'nodejs22.x',handler:'index.mjs',launcherType:'Nodejs',shouldAddHelpers:true}));
}
