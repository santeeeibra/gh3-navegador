import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createResourceReader} from '../tools/r5-native60/snapshot-prepare.mjs';
const texture={basePhys:0,baseBytes:256,raw:[0,0,0,0,0,0],format:2,dimension:1,depth:0,width:0,height:0,pitch:1,tiled:0,endian:0,status:0,baseDependency:0};
function fixture(options={}){
 const memory=new Uint8Array(1024);let views=0;
 const read=(p,n)=>{views++;return memory.subarray(p,p+n);};
 const digest=(p,n)=>createHash('sha256').update(memory.subarray(p,p+n)).digest('hex').slice(0,32);
 const reader=createResourceReader(read,{resourceHash:digest,...options});
 const next=t=>{reader.begin();return reader.texture(t||texture);};
 return {memory,reader,next,views:()=>views,digest};
}
test('full digest reuses texture without reading, copying, comparing or decoding',()=>{
 const f=fixture(),a=f.next(),before={...f.reader.stats},views=f.views();
 assert.equal(f.next(),a);assert.equal(f.views(),views);
 for(const key of ['copiedBytes','comparedBytes','textureDecodes'])assert.equal(f.reader.stats[key],before[key]);
 assert.equal(f.reader.stats.hashReusedBytes,256);
});
test('every byte matters, including padding and range endpoints',()=>{
 const f=fixture();let a=f.next();
 for(const i of [0,1,127,255]){f.memory[i]++;const b=f.next();assert.notEqual(b.revision,a.revision);assert.equal(b.raw[i],1);a=b;}
 assert.equal(a.data[0],1);
 assert.equal(f.reader.stats.comparedBytes,0);
});
test('fallback compares live data and copies only changed textures',()=>{
 const f=fixture({resourceHash:undefined}),a=f.next(),copied=f.reader.stats.copiedBytes;
 assert.equal(f.next(),a);assert.equal(f.reader.stats.copiedBytes,copied);assert.equal(f.reader.stats.unchangedCopyBytesAvoided,256);
 f.memory[0]=9;const b=f.next();assert.equal(b.data[0],9);assert.equal(a.data[0],0);assert.notEqual(b.revision,a.revision);
});
test('null, invalid and throwing hashes never authorize reuse',()=>{
 for(const resourceHash of [()=>null,()=>23,()=>NaN,()=>({}),()=>'',()=>{throw Error('unavailable');}]){
  const f=fixture({resourceHash});f.next();f.memory[0]=7;assert.equal(f.next().data[0],7);assert.equal(f.reader.stats.hashReuses,0);
 }
});
test('same-frame texture reads are memoized before asking the producer',()=>{
 const f=fixture(),a=f.next(),calls=f.reader.stats.hashCalls;
 assert.equal(f.reader.texture(texture),a);assert.equal(f.reader.stats.hashCalls,calls);
});
test('range digest cache handles geometry changes and preserves old snapshots',()=>{
 const f=fixture();f.reader.begin();const a=f.reader.read(0,12);f.reader.begin();assert.equal(f.reader.read(0,12),a);
 f.memory[11]=5;f.reader.begin();const b=f.reader.read(0,12);assert.equal(b[11],5);assert.equal(a[11],0);assert.notEqual(b,a);
});
test('range cache is bounded and unknown hashes invalidate old entries',()=>{
 let available=true;const f=fixture({rangeBudget:256,resourceHash:(p,n)=>available?'0000000000000000':null});
 f.reader.begin();f.reader.read(0,256);f.reader.read(256,256);assert.equal(f.reader.stats.rangeCacheBytes,256);
 available=false;f.memory[256]=7;f.reader.begin();assert.equal(f.reader.read(256,256)[0],7);assert.equal(f.reader.stats.rangeCacheBytes,0);
});
test('changes during snapshot copy do not attach a reusable digest',()=>{
 let call=0;const f=fixture({resourceHash:()=>String(++call).padStart(16,'0')});
 f.next();assert.equal(f.reader.stats.hashUnstable,1);f.memory[0]=4;assert.equal(f.next().data[0],4);assert.equal(f.reader.stats.hashReuses,0);
});
test('changed texture metadata and recycled addresses prepare a new texture',()=>{
 const f=fixture(),a=f.next(),b=f.next({...texture,raw:[0,0,1,0,0,0]});assert.notEqual(a.key,b.key);
 f.memory[0]=8;const c=f.next();assert.equal(c.data[0],8);assert.notEqual(c.revision,a.revision);
});
test('unaligned fallback views, short reads and invalid ranges',()=>{
 const f=fixture({resourceHash:undefined}),t={...texture,basePhys:1};f.next(t);assert.doesNotThrow(()=>f.next(t));
 assert.throws(()=>f.reader.read(-1,4),/Resource range/);assert.throws(()=>f.reader.read(0,17*1024*1024),/Resource range/);
 assert.throws(()=>f.reader.read(1020,8),/Short physical read/);
});
test('unused textures and range cache entries expire after 120 snapshots',()=>{
 const f=fixture(),a=f.next();f.reader.read(0,16);for(let i=0;i<121;i++)f.reader.begin();
 assert.equal(f.reader.stats.rangeCacheBytes,0);assert.notEqual(f.reader.texture(texture).revision,a.revision);
});
