// Claude 2026-10-12: aplica colas + selector de calidad a la copia de Codex artifacts/all-songs/demo
// DESPUÉS de tools/local-loader/build-all-songs.mjs. No toca fuentes de Codex: post-procesa lo construido y recalcula ETags.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'));
const out=path.resolve('artifacts/all-songs'),demo=path.join(out,'demo');
const rep=(s,a,b,f)=>{if(!s.includes(a))throw Error('no encontrado en '+f+': '+a.slice(0,70));return s.replace(a,b);};
// 1) Renderer con colas: roadVS + 27643FEB + 10CA3B73 (colas de notas largas + llamaradas).
let r=fs.readFileSync(path.join(demo,'r5snap-song-render.js'),'utf8');
const m=r.match(/roadVS\s*=\s*(?:\/\* @__PURE__ \*\/ )?new Set\(\[([^\]]*)\]\)/);if(!m||!m[1].includes('19815E13AC0DCC92'))throw Error('roadVS no encontrado');
fs.writeFileSync(path.join(demo,'r5snap-song-colas.js'),r.replace(m[0],m[0].replace(m[1],m[1]+', "27643FEB20B8CBBD", "10CA3B730086027C"')));
// 2) index.html y panel: mismas ediciones que artifacts/d1-wasm/colas/demo.
const ix=path.join(demo,'index.html'),pn=path.join(demo,'r5snap-panel.js');
const colasIx=fs.readFileSync('artifacts/d1-wasm/colas/demo/index.html','utf8'),colasPn=fs.readFileSync('artifacts/d1-wasm/colas/demo/r5snap-panel.js','utf8');
const pick=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))+b.length);
let i=fs.readFileSync(ix,'utf8');
if(!i.includes('gh3Quality')){
  const oldG=`if(g&&q.get('gfx')!=='url'){const want={r5liveconsumer:g.scene?'r5snap-song-scene.js':'r5snap-song-render.js',r5lite:g.lite===false?null:'1',r5inflight:g.inflight&&g.inflight!==2?String(g.inflight):null};`;
  i=rep(i,oldG,pick(colasIx,'/* Calidad (Claude','r5inflight:g&&g.inflight&&g.inflight!==2?String(g.inflight):null};'),ix);
  fs.writeFileSync(ix,i);
}
let p=fs.readFileSync(pn,'utf8');
if(!p.includes('gh3Quality')){
  const base=fs.readFileSync('artifacts/d1-wasm/notesfix/demo/r5snap-panel.js','utf8');
  if(p!==base)throw Error('El panel de all-songs cambió respecto de notesfix: revisar a mano');
  fs.writeFileSync(pn,colasPn);
}
// 3) ETags reales (assets.json) incluyendo el archivo nuevo.
const assets=JSON.parse(fs.readFileSync(out+'/assets.json'));assets.static['r5snap-song-colas.js']={};
for(const name of Object.keys(assets.static))assets.static[name]={...assets.static[name],hash:crypto.createHash('sha256').update(fs.readFileSync(path.join(demo,name))).digest('hex')};
fs.writeFileSync(out+'/assets.json',JSON.stringify(assets));
console.log(JSON.stringify({ok:true,colas:true,static:Object.keys(assets.static).length}));
