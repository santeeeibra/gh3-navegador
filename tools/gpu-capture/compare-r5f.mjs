// Compare two .r5f captures of the same menu frame and re-check texture ranges with
// Codex's layout (tools/r5-menu/texture-layout.mjs, read-only import).
// usage: node tools/gpu-capture/compare-r5f.mjs <old.r5f> <new.r5f> <out.json> [frame=3] [from=395] [to=438] [newFrame=frame]
// Draws are aligned by POSITION inside the frame (global indices depend on when capture
// started); from/to are OLD indices. Alignment is checked with shaders + fetch words.
import fs from 'node:fs';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {prepareTextureBase} from '../r5-menu/texture-layout.mjs';
import {sha256,writeJson} from './lib.mjs';
const [oldP,newP,outP,frame='3',from='395',to='438',newFrame=frame]=process.argv.slice(2);
const hash=await createHash();
const load=p=>{const raw=fs.readFileSync(p);return {path:p,sha256:sha256(raw),bytes:raw.length,c:readFrameCapture(raw,{hash})};};
const A=load(oldP),B=load(newP);
const draws=(x,f)=>[...replayEvents(x.c,Number(f))].filter(e=>e.type==='draw');
const da=draws(A,frame),db=draws(B,newFrame);
if(da.length!==db.length)throw Error(`frames differ: ${da.length} vs ${db.length} draws`);
const out={old:{path:A.path,sha256:A.sha256,bytes:A.bytes,draws:da.length},new:{path:B.path,sha256:B.sha256,bytes:B.bytes,draws:db.length},frame:Number(frame),newFrame:Number(newFrame),range:[+from,+to],ops:[]};
const tryLayout=(t,blob)=>{if(!t)return {status:'no-texture'};if(!blob)return {status:'no-blob'};try{const r=prepareTextureBase(t,blob.data);return {status:'ok',bytes:blob.data.length,width:r.width,height:r.height};}catch(e){return {status:e.code||'error',message:e.message,captured:blob.data.length,required:e.requiredBytes};}};
for(const [pos,o] of da.entries())if(o.index>=+from&&o.index<=+to){
 const d=db[pos];
 const t=d.textures[0],to_=o?.textures[0];
 const nb=t&&B.c.blobs.get(t.baseBlob),ob=to_&&A.c.blobs.get(to_.baseBlob);
 const rec={draw:o.index,newIndex:d.index,position:pos,sameShaders:!!o&&o.vs===d.vs&&o.ps===d.ps,sameFetch:!!o&&!!t&&!!to_&&t.raw.every((x,i)=>x===to_.raw[i]),
  oldBaseBytes:to_?.baseBytes,newBaseBytes:t?.baseBytes,oldLayout:tryLayout(to_,ob),newLayout:tryLayout(t,nb),
  dependency:t?.dependency,baseDependency:t?.baseDependency,srcChanged:!!(d.srcChanged||nb?.srcChanged)};
 // The new range must start with exactly the bytes captured before (same guest memory if the menu frame matches).
 if(ob&&nb){const n=Math.min(ob.data.length,nb.data.length);rec.prefixEqual=Buffer.compare(Buffer.from(ob.data.subarray(0,n)),Buffer.from(nb.data.subarray(0,n)))===0;rec.oldBlobSha=sha256(Buffer.from(ob.data));rec.newBlobSha=sha256(Buffer.from(nb.data));}
 out.ops.push(rec);
}
const s=out.summary={ops:out.ops.length,
 oldLayoutOk:out.ops.filter(r=>r.oldLayout.status==='ok').length,newLayoutOk:out.ops.filter(r=>r.newLayout.status==='ok').length,
 recovered:out.ops.filter(r=>r.oldLayout.status!=='ok'&&r.newLayout.status==='ok').map(r=>r.draw),
 lost:out.ops.filter(r=>r.oldLayout.status==='ok'&&r.newLayout.status!=='ok').map(r=>r.draw),
 stillMissing:out.ops.filter(r=>r.newLayout.status!=='ok').map(r=>({draw:r.draw,...r.newLayout})),
 sameShadersAll:out.ops.every(r=>r.sameShaders),sameFetchAll:out.ops.every(r=>r.sameFetch),prefixEqualAll:out.ops.filter(r=>'prefixEqual' in r).every(r=>r.prefixEqual),
 baseBytesGrew:out.ops.filter(r=>r.newBaseBytes>r.oldBaseBytes).length,baseBytesSame:out.ops.filter(r=>r.newBaseBytes===r.oldBaseBytes).length};
writeJson(outP,out);
console.log(JSON.stringify({old:out.old,new:out.new,summary:s},null,1));
