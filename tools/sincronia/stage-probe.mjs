import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
const src='artifacts/d1-wasm/lagtest/demo', dst='artifacts/sincronia-rea/demo';
if(fs.existsSync(dst)) throw Error('La copia de prueba ya existe; no sobrescribir.');
fs.cpSync(src,dst,{recursive:true});
let tap=fs.readFileSync('tools/autopista60/tap.mjs','utf8');
const readProbe = `
let syncSeg = 0, syncLivePtr = 0;
chan.addEventListener('message', e => { if(e.data?.type==='syncMemory') {syncSeg=e.data.seg>>>0;syncLivePtr=e.data.livePtr>>>0;} });
function syncRead(api) {
  if(!syncSeg) return null;
  try {
    const buffer=api.readPhysical(0,4).buffer, dv=new DataView(buffer);
    const host=a=>(dv.getUint32(syncSeg+(a>>>24)*4,true)+a)>>>0;
    const f=a=>dv.getFloat32(host(a),false), d=a=>dv.getFloat64(host(a),false), u=a=>dv.getUint32(host(a),false);
    const at=performance.timeOrigin+performance.now(), baseSec=d(0x82BD7C38);
    const row={at,baseSec,legacyEdgeMs:f(0x829B57B0),inputOffsetMs:f(0x829B56C0),
      earlySec:f(0x829A0438),lateSec:f(0x829AD418),hammerEarlySec:f(0x829AD448),hammerLateSec:f(0x82991718),
      noteIndex:u(0x829B5748),noteArray:u(0x829B6988),baseSecAfter:d(0x82BD7C38)};
    if(syncLivePtr) {const a=new Int32Array(buffer,syncLivePtr,11);row.input={seq:Atomics.load(a,0),buttons:Atomics.load(a,1),latch:Atomics.load(a,10),writtenAt:dv.getFloat64(syncLivePtr+32,true)};}
    row.finishedAt=performance.timeOrigin+performance.now();
    return row;
  }catch(e){return {error:String(e.message)};}
}
`;
tap=tap.replace('const sameBytes = ',readProbe+'\nconst sameBytes = ')
  .replace('const t0 = performance.now(), w = ringWrite(api), out = [], textures = [];','const t0 = performance.now(), w = ringWrite(api), sync = syncRead(api), out = [], textures = [];')
  .replace("chan.postMessage({ type: 'frame',", "chan.postMessage({ type: 'frame', sync,");
if(!tap.includes('const t0 = performance.now(), w = ringWrite(api), sync')) throw Error('Hook de captura no encontrado.');
fs.writeFileSync('tools/sincronia/tap-probe.mjs',tap);
await build({entryPoints:['tools/sincronia/tap-probe.mjs'],bundle:true,format:'iife',minify:true,outfile:path.join(dst,'autopista60-tap.js'),logLevel:'warning'});
fs.copyFileSync('tools/sincronia/page-probe.js',path.join(dst,'sync-probe.js'));
let html=fs.readFileSync(path.join(dst,'index.html'),'utf8');
if(!html.includes('<script src="autopista60.js"></script>')) throw Error('No está el punto de instrumentación.');
html=html.replace('<script src="autopista60.js"></script>','<script src="sync-probe.js"></script>\n<script src="autopista60.js"></script>');
fs.writeFileSync(path.join(dst,'index.html'),html);
let runner=fs.readFileSync('tools/sincronia/robot.mjs','utf8');
runner=runner.replace('capaAdelantoMs: h?.offsetMs ?? null,','probe: window.syncProbe?.latest, capaAdelantoMs: h?.offsetMs ?? null,')
  .replace('finally { if (duro)',`finally { try { if(g) {const probe=await g.page.evaluate(()=>window.syncProbe); fs.writeFileSync(path.join(out,'sync-probe.json'),JSON.stringify(probe));} }catch(e){res.errores.push('probe: '+e.message);} if (duro)`);
fs.writeFileSync('tools/sincronia/robot-probe.mjs',runner);
console.log(JSON.stringify({dst,mode:'audio unchanged',new:'paired capture'}));
