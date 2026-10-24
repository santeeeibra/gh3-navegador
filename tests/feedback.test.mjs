import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createFeedbackHandler, validateFeedback } from '../tools/analytics/supabase/gh3-feedback/handler.js';
import { buildFeedback } from '../tools/analytics/supabase/gh3-analytics-dashboard/feedback.js';

const base={request_id:'72ed4213-c33e-4e8d-8b27-f0a6a8a9fd03',rating:4,category:'audio',message:'Se corta el sonido',nickname:'Tester',device:'phone',browser:'Safari'};
const request=(body=base, options={})=>new Request('https://test/feedback',{method:'POST',headers:{origin:'https://lasvegasherogame.com'},body:JSON.stringify(body),...options});

test('validates ratings, categories, text lengths and exact metadata whitelist',()=>{
  assert.deepEqual(validateFeedback({...base,service_role:'secret',session_id:'private'}),base);
  for(const patch of [{rating:0},{rating:6},{rating:'4'},{rating:1.5},{category:'bad'},{message:'x'.repeat(2001)},{nickname:'x'.repeat(41)},{message:{}},{request_id:'bad'}]) assert.equal(validateFeedback({...base,...patch}),null);
  assert.equal(validateFeedback({...base,message:'   \u0000hola\n mundo  '}).message,'hola\n mundo');
  assert.equal(validateFeedback({...base,device:'forged',browser:'<script>'}).browser,'Other');
});

test('allows public submission but rejects foreign origins, reads, invalid and oversized requests before storage',async()=>{
  let writes=0;const handler=createFeedbackHandler({store:async()=>{writes++;return 'stored';},bucket:async()=> 'bucket'});
  assert.equal((await handler(request())).status,200);assert.equal(writes,1);
  assert.equal((await handler(request(base,{headers:{origin:'https://evil.test'}}))).status,403);
  assert.equal((await handler(new Request('https://test',{method:'GET',headers:{origin:'https://lasvegasherogame.com'}}))).status,405);
  assert.equal((await handler(request({...base,rating:8}))).status,400);
  assert.equal((await handler(request(base,{body:'bad json'}))).status,400);
  assert.equal((await handler(request(base,{body:'x'.repeat(12001)}))).status,413);
  assert.equal((await handler(request({...base,website:'bot.site'}))).status,200);
  assert.equal(writes,1);
  const preflight=await handler(new Request('https://test',{method:'OPTIONS',headers:{origin:'https://lasvegasherogame.com'}}));assert.equal(preflight.status,204);assert.match(preflight.headers.get('access-control-allow-headers'),/content-type/);
});

test('duplicate is acknowledged, storage failures and rate limit remain visible',async()=>{
  const handler=result=>createFeedbackHandler({store:async()=>{if(result==='fail')throw new Error('private secret');return result;},bucket:async()=> 'bucket'});
  assert.equal((await handler('duplicate')(request())).status,200);
  assert.equal((await handler('limited')(request())).status,429);
  const error=await handler('fail')(request());assert.equal(error.status,503);assert.equal((await error.text()).includes('secret'),false);
  assert.equal((await handler('unexpected')(request())).status,503);
});

test('private report filters period, counts all notes, limits messages and strips identifiers',()=>{
  const now=Date.parse('2026-10-14T18:00:00Z');
  const rows=Array.from({length:105},(_,i)=>({...base,created_at:new Date(now-i*60000).toISOString(),rating:i%5+1,id:'private',rate_bucket:'private',session_id:'private'}));
  rows.push({...base,created_at:'2020-01-01T00:00:00Z'},{...base,created_at:'invalid'},{...base,created_at:'2027-01-01T00:00:00Z'});
  const result=buildFeedback(rows,7,now);assert.equal(result.total,105);assert.equal(result.average,3);assert.equal(result.recent.length,100);assert.equal(result.ratings.reduce((sum,row)=>sum+row.count,0),105);
  assert.doesNotMatch(JSON.stringify(result),/private|rate_bucket|session_id|request_id/);
  assert.equal(buildFeedback([],7,now).average,null);
});

test('staging replaces a hardlinked index without changing source and is idempotent',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'gh3-feedback-'));
  try{
    const source=path.join(root,'source.html'),destination=path.join(root,'demo');await fs.mkdir(destination);await fs.writeFile(source,'<head></head><body>existing</body>');await fs.link(source,path.join(destination,'index.html'));
    for(let i=0;i<2;i++)execFileSync(process.execPath,['tools/analytics/stage-feedback.mjs',destination]);
    assert.equal(await fs.readFile(source,'utf8'),'<head></head><body>existing</body>');
    const html=await fs.readFile(path.join(destination,'index.html'),'utf8');assert.equal((html.match(/src="gh3-feedback.js"/g)||[]).length,1);
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('schema limits access to service role and serializes concurrent rate checks',async()=>{
  const sql=await fs.readFile('tools/analytics/supabase/feedback-schema.sql','utf8');
  assert.match(sql,/enable row level security/);assert.match(sql,/revoke all on public.gh3_feedback from public, anon, authenticated/);
  assert.match(sql,/security invoker/);assert.doesNotMatch(sql,/security definer/i);assert.match(sql,/pg_advisory_xact_lock/);assert.match(sql,/grant execute.*to service_role/);
});
