// Integrate the delivered page/input/diagnostics without changing Claude's sources.
import fs from 'node:fs';
import crypto from 'node:crypto';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export function integrateMobilePage(demo){
 const touch='artifacts/d1-wasm/touch',diag='artifacts/d1-wasm/mobilediag';
 if(sha(fs.readFileSync(demo+'/gh3-input.js'))!==sha(fs.readFileSync(touch+'/gh3-input.orig.js')))throw Error('La entrada base cambió; revisar la entrega táctil antes de reemplazarla.');
 const sources={};
 for(const [name,source] of Object.entries({'gh3-input.js':touch+'/gh3-input.js','gh3-touch.js':'src/original/gh3-touch.js','gh3-diag.js':'src/original/gh3-diag.js','gh3-landscape.js':diag+'/gh3-landscape.js'})){
  const b=fs.readFileSync(source);sources[source]=sha(b);fs.writeFileSync(demo+'/'+name,b);
 }
 let html=fs.readFileSync(demo+'/index.html','utf8');
 const replace=(a,b)=>{if(html.split(a).length!==2)throw Error('Cambió la página: '+a);html=html.replace(a,b);};
 replace('<meta charset="utf-8">','<meta charset="utf-8">\n<script src="gh3-diag.js"></script>');
 replace('<script src="gh3-input.js"></script>','<script src="gh3-input.js"></script>\n<script src="gh3-touch.js"></script>\n<script src="gh3-landscape.js"></script>');
 html=html.replace(/<meta name="viewport" content="[^"]*">/,'<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">').replace(/<title>[^<]*<\/title>/,'<title>GH3 · diagnóstico móvil</title>');
 fs.writeFileSync(demo+'/index.html',html);
 const worker=fs.readFileSync(diag+'/gh3-diag-worker.js');sources[diag+'/gh3-diag-worker.js']=sha(worker);
 fs.writeFileSync(demo+'/gh3-web.js',Buffer.concat([worker,Buffer.from('\n'),fs.readFileSync(demo+'/gh3-web.js')]));
 return sources;
}
