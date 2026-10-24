import { buildDashboard, buildLive, fromSummary } from './aggregate.js';
import { buildFeedback } from './feedback.js';
import { coverage, MAX_PAGES, PAGE_SIZE } from './coverage.js';
import { buildActivity, dayBounds, localDay, EVENTS } from './activity.js';
import {audienceOf,audienceQuery} from '../shared/audience.js';

const allowedOrigins = new Set([
  'https://lasvegasherogame.com',
  'https://gh3-privado-sante11.vercel.app',
  'http://127.0.0.1:5460',
  'http://localhost:5460',
]);
const fallbackTokenHash = 'cb0f100b87625a3f3639c64463bfc2b9591281c823a55c656cf585b890022c2e';

function cors(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'authorization',
    vary: 'Origin',
  };
}

function json(status: number, origin: string, body: unknown) {
  return Response.json(body, {
    status,
    headers: { ...cors(origin), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function authorized(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length < 32 || token.length > 256) return false;
  const expected = (Deno.env.get('GH3_ANALYTICS_ADMIN_TOKEN_SHA256') || fallbackTokenHash).toLowerCase();
  return (await sha256(token)) === expected;
}

function serviceKey() {
  try {
    const modern = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (modern.default) return String(modern.default);
  } catch { /* legacy fallback below */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

async function readRows(days: number, feedback = false) {
  const base = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceKey();
  if (!base || !key) throw new Error('missing_configuration');
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const url = feedback
    ? `${base}/rest/v1/gh3_feedback?select=created_at,rating,category,message,nickname,device,browser&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc`
    : `${base}/rest/v1/gh3_analytics_events?select=occurred_at,event_name,session_id,source,device,metadata&occurred_at=gte.${encodeURIComponent(since)}&event_name=neq.heartbeat&order=occurred_at.desc`;
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  const rows: unknown[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const response = await fetch(url, { headers: { ...headers, range: `${from}-${from + PAGE_SIZE - 1}` } });
    if (!response.ok) throw new Error(`store_${response.status}`);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('store_shape');
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows, truncated: false };
  }
  // Más filas que el tope: se devuelven las más recientes (el orden es descendente) en vez de fallar.
  return { rows, truncated: true };
}

// Claude 2026-10-22: resúmenes calculados en la base (supabase/dashboard-summary.sql). Si todavía no se aplicó el SQL,
// la llamada falla y el panel sigue con la lectura de eventos crudos de antes.
async function rpc(name: string, args: Record<string, unknown>) {
  const base = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceKey();
  if (!base || !key) throw new Error('missing_configuration');
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' };
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!response.ok) throw new Error(`rpc_${response.status}`);
  return await response.json();
}

async function readLive(seconds = 90) {
  const base = Deno.env.get('SUPABASE_URL') || '';
  const key = serviceKey();
  if (!base || !key) throw new Error('missing_configuration');
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`;
  // Claude 2026-10-22: los latidos se guardan en gh3_live_sessions (una fila por visita), no como eventos.
  const url = `${base}/rest/v1/gh3_live_sessions?select=session_id,seen_at,stage,tester&seen_at=gte.${encodeURIComponent(since)}`;
  const response = await fetch(url, { headers: { ...headers, range: '0-9999' } });
  if (!response.ok) throw new Error(`store_${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('store_shape');
  return rows.map(row => ({ occurred_at: row.seen_at, session_id: row.session_id, metadata: { stage: row.stage, tester: row.tester } }));
}

async function activity(req: Request) {
  const params=new URL(req.url).searchParams;
  const day=params.get('date')||localDay();
  const bounds=dayBounds(day);
  const until=params.get('until')||new Date().toISOString();
  if(!Number.isFinite(Date.parse(until))||until!==new Date(until).toISOString())throw new Error('invalid_until');
  const end=until<bounds.end?until:bounds.end;
  const type=params.get('type')||'all';
  if(type!=='all'&&!EVENTS.includes(type))throw new Error('invalid_type');
  const offset=Number(params.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new Error('invalid_offset');
  const base=Deno.env.get('SUPABASE_URL')||'',key=serviceKey();
  if(!base||!key)throw new Error('missing_configuration');
  const query=new URLSearchParams({select:'occurred_at,event_name,session_id,device,metadata',
    and:`(occurred_at.gte.${bounds.start},occurred_at.lt.${end})`,
    order:'occurred_at.desc,id.desc',limit:'201',offset:String(offset)});
  if(type!=='all')query.set('event_name',`eq.${type}`);
  audienceQuery(query,audienceOf(params.get('audience')||'all'));
  const headers:Record<string,string>={apikey:key};if(!key.startsWith('sb_secret_'))headers.authorization=`Bearer ${key}`;
  const response=await fetch(`${base}/rest/v1/gh3_analytics_events?${query}`,{headers});
  if(!response.ok)throw new Error(`store_${response.status}`);
  const batch=await response.json();if(!Array.isArray(batch))throw new Error('store_shape');
  const rows=batch.slice(0,200),aliases=new Map(),visits=new Map();
  // Keyed digest prevents returning or guessing raw anonymous identifiers.
  const hmac=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  await Promise.all(rows.map(async row=>{
    const bytes=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(`${day}:${row.session_id}:${row.metadata?.attempt_id||'visit'}`));
    const alias=[...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,12);
    aliases.set(row,`Registro ${alias}`);
    // Visit alias groups every attempt of the same browser tab into one timeline.
    const visitBytes=await crypto.subtle.sign('HMAC',hmac,new TextEncoder().encode(`${day}:${row.session_id}:visit-group`));
    visits.set(row,[...new Uint8Array(visitBytes)].map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,12));
  }));
  return {...buildActivity(rows,{day,offset,hasMore:batch.length>200,aliases,visits}),until};
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  if (!allowedOrigins.has(origin)) return json(403, 'null', { error: 'origin' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== 'GET') return json(405, origin, { error: 'method' });
  if (!(await authorized(req))) return json(401, origin, { error: 'unauthorized' });
  if(new URL(req.url).searchParams.get('view')==='activity'){
    try{return json(200,origin,{activity:await activity(req)});}
    catch(error){const code=error instanceof Error?error.message:'';return json(code.startsWith('invalid_')?400:503,origin,{error:code.startsWith('invalid_')?code:'unavailable'});}
  }
  const requested = Number(new URL(req.url).searchParams.get('days') || 30);
  const days = [7, 30, 90].includes(requested) ? requested : 30;
  let audience;
  try{audience=audienceOf(new URL(req.url).searchParams.get('audience')||'all');}
  catch{return json(400,origin,{error:'invalid_audience'});}
  try {
    const optional = (promise: Promise<unknown>) => promise.catch(error => { console.error('gh3 dashboard rpc', error instanceof Error ? error.message : 'unknown'); return null; });
    const [summary, weekly, lastHour, feedbackRead, liveRows] = await Promise.all([
      optional(rpc('gh3_dashboard_summary', { p_days: days, p_audience: audience })),
      optional(rpc('gh3_dashboard_weekly', { p_weeks: 12, p_audience: audience })),
      optional(rpc('gh3_dashboard_last_hour', { p_audience: audience })),
      readRows(days, true), optional(readLive())]);
    const live = { ...buildLive((liveRows as unknown[]) || [], Date.now(), audience), last_hour: lastHour };
    const extra = { live, weekly, feedback: buildFeedback(feedbackRead.rows, days) };
    if (summary) return json(200, origin, { ...fromSummary(summary, days, Date.now(), audience), ...coverage([], days, false), source: 'summary', ...extra });
    const events = await readRows(days);
    return json(200, origin, { ...buildDashboard(events.rows, days, Date.now(), audience), ...coverage(events.rows, days, events.truncated), source: 'events', ...extra });
  } catch (error) {
    console.error('gh3 analytics dashboard failed', error instanceof Error ? error.message : 'unknown');
    return json(503, origin, { error: 'unavailable' });
  }
});
