// Claude 2026-10-24: avisos push del panel de estadísticas (comentarios, calificaciones, rendimiento, crecimiento).
import webpush from 'npm:web-push@3.6.7';

const allowedOrigins = new Set([
  'https://lasvegasherogame.com',
  'http://127.0.0.1:5460',
  'http://localhost:5460',
]);
const fallbackTokenHash = 'cb0f100b87625a3f3639c64463bfc2b9591281c823a55c656cf585b890022c2e';
const TESTERS = ['santi', 'codex', 'claude', 'automation'];
const PANEL_URL = '/estadisticas/';

function cors(origin: string) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    vary: 'Origin',
  };
}
function json(status: number, origin: string, body: unknown) {
  return Response.json(body, { status, headers: { ...cors(origin), 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
async function sha256(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function authorized(req: Request) {
  const header = req.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token.length < 32 || token.length > 256) return false;
  const expected = (Deno.env.get('GH3_ANALYTICS_ADMIN_TOKEN_SHA256') || fallbackTokenHash).toLowerCase();
  return (await sha256(token)) === expected;
}
async function cronAllowed(req: Request) {
  const expected = Deno.env.get('PUSH_CRON_KEY') || '';
  const got = req.headers.get('x-cron-key') || '';
  if (expected.length < 24) return false;
  return (await sha256(got)) === (await sha256(expected));
}
function serviceKey() {
  try {
    const modern = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
    if (modern.default) return String(modern.default);
  } catch { /* legacy fallback below */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
}

const base = Deno.env.get('SUPABASE_URL') || '';
function dbHeaders(extra: Record<string, string> = {}) {
  const key = serviceKey();
  return { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extra };
}
async function dbGet(path: string) {
  const r = await fetch(`${base}/rest/v1/${path}`, { headers: dbHeaders() });
  if (!r.ok) throw new Error(`db_${r.status}`);
  return await r.json();
}
async function dbUpsert(table: string, row: unknown, conflict: string) {
  const r = await fetch(`${base}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST', headers: dbHeaders({ prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error(`db_${r.status}`);
}
async function dbDelete(path: string) {
  await fetch(`${base}/rest/v1/${path}`, { method: 'DELETE', headers: dbHeaders() });
}
async function rpc(name: string, args: Record<string, unknown>) {
  const r = await fetch(`${base}/rest/v1/rpc/${name}`, { method: 'POST', headers: dbHeaders(), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`rpc_${r.status}`);
  return await r.json();
}
async function getState(key: string) {
  const rows = await dbGet(`gh3_push_state?select=value&key=eq.${encodeURIComponent(key)}`);
  return rows[0]?.value ?? null;
}
const setState = (key: string, value: unknown) => dbUpsert('gh3_push_state', { key, value, updated_at: new Date().toISOString() }, 'key');

let configured = false;
function configure() {
  if (configured) return;
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'https://lasvegasherogame.com', Deno.env.get('VAPID_PUBLIC_KEY') || '', Deno.env.get('VAPID_PRIVATE_KEY') || '');
  configured = true;
}

type Sub = { endpoint: string; p256dh: string; auth: string; prefs: Record<string, boolean> };
async function notify(kind: 'feedback' | 'alerts' | 'digest' | 'test', payload: { title: string; body: string; tag?: string }) {
  configure();
  const subs: Sub[] = await dbGet('gh3_push_subs?select=endpoint,p256dh,auth,prefs');
  const data = JSON.stringify({ ...payload, url: PANEL_URL });
  let sent = 0;
  await Promise.all(subs.filter(s => kind === 'test' || s.prefs?.[kind] !== false).map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, { TTL: 86400, urgency: 'normal' });
      sent++;
    } catch (error) {
      const code = (error as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await dbDelete(`gh3_push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`);
      else console.error('gh3 push', code || 'error');
    }
  }));
  return sent;
}

const CATEGORY: Record<string, string> = { general: 'General', performance: 'Rendimiento', audio: 'Audio', controls: 'Controles', loading: 'Carga', graphics: 'Gráficos', suggestion: 'Sugerencia', other: 'Otro' };
const clip = (text: string, n: number) => text.length > n ? text.slice(0, n - 1) + '…' : text;
const pct = (a: number, b: number) => b ? `${a >= b ? '+' : ''}${Math.round((a - b) / b * 100)} %` : 'sin base';

// Hora y día de Argentina (UTC-3, sin horario de verano).
function argentina(now = new Date()) {
  const ar = new Date(now.getTime() - 3 * 3_600_000);
  return { hour: ar.getUTCHours(), day: ar.toISOString().slice(0, 10), weekday: ar.getUTCDay(), date: ar };
}

async function checkFeedback() {
  const now = new Date().toISOString();
  const cursor = await getState('feedback_cursor');
  if (!cursor?.at) { await setState('feedback_cursor', { at: now }); return 0; }
  const rows = await dbGet(`gh3_feedback?select=created_at,rating,category,message,nickname,device&created_at=gt.${encodeURIComponent(cursor.at)}&order=created_at.asc&limit=20`);
  if (!rows.length) return 0;
  let sent = 0;
  const show = rows.slice(0, 3);
  for (const row of show) {
    const stars = `${row.rating}/5`;
    const who = row.nickname ? ` · ${row.nickname}` : '';
    const text = row.message ? clip(row.message, 140) : 'Sin comentario escrito.';
    sent += await notify('feedback', { title: `${row.message ? 'Nuevo comentario' : 'Nueva calificación'} ${stars}${who}`, body: `${CATEGORY[row.category] || row.category} · ${row.device}. ${text}`, tag: `fb-${row.created_at}` });
  }
  if (rows.length > show.length) sent += await notify('feedback', { title: `${rows.length - show.length} opiniones más`, body: 'Abrí el panel para verlas.', tag: 'fb-more' });
  await setState('feedback_cursor', { at: rows[rows.length - 1].created_at });
  return sent;
}

async function checkAlerts() {
  let sent = 0;
  const nowMs = Date.now();
  // Rendimiento: errores en la última hora (excluye pruebas marcadas), con pausa de 6 h.
  const hour = await rpc('gh3_dashboard_last_hour', { p_audience: 'unknown' }).catch(() => null);
  const lastErr = await getState('alert_errors');
  if (hour && hour.errors >= 5 && hour.errors >= 0.25 * Math.max(1, hour.sessions) && (!lastErr || nowMs - Date.parse(lastErr.at) > 6 * 3_600_000)) {
    sent += await notify('alerts', { title: 'Subieron los errores', body: `${hour.errors} errores en la última hora (${hour.sessions} visitas, ${hour.game_started} arrancaron el juego).`, tag: 'alert-errors' });
    await setState('alert_errors', { at: new Date().toISOString() });
  }
  // Crecimiento en vivo: récord de jugadores conectados ahora.
  const since = new Date(nowMs - 60_000).toISOString();
  const live = await dbGet(`gh3_live_sessions?select=session_id,tester&seen_at=gte.${encodeURIComponent(since)}`).catch(() => []);
  const online = live.filter((r: { tester?: string }) => !TESTERS.includes(String(r.tester || ''))).length;
  const record = (await getState('live_record')) || { n: 0, at: '1970-01-01T00:00:00Z' };
  if (online >= 3 && online > record.n && nowMs - Date.parse(record.at) > 3_600_000) {
    sent += await notify('alerts', { title: `Récord: ${online} jugadores conectados`, body: record.n ? `El anterior era ${record.n}.` : 'Primer pico registrado.', tag: 'alert-live' });
    await setState('live_record', { n: online, at: new Date().toISOString() });
  } else if (online > record.n) {
    await setState('live_record', { n: online, at: record.at });
  }
  return sent;
}

async function checkDigest() {
  const ar = argentina();
  if (ar.hour < 9) return 0;
  const done = await getState('digest_day');
  if (done?.day === ar.day) return 0;
  await setState('digest_day', { day: ar.day });
  const summary = await rpc('gh3_dashboard_summary', { p_days: 15, p_audience: 'unknown' });
  const byDate = new Map<string, { visits: number; starts: number; errors: number }>((summary.daily || []).map((d: { date: string }) => [String(d.date).slice(0, 10), d as never]));
  const shift = (days: number) => new Date(ar.date.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  const y = byDate.get(shift(1)), p = byDate.get(shift(2)), w = byDate.get(shift(8));
  if (!y) return 0;
  const lines = [`Ayer: ${y.visits} visitas (${pct(y.visits, p?.visits ?? 0)} vs anteayer), ${y.starts} jugaron, ${y.errors} errores de carga.`];
  if (w) lines.push(`Contra el mismo día de la semana pasada: ${pct(y.visits, w.visits)}.`);
  if (ar.weekday === 1) {
    const weekly = await rpc('gh3_dashboard_weekly', { p_weeks: 3, p_audience: 'unknown' }).catch(() => null);
    if (Array.isArray(weekly) && weekly.length >= 3) {
      const last = weekly[weekly.length - 2], prev = weekly[weekly.length - 3];
      lines.push(`Semana pasada: ${last.visits} visitas (${pct(last.visits, prev.visits)}).`);
    }
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const fb = await dbGet(`gh3_feedback?select=rating&created_at=gte.${encodeURIComponent(since)}`).catch(() => []);
  if (fb.length) lines.push(`Opiniones nuevas: ${fb.length}, promedio ${(fb.reduce((n: number, r: { rating: number }) => n + r.rating, 0) / fb.length).toFixed(1)}/5.`);
  return await notify('digest', { title: 'Resumen de Las Vegas Hero', body: lines.join(' '), tag: 'digest' });
}

Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || '';
  if (action === 'check') {
    if (!(await cronAllowed(req))) return Response.json({ error: 'forbidden' }, { status: 403 });
    const result: Record<string, unknown> = {};
    for (const [name, fn] of [['feedback', checkFeedback], ['alerts', checkAlerts], ['digest', checkDigest]] as const) {
      try { result[name] = await fn(); } catch (error) { console.error('gh3 push check', name, error instanceof Error ? error.message : 'error'); result[name] = 'error'; }
    }
    return Response.json(result, { headers: { 'cache-control': 'no-store' } });
  }
  if (!allowedOrigins.has(origin)) return new Response('forbidden', { status: 403 });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
  if (action === 'key' && req.method === 'GET') return json(200, origin, { key: Deno.env.get('VAPID_PUBLIC_KEY') || '' });
  if (!(await authorized(req))) return json(401, origin, { error: 'unauthorized' });
  if (req.method !== 'POST') return json(405, origin, { error: 'method' });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json(400, origin, { error: 'bad_json' }); }
  try {
    if (action === 'subscribe') {
      const sub = body.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      const prefs = (body.prefs || {}) as Record<string, unknown>;
      if (!sub?.endpoint?.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth || sub.endpoint.length > 600) return json(400, origin, { error: 'bad_subscription' });
      await dbUpsert('gh3_push_subs', {
        endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
        prefs: { feedback: prefs.feedback !== false, alerts: prefs.alerts !== false, digest: prefs.digest !== false },
        updated_at: new Date().toISOString(),
      }, 'endpoint');
      return json(200, origin, { ok: true });
    }
    if (action === 'unsubscribe') {
      const endpoint = String(body.endpoint || '');
      if (endpoint) await dbDelete(`gh3_push_subs?endpoint=eq.${encodeURIComponent(endpoint)}`);
      return json(200, origin, { ok: true });
    }
    if (action === 'test') {
      const sent = await notify('test', { title: 'Avisos activados', body: 'Así te van a llegar las novedades de Las Vegas Hero.', tag: 'test' });
      return json(200, origin, { ok: true, sent });
    }
  } catch (error) {
    console.error('gh3 push', error instanceof Error ? error.message : 'error');
    return json(500, origin, { error: 'server' });
  }
  return json(404, origin, { error: 'not_found' });
});
