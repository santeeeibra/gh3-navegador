import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {chromium} from 'playwright';
import {sha256} from './sha256.mjs';
import {createReader} from './runtime.mjs';
import {createLoaderServer} from './server.mjs';
import {validateManifest} from './cache.mjs';

const out=path.resolve('artifacts/local-loader/checks');fs.mkdirSync(out,{recursive:true});
const report={checks:[],pageErrors:[]},check=(name,f)=>{f();report.checks.push(name);};
const nodeHash=b=>crypto.createHash('sha256').update(b).digest('hex');
let browser,server;
try{
  check('SHA-256 matches Node, boundaries and binary input',()=>{for(const n of [0,1,55,56,63,64,65,1000,2097152]){const b=crypto.randomBytes(n);assert.equal(sha256(b),nodeHash(b));}});
  const size=64,b=crypto.randomBytes(231),chunks=[];
  for(let off=0;off<b.length;off+=size){const part=b.subarray(off,off+size);chunks.push({offset:off,size:part.length,hash:nodeHash(part)});}
  const f={id:0,path:'DATA/test.bin',size:b.length,chunkSize:size,chunks},cached=new Map([[chunks[1].hash,b.subarray(64,128)]]);
  const reader=createReader({cached,readBlob:x=>x,fetchSync:(f,i)=>new Uint8Array(b.subarray(chunks[i].offset,chunks[i].offset+chunks[i].size)),maxBytes:128});
  check('Random-access reads, cross-chunk spans, EOF, offsets and LRU eviction',()=>{
    for(const [pos,len] of [[0,0],[0,231],[63,68],[127,104],[200,300],[231,10],[19,120],[64,10],[0,65]]){
      const dest=new Uint8Array(400).fill(172),n=reader(f,dest,7,len,pos),expected=b.subarray(pos,Math.min(b.length,pos+len));
      assert.equal(n,expected.length);assert.deepEqual(Buffer.from(dest.subarray(7,7+n)),expected);assert.equal(dest[6],172);assert.equal(dest[7+n],172);
    }
  });
  check('Incorrect runtime bytes rejected before copy',()=>{
    const r=createReader({fetchSync:()=>new Uint8Array(64),readBlob:x=>x});const dest=new Uint8Array(100).fill(9);
    assert.throws(()=>r(f,dest,0,20,0),/Integridad/);assert.equal(dest[0],9);
  });
  const fixture=path.join(out,'fixture'),game=path.join(fixture,'game');fs.mkdirSync(path.join(game,'DATA'),{recursive:true});
  const payload=crypto.randomBytes(2097152*2+31),file=path.join(game,'DATA','test.bin');fs.writeFileSync(file,payload);
  const fileChunks=[];for(let off=0;off<payload.length;off+=2097152){const p=payload.subarray(off,off+2097152);fileChunks.push({offset:off,size:p.length,hash:nodeHash(p)});}
  const m={format:1,version:nodeHash(payload),chunkSize:2097152,files:[{id:0,path:'DATA/test.bin',size:payload.length,chunks:fileChunks}],packages:{base:{files:[0]}}};
  validateManifest(m);
  check('Manifest rejects traversal and incomplete chunk maps',()=>{
    const wrong=structuredClone(m);wrong.files[0].path='../private';assert.throws(()=>validateManifest(wrong));
    const hole=structuredClone(m);hole.files[0].chunks[1].offset++;assert.throws(()=>validateManifest(hole));
  });
  fs.writeFileSync(path.join(fixture,'index.html'),'<!doctype html><title>Storage checks</title>');
  fs.copyFileSync('tools/local-loader/cache.mjs',path.join(fixture,'cache.js'));
  fs.copyFileSync('artifacts/local-loader/demo/r5snap-local-fs.js',path.join(fixture,'local-fs.js'));
  fs.writeFileSync(path.join(fixture,'worker.js'),`importScripts('/local-fs.js');onmessage=e=>{try{
    const d=e.data,W={reader:new FileReaderSync(),stream_ops:{read(){return -123;}}};GH3LocalFS.install(W,d.config);
    const b=new Uint8Array(16),n=W.stream_ops.read({node:{contents:d.file}},b,0,b.length,2097152-3);
    postMessage({type:'result',n,bytes:[...b],old:W.stream_ops.read({node:{contents:new Blob()}},b,0,1,0)});
  }catch(e){postMessage({type:'result',error:e.stack});}};`);
  const assets={gameStats:[{mtimeMs:fs.statSync(file).mtimeMs}],static:Object.fromEntries(['index.html','cache.js','local-fs.js','worker.js'].map(n=>[n,{hash:nodeHash(fs.readFileSync(path.join(fixture,n)))}]))},requests=[];
  server=createLoaderServer({root:fixture,game,catalog:m,assets,onRequest:p=>requests.push(p)});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
  for(const [url,options,status] of [
    ['/server-config.json',{},404],['/local-chunk/'+'0'.repeat(64)+'/0/0',{},404],
    ['/local-chunk/'+m.version+'/0/9',{},404],
    ['/local-manifest.json',{headers:{Origin:'https://evil.test'}},403],
    ['/local-manifest.json',{method:'POST'},405],['/%2e%2e/CLAUDE.md',{},404],
  ]){assert.equal((await fetch(base+url,options)).status,status,url+' '+JSON.stringify(options));}
  const badHost=await new Promise((resolve,reject)=>{http.get(base+'/local-manifest.json',{headers:{Host:'evil.test'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});
  assert.equal(badHost,403);
  report.checks.push('Loopback server: path allowlist, version/index checks, Host/Origin and methods');
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(base);
  const first=await page.evaluate(async()=>{
    const c=await import('/cache.js'),m=c.validateManifest(await (await fetch('/local-manifest.json')).json()),db=await c.openCache(),abort=new AbortController();let error;
    try{await c.prepare(db,m,['base'],{signal:abort.signal,onProgress:()=>abort.abort()});}catch(e){error=e.name;}
    db.close();return {error};
  });assert.equal(first.error,'AbortError');report.checks.push('Interrupted preparation keeps committed chunk');
  requests.length=0;await page.reload();
  const resumed=await page.evaluate(async()=>{
    const c=await import('/cache.js'),m=await (await fetch('/local-manifest.json')).json(),db=await c.openCache(),r=await c.prepare(db,m,['base']);db.close();return r.stats;
  });assert.equal(resumed.cached,2097152);assert.equal(resumed.downloaded,payload.length-2097152);assert.equal(requests.filter(p=>p.startsWith('/local-chunk/')).length,2);
  report.resumed=resumed;report.checks.push('Reload resumes with only missing chunks transferred');
  requests.length=0;await page.route('**/local-chunk/**',r=>r.abort());await page.reload();
  const offline=await page.evaluate(async()=>{
    const c=await import('/cache.js'),m=await (await fetch('/local-manifest.json')).json(),db=await c.openCache(),r=await c.prepare(db,m,['base']);db.close();return r.stats;
  });assert.equal(offline.downloaded,0);assert.equal(offline.cached,payload.length);assert.equal(requests.filter(p=>p.startsWith('/local-chunk/')).length,0);report.offline=offline;
  report.checks.push('Prepared package recovered with all asset requests blocked');await page.unroute('**/local-chunk/**');
  const workerReads=async useCache=>page.evaluate(async({m,useCache})=>{
    const c=await import('/cache.js'),db=await c.openCache();let chunks=[];
    if(useCache){for(const part of m.files[0].chunks)chunks.push([part.hash,await c.get(db,'chunks',part.hash)]);}
    else{const tx=db.transaction('chunks','readwrite');for(const part of m.files[0].chunks.slice(0,2))tx.objectStore('chunks').delete(part.hash);await new Promise(r=>tx.oncomplete=r);}
    const w=new Worker('/worker.js');const r=await new Promise((resolve,reject)=>{w.onerror=e=>reject(Error(e.message));w.onmessage=e=>{if(e.data.type==='result')resolve(e.data);};w.postMessage({file:{gh3Local:true,...m.files[0],chunkSize:m.chunkSize},config:{version:m.version,chunks}});});
    if(!useCache&&!r.error)for(let start=Date.now();;){const part=m.files[0].chunks[0],blob=await c.get(db,'chunks',part.hash);if(blob&&await c.digest(await blob.arrayBuffer())===part.hash)break;if(Date.now()-start>10000)throw Error('Runtime did not persist fetched bytes.');await new Promise(r=>setTimeout(r,20));}
    w.terminate();db.close();return r;
  },{m,useCache});
  const networkRead=await workerReads(false);assert.equal(networkRead.error,undefined);assert.equal(networkRead.n,16);assert.equal(networkRead.old,-123);assert.deepEqual(Buffer.from(networkRead.bytes),payload.subarray(2097152-3,2097152+13));
  await page.route('**/local-chunk/**',r=>r.abort());
  const cachedRead=await workerReads(true);assert.equal(cachedRead.error,undefined);assert.deepEqual(cachedRead.bytes,networkRead.bytes);await page.unroute('**/local-chunk/**');
  report.checks.push('Worker adapter: synchronous HTTP reads, cache persistence, offline Blob reads and original-read fallback');
  const corrupted=await page.evaluate(async()=>{
    const c=await import('/cache.js'),m=await (await fetch('/local-manifest.json')).json(),db=await c.openCache();
    await c.put(db,'chunks',m.files[0].chunks[0].hash,new Blob([new Uint8Array(m.chunkSize)]));
    const r=await c.prepare(db,m,['base']);db.close();return r.stats;
  });assert.equal(corrupted.downloaded,2097152);report.checks.push('Corrupt stored bytes repaired instead of mounted');
  await page.route('**/local-chunk/**',route=>route.fulfill({status:200,body:Buffer.alloc(2097152)}));
  const rejection=await page.evaluate(async()=>{
    const c=await import('/cache.js'),m=await (await fetch('/local-manifest.json')).json(),db=await c.openCache();
    const tx=db.transaction('chunks','readwrite');tx.objectStore('chunks').delete(m.files[0].chunks[0].hash);await new Promise(r=>tx.oncomplete=r);
    let error;try{await c.prepare(db,m,['base']);}catch(e){error=e.message;}db.close();return error;
  });assert.match(rejection,/incompleta o modificada/);report.checks.push('Wrong network response fails after bounded retries');
  await page.unroute('**/local-chunk/**');
  const touched=new Date(Date.now()+5000);fs.utimesSync(file,touched,touched);assert.equal((await fetch(base+`/local-chunk/${m.version}/0/0`)).status,409);
  report.checks.push('Changed original source rejected until rebuilding manifest');
  assert.equal(report.pageErrors.length,0);report.ok=true;
}catch(e){report.error=e.stack;report.ok=false;process.exitCode=1;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));fs.writeFileSync(path.join(out,'verification.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
