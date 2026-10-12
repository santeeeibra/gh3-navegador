import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {validateImage} from './image-check.mjs';
const require=createRequire(new URL('../../../toolchain/bottleship/package.json',import.meta.url));const {PNG}=require('pngjs');
const root='D:/guitar hero/artifacts/graphics-probe/extended';
const stage=(text,name)=>{const m=text.match(new RegExp('stage='+name+' result=0x([0-9A-F]+)'));return m?parseInt(m[1],16):null;};
const api=async(path)=>{const log=await readFile(path,'utf8');return{exitCode:stage(log,'exit-code'),durationMs:stage(log,'render-elapsed-ms'),frames:stage(log,'final-frame-count'),initialClear:stage(log,'Clear'),initialDraw:stage(log,'DrawPrimitiveUP'),initialPresent:stage(log,'Present'),pass:stage(log,'exit-code')===0&&stage(log,'render-elapsed-ms')>=15000};};
const summary={at:new Date().toISOString(),policy:'Success requires both API checks and expected pixels in a visible window capture. GPU readback alone never passes the native visual test.',tests:{}};
for(const name of ['triangle','texture','shader']){
 const dir=root+'/'+name;
 const nativeVisible=validateImage(PNG.sync.read(await readFile(dir+'/native/visible-1.png')),name);
 const nativeTarget=validateImage(PNG.sync.read(await readFile(dir+'/native/render-target.png')),name);
 const bs=JSON.parse(await readFile(dir+'/bottleship/evidence.json','utf8'));
 const nativeApi=await api(dir+'/native/dx9-probe.log');const bsApi=await api(dir+'/bottleship/dx9-probe.log');
 summary.tests[name]={native:{api:nativeApi,visible:nativeVisible,renderTargetDiagnostic:nativeTarget,pass:nativeApi.pass&&nativeVisible.pass},bottleship:{api:bsApi,visiblePass:bs.visualPass,pageErrors:bs.errors,pass:bsApi.pass&&bs.visualPass&&bs.errors.length===0},comparisonComplete:nativeApi.pass&&nativeVisible.pass&&bsApi.pass&&bs.visualPass};
}
const hash=async(p)=>createHash('sha256').update(await readFile(p)).digest('hex');
summary.blueReference={exeSha256:await hash('D:/guitar hero/artifacts/graphics-probe/dx9-probe.exe'),bundleSha256:await hash('D:/guitar hero/artifacts/graphics-probe/dx9-probe.wgb')};
summary.blueReference.preserved=summary.blueReference.exeSha256==='7df13341602cdec2b634a8bae424b94ec4b21341ade25bfa008af9387e27bb54'&&summary.blueReference.bundleSha256==='42c9d671ff2b9ebca87b9790d7e47f39a03a1c35cbdc19006c29b2364a267861';
const gdi=PNG.sync.read(await readFile(root+'/gdi-control/native/visible-1.png'));let blue=0;for(let p=0;p<gdi.data.length;p+=4)if(gdi.data[p]===32&&gdi.data[p+1]===96&&gdi.data[p+2]===160)blue++;
summary.nativeDiagnosis={gdiControlBluePixels:blue,total:gdi.width*gdi.height,gdiControlPassed:blue===640*480,rootCause:'Undetermined. Direct3D window captures white, GDI control captures correctly; GPU targets contain correct geometry. Raising window, BeginScene/EndScene, COPY and display wake did not fix it. DXGI capture timed out.',details:'native-diagnostic/'};
const negative=PNG.sync.read(await readFile(root+'/triangle/native/visible-1.png'));
summary.negativeControls={whiteRejected:['triangle','texture','shader'].every(n=>!validateImage(negative,n).pass)};
const blueData=Buffer.alloc(640*480*4);for(let p=0;p<blueData.length;p+=4){blueData[p]=32;blueData[p+1]=96;blueData[p+2]=160;blueData[p+3]=255;}
summary.negativeControls.blueOnlyShaderRejected=!validateImage({width:640,height:480,data:blueData},'shader').pass;
await writeFile(root+'/verification.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({referencePreserved:summary.blueReference.preserved,tests:Object.fromEntries(Object.entries(summary.tests).map(([name,t])=>[name,{nativeApi:t.native.api.pass,nativeVisible:t.native.visible.pass,nativeTarget:t.native.renderTargetDiagnostic.pass,bottleship:t.bottleship.pass,duration:t.bottleship.api.durationMs,frames:t.bottleship.api.frames}])),negativeControls:summary.negativeControls},null,2));

if(!summary.blueReference.preserved||!Object.values(summary.tests).every(t=>t.comparisonComplete)||!Object.values(summary.negativeControls).every(Boolean))process.exitCode=1;

