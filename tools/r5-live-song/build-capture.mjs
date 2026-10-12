import fs from 'node:fs';
import {build} from 'esbuild';
const out='artifacts/r5-live-song/capture-runtime';fs.mkdirSync(out,{recursive:true});
await build({entryPoints:['tools/r5-live-song/capture-consumer.mjs'],outfile:out+'/r5snap-song-capture.js',bundle:true,format:'iife',platform:'browser',target:'es2022',external:['module'],define:{'import.meta.url':'globalThis.location.href'}});
const source=fs.readFileSync('artifacts/d1-wasm/r5live/d4/gh3-web.js','utf8'),anchor='Module["r3cFrame"] =';
if(!source.includes(anchor))throw Error('Runtime anchor missing');
fs.writeFileSync(out+'/gh3-web.js',source.replace(anchor,`Module['songCaptureControl']=flag=>self.postMessage({type:'songCaptureControl',flag});
 Module['songCaptureError']=error=>self.postMessage({type:'songCaptureError',error});
 Module['songCapture']=data=>self.postMessage({type:'songCapture',data},[data.bytes,...data.resources.map(r=>r.data)]);
 ${anchor}`));
fs.writeFileSync(out+'/index.html',`<!doctype html><html><meta charset="utf-8"><input type="file" id="dir" webkitdirectory multiple><button id="go">Iniciar</button><script>
window.songDiag={lines:[],exit:null,captures:0};let files=[],worker;
document.getElementById('dir').onchange=()=>{files=[...document.getElementById('dir').files].map(f=>({name:f.webkitRelativePath.split('/').slice(1).join('/'),data:f}));};
document.getElementById('go').onclick=()=>{
worker=window.songWorker=new Worker('gh3-web.js?seconds=180&log=info&gpu=null&audio=silent&xma=decode&cpwait=event&cpasync=1&r5live=1&r5liveconsumer=r5snap-song-capture.js',{name:'gh3-main'});
worker.onmessage=async({data:m})=>{
 if(m.type==='log')songDiag.lines.push(m.text);
 else if(m.type==='exit'){songDiag.exit=m.code;worker.terminate();}
 else if(m.type==='songCaptureControl')window.songCaptureFlag=m.flag;
 else if(m.type==='songCaptureError')songDiag.error=m.error;
 else if(m.type==='songCapture'){
  const n=songDiag.captures++,base='/capture/'+n;
  await fetch(base+'/frame.r5f',{method:'POST',body:m.data.bytes});
  for(const r of m.data.resources)await fetch(base+'/'+r.phys+'-'+r.length+'.bin',{method:'POST',body:r.data});
  await fetch(base+'/resources.json',{method:'POST',body:JSON.stringify({...m.data,bytes:undefined,resources:m.data.resources.map(r=>({phys:r.phys,length:r.length}))})});
  songDiag.saved=(songDiag.saved||0)+1;
 }
};worker.onerror=e=>songDiag.error=e.message;worker.postMessage({type:'files',files});
};</script></html>`);
console.log(out);
