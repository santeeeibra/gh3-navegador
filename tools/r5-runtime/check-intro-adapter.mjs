import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {readSnapshotV1} from './snapshot-reader.mjs';
import {prepareIntroSnapshot} from './prepare-intro-snapshot.mjs';
const dir=new URL('../../artifacts/r5-runtime/',import.meta.url);
const b=new Uint8Array(await readFile(new URL('snapshot-fixture.bin',dir)));
const s=readSnapshotV1(b,0,b.length),p=prepareIntroSnapshot(s),checks=[];
for(const [name,bytes]of Object.entries(p.assets)){
  assert.deepEqual(Buffer.from(bytes),await readFile(new URL('../../artifacts/r5-replay/data/'+name,import.meta.url)));
  checks.push(name+' identical to native replay');
}
const reg=(i,x)=>{const q=readSnapshotV1(b,0,b.length);new DataView(q.registers.buffer,q.registers.byteOffset).setUint32(i*4,x,true);return q;};
for(const [i,x]of [[0x2206,1],[0x2081,1],[0x2200,1],[0x2000,1<<16],[0x2001,1<<16]]){
  assert.throws(()=>prepareIntroSnapshot(reg(i,x)),/Unsupported/);checks.push('reject register '+i.toString(16));
}
const q=readSnapshotV1(b,0,b.length);q.textures[3].base[0]=0;assert.throws(()=>prepareIntroSnapshot(q),/translucent/);checks.push('reject prior-frame alpha dependency');
const q2=readSnapshotV1(b,0,b.length);q2.textures[0].baseBytes--;assert.throws(()=>prepareIntroSnapshot(q2),/texture layout/);checks.push('reject missing last-row pixel');
await writeFile(new URL('adapter-check.json',dir),JSON.stringify({passed:true,checks,constantsSource:'derived from registers, no template constants'},null,2));
console.log(JSON.stringify({passed:true,checks:checks.length}));
