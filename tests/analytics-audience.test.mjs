import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import {build} from 'esbuild';
import handler,{coarseLocation} from '../tools/analytics/geo-handler.mjs';
import {safeMetadata} from '../tools/analytics/supabase/shared/telemetry.js';
import {audienceQuery} from '../tools/analytics/supabase/shared/audience.js';
import {buildDashboard} from '../tools/analytics/supabase/gh3-analytics-dashboard/aggregate.js';

test('geo returns only coarse decoded location and is never cacheable',()=>{
  const headers={'x-vercel-ip-country':'AR','x-vercel-ip-country-region':'B','x-vercel-ip-city':'Mar%20del%20Plata','x-forwarded-for':'1.2.3.4','x-vercel-ip-latitude':'-38'};
  assert.deepEqual(coarseLocation(headers),{geo_country:'AR',geo_region:'Buenos Aires',geo_city:'Mar del Plata'});
  assert.deepEqual(coarseLocation({}),{});
  assert.equal(coarseLocation({...headers,'x-vercel-ip-city':'%invalid'}).geo_city,'');
  const response={headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=body;}};
  handler({method:'GET',headers},response);
  assert.match(response.headers['Cache-Control'],/no-store/);
  assert.equal(response.headers['Vercel-CDN-Cache-Control'],'no-store');
  assert.doesNotMatch(response.body,/1\.2\.3|latitude|forwarded/);
  handler({method:'POST',headers},response);assert.equal(response.statusCode,405);
});

test('filters retain legacy/invalid marks as unknown and consistently exclude internal events',()=>{
  const now=Date.now(),rows=['santi','codex','claude','automation',undefined,'spoof'].flatMap((tester,i)=>['page_view','game_started','load_error'].map(event_name=>({event_name,session_id:String(i),occurred_at:new Date(now-1000).toISOString(),device:'phone',source:'direct',metadata:{tester}})));
  assert.equal(buildDashboard(rows,7,now,'all').totals.visits,6);
  for(const audience of ['santi','codex','claude','automation'])assert.equal(buildDashboard(rows,7,now,audience).totals.visits,1);
  const internal=buildDashboard(rows,7,now,'internal');assert.equal(internal.totals.visits,4);assert.equal(internal.totals.load_errors,4);
  const unknown=buildDashboard(rows,7,now,'unknown');assert.equal(unknown.totals.visits,2);assert.equal(unknown.daily.at(-1).starts,2);
  assert.throws(()=>buildDashboard(rows,7,now,'invalid'),/invalid_audience/);
  assert.match(audienceQuery(new URLSearchParams(),'unknown').get('or'),/is.null/);
  assert.equal(audienceQuery(new URLSearchParams(),'codex').get('metadata->>tester'),'eq.codex');
  const safe=safeMetadata({tester:'codex',geo_country:'AR',geo_city:'Buenos Aires',ip:'PRIVATE',latitude:-34});
  assert.equal(safe.tester,'codex');assert.equal(safe.geo_city,'Buenos Aires');assert.doesNotMatch(JSON.stringify(safe),/PRIVATE|latitude/);
  assert.equal(safeMetadata({geo_country:'invalid',geo_city:'invented',tester:'invalid'}).geo_city,undefined);
});

function client({url='https://game.example/gh3/',stored='',automated=false,failGeo=false,blocked=false,hangGeo=false}={}){
  const storage=new Map(stored?[['gh3-test-profile',stored]]:[]),session=new Map(),requests=[],beacons=[],timers=new Map();let seq=0;
  const store={getItem:k=>storage.get(k),setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.set(k,v);},removeItem:k=>storage.delete(k)};
  const context={crypto:webcrypto,URL,Date,JSON,Math,Promise,TextEncoder,AbortController,location:{href:url},history:{replaceState(){}},localStorage:store,sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v),removeItem:k=>session.delete(k)},navigator:{webdriver:automated,maxTouchPoints:0,userAgent:'Chrome/130',sendBeacon:(u,body)=>beacons.push(JSON.parse(body))},document:{referrer:'',querySelector:()=>null},screen:{width:1440,height:900},matchMedia:()=>({matches:false}),addEventListener(){},
    setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval:()=>{},
    fetch:async(url,options)=>{if(url==='/api/gh3-location'){if(failGeo)throw Error('offline');return {ok:true,json:()=>hangGeo?new Promise(()=>{}):Promise.resolve({geo_country:'AR',geo_region:'B',geo_city:'La Plata'})};}requests.push(JSON.parse(options.body));return {ok:true};}};
  context.window=context;
  vm.runInNewContext(fs.readFileSync('tools/analytics/gh3-visit-context.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('tools/analytics/gh3-analytics.js','utf8'),context);
  return {context,storage,requests,timers};
}

test('explicit profiles persist, unmarked automation never inherits manual Santi, clear works',async()=>{
  for(const actor of ['santi','codex','claude']){
    const c=client({url:`https://game.example/gh3/?prueba=${actor}`,automated:actor!=='santi'});
    await c.context.gh3VisitContext.ready;await Promise.resolve();
    assert.equal(c.requests[0].metadata.tester,actor);assert.equal(c.requests[0].metadata.geo_city,'La Plata');
    assert.equal(c.storage.get('gh3-test-profile'),actor);
  }
  assert.equal(client({stored:'santi'}).context.gh3VisitContext.data.tester,'santi');
  assert.equal(client({stored:'santi',automated:true}).context.gh3VisitContext.data.tester,'automation');
  assert.equal(client({stored:'codex',automated:true}).context.gh3VisitContext.data.tester,'codex');
  const cleared=client({stored:'santi',url:'https://game.example/gh3/?prueba=ninguna'});
  assert.equal(cleared.context.gh3VisitContext.data.tester,'unknown');assert.equal(cleared.storage.size,0);
  assert.equal(client({stored:'codex',url:'https://game.example/gh3/?prueba=invalid'}).context.gh3VisitContext.data.tester,'codex');
});

test('geo failure and blocked storage still send events; queued attempts remain distinct and bounded',async()=>{
  const c=client({url:'https://game.example/gh3/?prueba=claude',blocked:true,failGeo:true});
  c.context.gh3Analytics.track('play_clicked');c.context.gh3Analytics.track('play_clicked');
  await c.context.gh3VisitContext.ready;await Promise.resolve();
  assert.equal(c.requests.length,3);assert.equal(c.requests[0].metadata.tester,'claude');
  assert.equal(c.requests[0].metadata.geo_country,undefined);
  assert.equal(new Set(c.requests.map(r=>r.metadata.attempt_id)).size,3);
  const good=client();await good.context.gh3VisitContext.ready;await Promise.resolve();
  await good.context.gh3Analytics.track('runtime_error',{message:'😀'.repeat(800),cause:'😀'.repeat(800)});
  assert.ok(Buffer.byteLength(JSON.stringify(good.requests.at(-1).metadata))<=1400);
});

test('geo fetch including body is time bounded, telemetry continues after timeout',async()=>{
  // A hanging response body must not hold the analytics queue indefinitely.
  const c=client({hangGeo:true});
  for(const {fn} of [...c.timers.values()])fn();
  await c.context.gh3VisitContext.ready;await Promise.resolve();
  assert.ok(c.requests.length>=1);
});

test('backend validates audience before reads and applies history filter before pagination',async()=>{
  const compiled=await build({entryPoints:['tools/analytics/supabase/gh3-analytics-dashboard/index.ts'],bundle:true,write:false,format:'iife',platform:'neutral'});
  let fn;const calls=[],token='unit-audience-password-xxxxxxxxxxxxxxxxxxxxxxxx';
  const env={SUPABASE_URL:'https://store.example',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_TEST',GH3_ANALYTICS_ADMIN_TOKEN_SHA256:createHash('sha256').update(token).digest('hex')};
  vm.runInNewContext(compiled.outputFiles[0].text,{Deno:{serve:f=>fn=f,env:{get:k=>env[k]}},crypto:webcrypto,TextEncoder,URL,URLSearchParams,Request,Response,Date,Map,Set,console,fetch:async url=>{calls.push(url);return Response.json([]);}});
  const req=query=>new Request('https://api.example/?'+query,{headers:{origin:'https://lasvegasherogame.com',authorization:'Bearer '+token}});
  assert.equal((await fn(req('audience=bad'))).status,400);assert.equal(calls.length,0);
  assert.equal((await fn(req('view=activity&date=2026-10-15&audience=bad'))).status,400);assert.equal(calls.length,0);
  assert.equal((await fn(req('view=activity&date=2026-10-15&audience=codex&offset=200'))).status,200);
  const query=new URL(calls.at(-1)).searchParams;assert.equal(query.get('metadata->>tester'),'eq.codex');assert.equal(query.get('offset'),'200');
  assert.equal((await fn(req('view=activity&date=2026-10-15&audience=unknown'))).status,200);
  assert.match(new URL(calls.at(-1)).searchParams.get('or'),/is.null/);
});
