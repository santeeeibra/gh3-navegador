// Claude 2026-10-23 (shaders de fábrica, paso 1 de fluidez): parchea el dibujante de calidad alta
// (r5snap-native60-gpu.js) de una copia para que, además de su memoria en IndexedDB, precompile la lista
// «de fábrica» native60-pipelines.json servida con la página. La precarga sigue siendo la de preload.mjs:
// sólo en cargas/menús (etapa 1), de a 2, con el gobernador tranquilo; nunca en canción.
// También avisa por consola ([pipefab] {...}) cada pipeline nuevo que compila el juego, para juntar la lista
// con med.mjs --pipelista (ver juntar.mjs).
// Uso: node tools/shaders-fabrica/armar.mjs <demo base> <demo destino>
import fs from 'node:fs';
const [base, dest] = process.argv.slice(2);
if (!base || !dest) { console.log('Uso: node tools/shaders-fabrica/armar.mjs <demo base> <demo destino>'); process.exit(1); }
let s = fs.readFileSync(base + '/r5snap-native60-gpu.js', 'utf8');
if (s.includes('__fabStore')) throw Error('La base ya está parcheada');
const swap = (a, b) => { const n = s.split(a).length - 1; if (n !== 1) throw Error('Esperaba 1 vez, hay ' + n + ': ' + a); s = s.replace(a, b); };
swap('store:Ze()', 'store:__fabStore(Ze())');
swap('onPipeline:(n,c)=>Ge?.record(n,c)', 'onPipeline:(n,c)=>{Ge?.record(n,c);__fabRec(n,c)}');
const head = `/* Claude 2026-10-23 shaders-fabrica: ver tools/shaders-fabrica/armar.mjs */
const __fab=self.__fab={usados:new Set(),lista:0};
// La memoria del jugador va primero (gana si repite); la lista de fábrica entra como «usada en canción».
function __fabStore(st){return{load:()=>Promise.all([st.load(),fetch(new URL('native60-pipelines.json',location.href)).then(r=>r.ok?r.json():null).catch(()=>null)]).then(([mem,fab])=>{const L=Array.isArray(fab?.pipelines)?fab.pipelines:[];__fab.lista=L.length;return mem.concat(L.map(d=>({d,n:1,s:1,t:0})));}),save:st.save};}
function __fabRec(m,pre){if(pre)return;const d={vs:m.vs,ps:m.ps,blend:m.blend,raster:m.raster,depth:m.depth,stencil:m.stencil,writeMask:m.writeMask},k=JSON.stringify([d.vs,d.ps,d.blend,d.raster&7,d.depth,d.stencil>>>8,d.writeMask]);if(__fab.usados.has(k))return;__fab.usados.add(k);console.log('[pipefab] '+JSON.stringify(d));}
`;
fs.writeFileSync(dest + '/r5snap-native60-gpu.js', head + s);
if (!fs.existsSync(dest + '/native60-pipelines.json')) fs.writeFileSync(dest + '/native60-pipelines.json', JSON.stringify({version: 1, pipelines: []}));
console.log('Parcheado ' + dest + '/r5snap-native60-gpu.js');
