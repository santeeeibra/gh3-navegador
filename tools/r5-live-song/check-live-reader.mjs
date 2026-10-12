import fs from 'node:fs';
import assert from 'node:assert/strict';
import {readFrameCapture,replayEvents} from '../r5-menu/frame-reader.mjs';
import {createHash} from '../r5-menu/hash.mjs';
import {readLiveDraws} from './live-reader.mjs';
const hash=await createHash(),files=['artifacts/r5-live-song/capture-1/2/frame.r5f','artifacts/r5-live-song/capture-2/0/frame.r5f','artifacts/r5-live-song/capture-2/2/frame.r5f'];let checked=0;
for(const file of files){const bytes=new Uint8Array(fs.readFileSync(file)),reference=[...replayEvents(readFrameCapture(bytes,{hash}),0)].filter(d=>d.type==='draw'),counts={};let i=0;
 for(const d of readLiveDraws(bytes,{hash,counts})){const r=reference[i++];for(const [k,a] of Object.entries(d)){
  if(k==='vertices'||k==='textures'){assert.equal(a.length,r[k].length);for(let j=0;j<a.length;j++)for(const [f,v] of Object.entries(a[j]))assert.deepEqual(v,r[k][j][f],file+' '+k+'.'+f);}
  else assert.deepEqual(a,r[k],file+' '+k);
 }checked++;}assert.equal(i,reference.length);
 for(const malformed of [bytes.slice(0,-16),Uint8Array.from(bytes)]){if(malformed.length===bytes.length)new DataView(malformed.buffer).setUint32(68,15,true);assert.throws(()=>[...readLiveDraws(malformed,{hash})]);}
}
console.log(JSON.stringify({ok:true,drawsEquivalent:checked,frames:files.length,malformedRejected:files.length*2,registers:'compared before advancing; live projection borrows mutable bank'}));
