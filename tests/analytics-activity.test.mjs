import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {build} from 'esbuild';
import {dayBounds,localDay,buildActivity,safeMetadata,safeText,safeResource} from '../tools/analytics/supabase/gh3-analytics-dashboard/activity.js';

test('daily history uses Argentina midnight and preserves legacy errors without inventing causes',()=>{
  assert.equal(localDay('2026-10-15T02:59:59Z'),'2026-10-14');
  assert.deepEqual(dayBounds('2026-10-15'),{start:'2026-10-15T03:00:00.000Z',end:'2026-10-16T03:00:00.000Z'});
  for(const date of ['2026-02-30','2026-13-01','2026-10-15&token=bad'])assert.throws(()=>dayBounds(date));
  const row={occurred_at:'2026-10-15T03:10:00Z',event_name:'load_error',session_id:'private-session',device:'phone',metadata:{phase:'preparing'}};
  const result=buildActivity([row],{day:'2026-10-15',aliases:new Map([[row,'Registro anónimo']])});
  assert.deepEqual(result.events[0].metadata,{phase:'preparing'});
  assert.equal(result.events[0].detail_available,false);
  assert.equal(result.events[0].correlation,'visit');
  assert.doesNotMatch(JSON.stringify(result),/private-session|session_id/);
});

test('allowlisted metadata strips credentials, local paths, addresses and resource queries',()=>{
  const text='Authorization: Bearer SECRET_VALUE token=PRIVATE https://host/gh3/gh3-web.wasm?key=hidden#secret C:\\Users\\Santi\\private user@example.com 192.168.1.1';
  const cleaned=safeText(text);
  assert.doesNotMatch(cleaned,/SECRET_VALUE|PRIVATE|hidden|#secret|Users|example.com|192.168/);
  assert.equal(safeResource('gh3-web.wasm?token=PRIVATE#fragment'),'/gh3-web.wasm');
  assert.equal(safeText('gh3-web.wasm?signed=PRIVATE#fragment'),'gh3-web.wasm');
  assert.equal(safeResource('file:///C:/Users/private.wasm'),'');
  const out=safeMetadata({message:text,stack:'PRIVATE STACK',session_id:'private',attempt_id:'private',status:503,cores:2,memory_gb:null,fps:NaN,resource:'/gh3/chunks/'+('a'.repeat(64))+'?token=private'});
  assert.equal(out.status,503);assert.equal(out.cores,2);
  assert.equal(out.memory_gb,undefined);assert.equal(out.fps,undefined);
  assert.doesNotMatch(JSON.stringify(out),/PRIVATE|STACK|session_id|attempt_id|token=private/);
});

function client(){
  let now=100000,seq=0;const timers=new Map(),listeners={},requests=[],beacons=[];
  class Clock extends Date{static now(){return now;}}
  const context={crypto:webcrypto,URL,TextEncoder,Date:Clock,JSON,Math,Promise,
    location:{href:'https://lasvegasherogame.com/gh3/'},
    document:{referrer:'',visibilityState:'visible',querySelector:()=>({content:'test-build'}),addEventListener:(event,fn)=>listeners[event]=fn},
    navigator:{maxTouchPoints:1,userAgent:'Version/18 Safari/605',hardwareConcurrency:2,sendBeacon:(url,body)=>beacons.push(JSON.parse(body))},
    screen:{width:390,height:844},matchMedia:()=>({matches:true}),sessionStorage:{getItem:()=>null,setItem:()=>{}},
    fetch:(_url,options)=>{requests.push(JSON.parse(options.body));return Promise.resolve({ok:true});},
    setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval:()=>{},
    addEventListener:(event,fn)=>listeners[event]=fn,
  };context.window=context;
  vm.runInNewContext(fs.readFileSync('tools/analytics/gh3-analytics.js','utf8'),context);
  return {context,requests,timers,listeners,beacons,advance:ms=>{now+=ms;const pending=[...timers];timers.clear();for(const [,timer]of pending)timer.fn();}};
}

test('samples run only every60s in an advancing visible song, audio is interval delta, stop on menu and close',()=>{
  const c=client();assert.equal(c.timers.size,0);
  c.context.gh3Diag={stage:'cancion',speed:{juegoPct:44,relojPct:45,imgS:22},audio:{underruns:15,skips:2}};
  let songClock=100;c.context.gh3Song={clock:()=>songClock};
  c.listeners.gh3stage({detail:{stage:'songPlaying',song:'slowride'}});
  assert.equal([...c.timers.values()][0].ms,60000);
  c.context.gh3Diag.audio.underruns=18;songClock=13500;c.advance(60000);
  let sample=c.requests.at(-1);assert.equal(sample.event,'performance_sample');
  assert.equal(sample.metadata.audio_underruns_delta,3);assert.equal(sample.metadata.interval_seconds,60);
  assert.equal(sample.metadata.game_pct,44);assert.equal(sample.metadata.fps,22);
  assert.equal(sample.metadata.memory_gb,undefined);assert.equal(sample.metadata.cores,2);
  const count=c.requests.length;c.advance(60000);assert.equal(c.requests.length,count,'paused clock is not sampled');
  c.context.document.visibilityState='hidden';c.listeners.visibilitychange();assert.equal(c.timers.size,0);
  c.context.document.visibilityState='visible';c.listeners.visibilitychange();assert.equal(c.timers.size,1);
  c.listeners.gh3stage({detail:{stage:'preview'}});assert.equal(c.timers.size,0);
  c.listeners.gh3stage({detail:{stage:'songPlaying',song:'slowride'}});c.listeners.pagehide();assert.equal(c.timers.size,0);
});

test('attempts rotate on Play, errors redact and deduplicate, cancellation is separate, metadata is byte bounded',()=>{
  const c=client(),api=c.context.gh3Analytics;
  const initial=c.requests[0].metadata.attempt_id;
  api.track('play_clicked');const attempt=c.requests.at(-1).metadata.attempt_id;assert.notEqual(attempt,initial);
  const error={name:'TypeError',message:'Authorization: Bearer TOP_SECRET',cause:{message:'C:\\Users\\Santi\\private'}};
  api.error('preparing',error,{resource:'https://host/gh3/manifest.json?token=PRIVATE',status:503});
  let last=c.requests.at(-1);assert.equal(last.metadata.attempt_id,attempt);assert.equal(last.metadata.status,503);
  assert.doesNotMatch(JSON.stringify(last),/TOP_SECRET|token=PRIVATE|Users/);
  const count=c.requests.length;api.error('preparing',error);assert.equal(c.requests.length,count);
  api.error('preparing',{name:'AbortError',message:'Pausado'});assert.equal(c.requests.at(-1).event,'load_cancelled');
  api.track('load_error',{message:'😀'.repeat(800),cause:'😀'.repeat(800),song:'😀'.repeat(40)});
  assert.ok(Buffer.byteLength(JSON.stringify(c.requests.at(-1).metadata))<=1400);
  api.workerMessage({type:'diag',what:'fetch-error',error:'falló',url:'/gh3/gh3-web.wasm?token=PRIVATE',status:404});
  assert.equal(c.requests.at(-1).event,'runtime_error');assert.equal(c.requests.at(-1).metadata.resource,'/gh3/gh3-web.wasm');
});

async function edge(file,fetchImpl){
  const compiled=await build({entryPoints:[file],bundle:true,write:false,format:'iife',platform:'neutral',target:'es2022'});
  let handler;
  const token='unit-test-token-only-not-a-real-password-123';
  const env={SUPABASE_URL:'https://store.example',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_UNIT_TEST_ONLY',GH3_ANALYTICS_ADMIN_TOKEN_SHA256:createHash('sha256').update(token).digest('hex')};
  vm.runInNewContext(compiled.outputFiles[0].text,{Deno:{serve:fn=>handler=fn,env:{get:key=>env[key]}},crypto:webcrypto,TextEncoder,URL,URLSearchParams,Request,Response,Date,Map,Set,console,fetch:fetchImpl});
  return {handler,token};
}

test('private activity endpoint gates auth, validates date, fixes snapshot, filters and paginates without raw identifiers',async()=>{
  const calls=[];
  const records=Array.from({length:201},(_,i)=>({occurred_at:'2026-10-15T12:00:00Z',event_name:'load_error',session_id:'PRIVATE_UUID',device:'phone',metadata:{attempt_id:'PRIVATE_ATTEMPT',phase:'preparing',message:'Authorization: Bearer SECRET'}}));
  const {handler,token}=await edge('tools/analytics/supabase/gh3-analytics-dashboard/index.ts',async(url,options)=>{calls.push({url,options});return Response.json(records);});
  const request=(query='',authorized=true)=>new Request('https://api.example/dashboard?view=activity&'+query,{headers:{origin:'https://lasvegasherogame.com',...(authorized?{authorization:'Bearer '+token}:{})}});
  assert.equal((await handler(request('date=2026-10-15',false))).status,401);assert.equal(calls.length,0);
  assert.equal((await handler(request('date=2026-02-30'))).status,400);
  const response=await handler(request('date=2026-10-15&type=load_error&until=2026-10-15T15%3A00%3A00.000Z'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const body=await response.json();assert.equal(body.activity.events.length,200);assert.equal(body.activity.next_offset,200);
  assert.doesNotMatch(JSON.stringify(body),/PRIVATE_UUID|PRIVATE_ATTEMPT|session_id|SECRET/);
  assert.equal(new Set(body.activity.events.map(row=>row.attempt)).size,1);
  const query=new URL(calls.at(-1).url).searchParams;assert.equal(query.get('event_name'),'eq.load_error');
  assert.match(query.get('and'),/occurred_at.lt.2026-10-15T15:00:00.000Z/);
  const second=await handler(request('date=2026-10-15&type=load_error&offset=200&until='+encodeURIComponent(body.activity.until)));
  assert.equal((await second.json()).activity.events[0].attempt,body.activity.events[0].attempt);
});

test('ingestion preserves origin/UUID/rate controls and stores only bounded sanitized new metadata',async()=>{
  const inserts=[];
  const {handler}=await edge('tools/analytics/supabase/gh3-analytics/index.ts',async(url,options)=>{
    if(options?.method==='POST'){inserts.push(JSON.parse(options.body));return new Response(null,{status:201});}
    return Response.json([]);
  });
  const data={event:'performance_sample',session_id:webcrypto.randomUUID(),source:'direct',device:'phone',metadata:{attempt_id:webcrypto.randomUUID(),game_pct:44,cores:2,message:'Authorization: Bearer SECRET',stack:'PRIVATE',cause:'😀'.repeat(800)}};
  const request=(origin='https://lasvegasherogame.com',body=data)=>new Request('https://api.example/ingest',{method:'POST',headers:{origin},body:JSON.stringify(body)});
  assert.equal((await handler(request('https://bad.example'))).status,403);assert.equal(inserts.length,0);
  assert.equal((await handler(request(undefined,{...data,session_id:'bad'}))).status,400);
  assert.equal((await handler(request(undefined,null))).status,400);
  assert.equal((await handler(request(undefined,[]))).status,400);
  assert.equal((await handler(request())).status,204);
  assert.equal(inserts[0].event_name,'performance_sample');assert.equal(inserts[0].metadata.game_pct,44);
  assert.doesNotMatch(JSON.stringify(inserts[0].metadata),/SECRET|PRIVATE|stack/);
  assert.ok(Buffer.byteLength(JSON.stringify(inserts[0].metadata))<=1400);
  const limited=await edge('tools/analytics/supabase/gh3-analytics/index.ts',async()=>Response.json(Array.from({length:20},(_,id)=>({id}))));
  assert.equal((await limited.handler(request())).status,429);
});

test('the same error is reported once per visit and at most 20 errors per visit',()=>{
  const c=client(),before=c.requests.length;
  for(let i=0;i<5;i++){c.context.gh3Analytics.error('page',{name:'TypeError',message:'igual'},{runtime:true});c.advance(6000);}
  assert.equal(c.requests.filter(r=>r.event==='runtime_error').length,1);
  for(let i=0;i<40;i++){c.context.gh3Analytics.error('page',{name:'TypeError',message:'distinto '+i},{runtime:true});c.advance(5000);}
  assert.equal(c.requests.slice(before).filter(r=>r.event==='runtime_error').length,20);
});
