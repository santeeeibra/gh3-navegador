import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readSnapshotV1} from './snapshot-reader.mjs';
const root=resolve(import.meta.dirname,'../..'),cap=resolve(root,'artifacts/r5-native-capture/run5/capture');
const get=n=>readFile(resolve(cap,n));
const buf=Buffer.alloc(4*1024*1024),v=new DataView(buf.buffer,buf.byteOffset,buf.byteLength);let cursor=256;
const u32=(o,x)=>v.setUint32(o,x,true),u64=(o,x)=>v.setBigUint64(o,x,true);
const alloc=data=>{const off=cursor;buf.set(data,off);cursor=(off+data.length+255)&~255;return off;};
const vf=alloc(Buffer.alloc(48)),tf=alloc(Buffer.alloc(448));
u32(0,0x31533552);v.setUint16(4,1,true);v.setUint16(6,192,true);u64(24,(1n<<54n)+3n);u32(32,1);u32(48,6);u32(52,4);u64(112,0x57F6448DAC5BEB74n);u64(120,0xAB008EF1D1A8CB6Dn);
u32(84,alloc(await get('registers.bin')));u32(88,0x5003);
for(const [file,off] of [['vs.ucode.bin',92],['ps.ucode.bin',100]]){const raw=await get(file);u32(off,alloc(raw));u32(off+4,raw.length/4);}
u32(108,1);u32(136,vf);u32(140,4);u32(144,tf);
const rawV=await get('vertex-fetch-95.bin'),vr0=rawV.readUInt32LE(0),vr1=rawV.readUInt32LE(4),vertices=await get('vertices-95.bin');
u32(vf,95);buf.set(rawV,vf+4);u32(vf+12,vr1&3);u32(vf+16,(vr0>>>2)*4);u32(vf+20,vertices.length);u32(vf+24,alloc(vertices));
for(const [i,slot] of [0,2,1,3].entries()){
 const off=tf+i*112,raw=await get('texture-fetch-'+slot+'.bin'),w=Array.from({length:6},(_,j)=>raw.readUInt32LE(j*4)),tex=await get('texture-'+slot+'.bin');
 u32(off,slot);buf.set(raw,off+4);u32(off+28,w[1]&63);u32(off+32,w[1]>>>6&3);u32(off+36,w[5]>>>9&3);u32(off+40,w[2]&8191);u32(off+44,w[2]>>>13&8191);u32(off+48,0);u32(off+52,(w[0]>>>22&511)*32);u32(off+56,w[0]>>>31);u32(off+60,w[4]>>>2&15);u32(off+64,w[4]>>>6&15);u32(off+68,w[5]>>>11&1);u32(off+72,(w[1]>>>12)*4096);u32(off+76,tex.length);u32(off+80,alloc(tex));
}
u32(8,cursor);const fixture=buf.subarray(0,cursor);await writeFile(resolve(root,'artifacts/r5-runtime/snapshot-fixture.bin'),fixture);
const tests=[];const check=(name,f)=>{f();tests.push({name,passed:true});};
const read=b=>readSnapshotV1(b,0,b.length);
check('native resource bytes round trip',()=>{const s=read(fixture);assert.deepEqual(Buffer.from(s.registers),buf.subarray(v.getUint32(84,true),v.getUint32(84,true)+81932));assert.deepEqual(Buffer.from(s.vertex.data),vertices);assert.equal(s.textures.length,4);assert.equal(s.header.eventSeq,(1n<<54n)+3n);});
for(const t of read(fixture).textures)check('texture '+t.slot+' exact bytes',()=>assert.deepEqual(Buffer.from(t.base),buf.subarray(v.getUint32(tf+[0,2,1,3].indexOf(t.slot)*112+80,true),v.getUint32(tf+[0,2,1,3].indexOf(t.slot)*112+80,true)+t.baseBytes)));
check('fresh heap with slot offset and full sequence',()=>{const heap=new Uint8Array(fixture.length+512);heap.set(fixture,256);const s=readSnapshotV1(heap,256,fixture.length,{slotIndex:0,eventSeq:(1n<<54n)+3n});heap.fill(0);assert.deepEqual(Buffer.from(s.vertex.data),vertices);});
const bad=(name,offset,value,pattern)=>check(name,()=>{const b=Buffer.from(fixture);b.writeUInt32LE(value,offset);assert.throws(()=>read(b),pattern);});
bad('bad magic',0,0,/magic/);bad('used bytes mismatch',8,192,/used_bytes/);bad('unaligned registers',84,193,/offset/);bad('overlap with table',84,vf,/overlaps/);bad('oversized microcode',96,0xffffffff,/offset/);bad('wrong slot',20,2,/enum/);bad('wrong resource physical range',vf+16,0x20000000,/mismatch|physical/);bad('vertex fetch size mismatch',vf+20,79,/decode mismatch/);bad('wrong texture order',tf,1,/texture fields/);bad('texture out of range',tf+76,0xffffffff,/physical/);
check('2D encoded sizes',()=>{const t=read(fixture).textures[0];assert.equal(t.width,1279);assert.equal(t.height,719);assert.equal(t.depth,0);});
bad('texture size differs from fetch',tf+40,1280,/size decode/);
check('callback sequence mismatch',()=>assert.throws(()=>readSnapshotV1(fixture,0,fixture.length,{eventSeq:3n}),/sequence/));
check('truncated heap',()=>assert.throws(()=>readSnapshotV1(fixture,0,fixture.length+1),/bounds/));
check('slot cap',()=>assert.throws(()=>readSnapshotV1(new Uint8Array(4194305),0,4194305),/bounds/));
check('header-only unsupported record',()=>{const b=Buffer.from(fixture.subarray(0,192));b.writeUInt32LE(192,8);b.writeUInt32LE(1,12);b.writeUInt32LE(1,16);for(const o of [76,80,84,88,92,96,100,104,108,136,140,144])b.writeUInt32LE(0,o);assert.equal(read(b).unsupported,true);});
await writeFile(resolve(root,'artifacts/r5-runtime/snapshot-reader-check.json'),JSON.stringify({passed:true,tests,fixtureBytes:fixture.length,source:'run5 native captured resources; synthetic v1 framing, no wasm producer',xxh3Verified:false},null,2));
console.log(JSON.stringify({passed:true,tests:tests.length,fixtureBytes:fixture.length,sequence64:'preserved > 2^53'},null,2));
