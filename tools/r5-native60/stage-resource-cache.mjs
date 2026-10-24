// Isolated copy: preserve the page, game, GPU worker and exact shader set of the chosen base.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {build} from 'esbuild';
const base=path.resolve(process.argv[2]||'artifacts/d1-wasm/movil-ctl/demo');
const out=path.resolve(process.argv[3]||'artifacts/recursos-sin-copia/demo');
if(fs.existsSync(out))throw Error('Destination already exists: '+out);
const bundle=fs.readFileSync(path.join(base,'r5snap-native60-scene.js'),'utf8');
const alias=/var ([\w$]+)=[\w$]+,[\w$]+=new Set\(\["CAC1FD2246E486B4"/.exec(bundle);
if(!alias)throw Error('Cannot identify native60 shader set; refusing to replace it');
const context={SharedArrayBuffer,Int32Array,Atomics,location:{href:'https://local.invalid/gh3/'}};
vm.runInNewContext(bundle.replace('globalThis.__r5liveConsumer=',`globalThis.__capturedShaders=${alias[1]};globalThis.__r5liveConsumer=`),context,{timeout:5000});
const shaders=JSON.parse(JSON.stringify(context.__capturedShaders));
if(Object.keys(shaders).length<100)throw Error('Incomplete shader set');
fs.cpSync(base,out,{recursive:true,filter:src=>path.basename(src)!=='chunks'&&!src.endsWith('.wasm')});
for(const name of fs.readdirSync(base).filter(n=>n.endsWith('.wasm')))fs.linkSync(path.join(base,name),path.join(out,name));
if(fs.existsSync(path.join(base,'chunks'))){fs.mkdirSync(path.join(out,'chunks'));for(const n of fs.readdirSync(path.join(base,'chunks')))fs.linkSync(path.join(base,'chunks',n),path.join(out,'chunks',n));}
for(const scene of [false,true])await build({bundle:true,minify:true,format:'iife',platform:'browser',target:'es2022',external:['module'],entryPoints:['tools/r5-native60/consumer.mjs'],outfile:path.join(out,`r5snap-native60-${scene?'scene':'colas'}.js`),define:{'import.meta.url':'globalThis.location.href',__NATIVE_SHADERS__:JSON.stringify(shaders),__NATIVE_SCENE__:String(scene)}});
fs.copyFileSync(path.join(out,'r5snap-native60-colas.js'),path.join(out,'r5snap-native60-render.js'));
fs.writeFileSync(path.join(out,'../stage.json'),JSON.stringify({base,out,shaderCount:Object.keys(shaders).length,changed:['r5snap-native60-scene.js','r5snap-native60-colas.js','r5snap-native60-render.js'],wasmUnchanged:true},null,2));
console.log(JSON.stringify({base,out,shaderCount:Object.keys(shaders).length}));
