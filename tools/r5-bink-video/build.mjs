// Isolated renderer experiment. Claude's runtime/audio/controls are copied byte-for-byte.
import fs from 'node:fs';
import {build,transform} from 'esbuild';
import {createHash} from 'node:crypto';
const root='artifacts/r5-bink-video',source='artifacts/d1-wasm/movil-memoria/demo',out=root+'/demo';
fs.mkdirSync(out,{recursive:true});
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const integrity={};
for(const name of fs.readdirSync(source)){
 const src=source+'/'+name,dst=out+'/'+name;
 if(!fs.statSync(src).isFile())continue;
 integrity[name]=sha(src);
 fs.copyFileSync(src,dst);
}
// Immutable chunk files may be shared; mutable scripts above always have independent copies.
fs.mkdirSync(out+'/chunks',{recursive:true});
for(const name of fs.readdirSync(source+'/chunks'))if(!fs.existsSync(out+'/chunks/'+name))fs.linkSync(source+'/chunks/'+name,out+'/chunks/'+name);
const manifest=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/manifest.json'));
const edge=JSON.parse(fs.readFileSync('artifacts/r5-songlive/shaders/edge.json'));
const valid=new Set(edge.results.filter(s=>s.moduleValid).map(s=>s.name.split('_')[1].split('.')[0])),shaders={};
for(const [id,s] of Object.entries(manifest))if(valid.has(id))shaders[id]={id,stage:s.stage,constants:s.constants,code:fs.readFileSync(s.wgsl,'utf8')};
await build({entryPoints:['tools/r5-bink-video/diagnostic.mjs'],outfile:out+'/r5snap-video-diagnostic.js',bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href',__SONG_MODE__:JSON.stringify('scene'),__SONG_SHADERS__:JSON.stringify(shaders)}});
// Replace only our draw adapter in independent copies. Keep Claude's additional
// tail-note shaders, frame-in-flight changes, panel, runtime and audio intact.
let adapter=fs.readFileSync('tools/r5-live-song/live-prepare.mjs','utf8');
adapter=adapter.slice(adapter.indexOf('export function prepareLiveSongDraw'))
 .replace('export function','function').replaceAll(/\bhex\(/g,'hex2(')
 .replace('isBinkDraw(d)','((d.vs===0x57F6448DAC5BEB74n&&d.ps===0xAB008EF1D1A8CB6Dn)||(d.vs===0xCAC1FD2246E486B4n&&d.ps===0x5E18383DE868947Fn))');
adapter=(await transform(adapter,{target:'es2022'})).code;
const rendererSource=fs.readFileSync('tools/r5-live-song/arena-renderer.mjs','utf8'),textureAt=rendererSource.indexOf(' function texture(t)'),textureEnd=rendererSource.indexOf('\n',textureAt+1);
const textureFunction=(await transform(rendererSource.slice(textureAt,textureEnd),{target:'es2022'})).code;
function replaceTexture(text){const at=text.indexOf('    function texture(t)'),end=text.indexOf('\n    }\n',at)+7;if(at<0||end<at)throw Error('GPU texture anchor changed');return text.slice(0,at)+textureFunction+text.slice(end);}
for(const name of ['r5snap-song-render.js','r5snap-song-colas.js','r5snap-song-scene.js']){
 let text=fs.readFileSync(source+'/'+name,'utf8');const at=text.indexOf('  function prepareLiveSongDraw('),end=text.indexOf('\n  }\n',at)+5;
 if(at<0||end<at)throw Error('Draw adapter anchor changed: '+name);
 text=text.slice(0,at)+adapter+text.slice(end);
 text=text.replace(/(var roadVS =[^\n]*new Set\(\[)/,'$1"CAC1FD2246E486B4", "57F6448DAC5BEB74", ')
  .replaceAll('new Set([...roadVS,','new Set([...roadVS, "5E18383DE868947F", "AB008EF1D1A8CB6D",');
 if(name==='r5snap-song-scene.js')text=replaceTexture(text);
 else text=text.replace('texture = { key: src.key,','texture = { key: src.key, video: src.video,').replace('if (!sentTextures.has(src.key))','if (src.video || !sentTextures.has(src.key))');
 fs.writeFileSync(out+'/'+name,text);
}
fs.writeFileSync(out+'/r5snap-song-gpu.js',replaceTexture(fs.readFileSync(source+'/r5snap-song-gpu.js','utf8')));
fs.writeFileSync(root+'/source-integrity.json',JSON.stringify({source,hashes:integrity},null,2));
console.log(JSON.stringify({out,shaders:Object.keys(shaders).length}));
