import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const root='artifacts/monitor-diario/demo';
const source=fs.readFileSync(`${root}/r5snap-loader-ui.js`,'utf8');
const section=(start,end)=>{
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0&&b>a,`No se encontró la sección generada: ${start}`);
  return source.slice(a,b);
};

test('staged loader reports actual HTTP failures and network resource after its existing three retries',async()=>{
  const chunk=section('async function loadChunk','async function prepare');
  const url='/gh3/chunks/'+('a'.repeat(64));
  let calls=0;
  const context={Blob,DOMException,get:async()=>null,chunkURL:()=>url,fetch:async()=>{calls++;return {ok:false,status:503};}};
  vm.runInNewContext(chunk,context);
  const manifest={delivery:{sharedCache:false}},file={chunks:[{hash:'a'.repeat(64),size:4}]};
  await assert.rejects(context.loadChunk({},manifest,file,0,{cached:0,downloaded:0}),error=>error.status===503&&error.resource===url);
  assert.equal(calls,3);
  context.fetch=async()=>{throw new TypeError('Failed to fetch');};
  await assert.rejects(context.loadChunk({},manifest,file,0,{cached:0,downloaded:0}),error=>error.resource===url&&error.status===undefined);
});

test('staged loader passes original error details and native worker messages to telemetry without running engine',()=>{
  const errors=[],messages=[],status={textContent:''};
  const context={state:{phase:'preparing'},window:{gh3Analytics:{error:(...args)=>errors.push(args),workerMessage:message=>messages.push(message),once:()=>{}}},document:{body:{classList:{toggle:()=>{}}}},$:()=>status,loading:{message:()=>{},fail:()=>{}}};
  vm.runInNewContext(section('function fail','async function loadManifest'),context);
  const error=Object.assign(new TypeError('No se pudo cargar una parte.'),{status:503,resource:'/gh3/chunks/example'});
  context.fail(error);assert.equal(errors[0][0],'preparing');assert.equal(errors[0][1],error);
  class WorkerMock{constructor(){this.listeners={};}addEventListener(name,callback){this.listeners[name]=callback;}}
  context.window.Worker=WorkerMock;
  vm.runInNewContext(section('var W=window.Worker','state.file=').replace(/,\s*$/,';'),context);
  const worker=new context.window.Worker('/gh3/gh3-web.js');
  const diagnostic={type:'diag',what:'fetch-error',error:'Failed to fetch',url:'/gh3/gh3-web.wasm'};
  worker.listeners.message({data:diagnostic});assert.equal(messages[0],diagnostic);
  worker.listeners.error({message:'worker failed',filename:'/gh3/gh3-web.js'});
  assert.equal(errors.at(-1)[0],'worker');assert.equal(errors.at(-1)[2].resource,'/gh3/gh3-web.js');
});

test('staged version is embedded and engine/data manifest are unchanged from the approved source',()=>{
  const result=JSON.parse(fs.readFileSync('artifacts/monitor-diario/stage-result.json','utf8'));
  assert.match(fs.readFileSync(`${root}/index.html`,'utf8'),new RegExp(`name="gh3-build" content="${result.version}"`));
  for(const [file,expected]of Object.entries(result.engine_sha256)){
    const actual=createHash('sha256').update(fs.readFileSync(`${root}/${file}`)).digest('hex');
    assert.equal(actual,expected,file);
    assert.equal(actual,createHash('sha256').update(fs.readFileSync(`${result.source}/${file}`)).digest('hex'),file);
  }
});
