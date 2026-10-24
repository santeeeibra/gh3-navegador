import {localDay} from './activity.js';
import {ACTORS,actorOf,audienceOf,matchesAudience} from '../shared/audience.js';
const FUNNEL = ['page_view', 'play_clicked', 'assets_ready', 'game_started', 'song_started'];

function safeDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function countSessions(rows, eventName) {
  return new Set(rows.filter(row => row.event_name === eventName).map(row => row.session_id)).size;
}

function rankedSessions(rows, field, eventName = 'page_view') {
  const groups = new Map();
  for (const row of rows) {
    if (row.event_name !== eventName) continue;
    const label = String(row[field] || 'unknown').slice(0, 64);
    if (!groups.has(label)) groups.set(label, new Set());
    groups.get(label).add(row.session_id);
  }
  return [...groups.entries()]
    .map(([label, sessions]) => ({ label, sessions: sessions.size }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label));
}

export function buildDashboard(rows, days = 30, nowMs = Date.now(), audience='all') {
  audienceOf(audience);
  const clean = rows
    .filter(row=>matchesAudience(row.metadata,audience))
    .map(row => ({ ...row, date: safeDate(row.occurred_at) }))
    .filter(row => row.date && typeof row.session_id === 'string');
  const allSessions = new Set(clean.map(row => row.session_id));
  const eventCounts = Object.fromEntries(
    ['page_view', 'play_clicked', 'assets_ready', 'game_started', 'song_started', 'session_ended', 'load_error', 'cache_fallback']
      .map(name => [name, clean.filter(row => row.event_name === name).length]),
  );
  const funnel = FUNNEL.map((name, index) => {
    const sessions = countSessions(clean, name);
    const previous = index ? countSessions(clean, FUNNEL[index - 1]) : sessions;
    return {
      event: name,
      sessions,
      from_previous_pct: previous ? Math.round((sessions / previous) * 1000) / 10 : 0,
    };
  });

  const dailyMap = new Map();
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = localDay(nowMs - offset * 86_400_000);
    dailyMap.set(date, { date, visits: new Set(), starts: new Set(), errors: 0, actors: new Map() });
  }
  for (const row of clean) {
    const day = dailyMap.get(localDay(row.date));
    if (!day) continue;
    if (row.event_name === 'page_view') {
      day.visits.add(row.session_id);
      const actor = actorOf(row.metadata);
      if (!day.actors.has(actor)) day.actors.set(actor, new Set());
      day.actors.get(actor).add(row.session_id);
    }
    if (row.event_name === 'game_started') day.starts.add(row.session_id);
    if (row.event_name === 'load_error') day.errors += 1;
  }
  const daily = [...dailyMap.values()].map(day => ({
    date: day.date,
    visits: day.visits.size,
    starts: day.starts.size,
    errors: day.errors,
    by_actor: Object.fromEntries([...day.actors].map(([actor, sessions]) => [actor, sessions.size])),
  }));

  // Who generated the activity: declared test marks vs unmarked visits.
  const actorMap = new Map();
  for (const row of clean) {
    const actor = actorOf(row.metadata);
    if (!actorMap.has(actor)) actorMap.set(actor, { actor, sessions: new Set(), started: new Set(), songs: 0, errors: 0, last: 0 });
    const item = actorMap.get(actor);
    item.sessions.add(row.session_id);
    if (row.event_name === 'game_started') item.started.add(row.session_id);
    if (row.event_name === 'song_started') item.songs += 1;
    if (row.event_name === 'load_error' || row.event_name === 'runtime_error') item.errors += 1;
    item.last = Math.max(item.last, row.date.getTime());
  }
  const actors = [...actorMap.values()]
    .map(item => ({ actor: item.actor, sessions: item.sessions.size, game_started: item.started.size, songs: item.songs, errors: item.errors, last_at: new Date(item.last).toISOString() }))
    .sort((a, b) => [...ACTORS, 'unknown'].indexOf(a.actor) - [...ACTORS, 'unknown'].indexOf(b.actor));

  const songs = new Map();
  const errorPhases = new Map();
  const durations = [];
  for (const row of clean) {
    if (row.event_name === 'song_started') {
      const song = String(row.metadata?.song || 'unknown').slice(0, 48);
      songs.set(song, (songs.get(song) || 0) + 1);
    }
    if (row.event_name === 'load_error') {
      const phase = String(row.metadata?.phase || 'unknown').slice(0, 32);
      errorPhases.set(phase, (errorPhases.get(phase) || 0) + 1);
    }
    if (row.event_name === 'session_ended' && Number.isFinite(Number(row.metadata?.seconds))) {
      durations.push(Math.max(0, Math.min(86_400, Number(row.metadata.seconds))));
    }
  }
  const activeCutoff = nowMs - 5 * 60_000;
  const activeSessions = new Set(clean.filter(row => row.date.getTime() >= activeCutoff).map(row => row.session_id));
  const latest = clean.reduce((max, row) => Math.max(max, row.date.getTime()), 0);

  return {
    generated_at: new Date(nowMs).toISOString(),
    range_days: days,
    audience,
    totals: {
      sessions: allSessions.size,
      visits: countSessions(clean, 'page_view'),
      play_clicked: countSessions(clean, 'play_clicked'),
      game_started: countSessions(clean, 'game_started'),
      song_started: countSessions(clean, 'song_started'),
      load_errors: eventCounts.load_error,
      cache_fallbacks: eventCounts.cache_fallback,
      active_5m: activeSessions.size,
      average_session_seconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
    },
    event_counts: eventCounts,
    actors,
    funnel,
    daily,
    sources: rankedSessions(clean, 'source'),
    devices: rankedSessions(clean, 'device'),
    songs: [...songs.entries()].map(([song, starts]) => ({ song, starts })).sort((a, b) => b.starts - a.starts || a.song.localeCompare(b.song)),
    error_phases: [...errorPhases.entries()].map(([phase, errors]) => ({ phase, errors })).sort((a, b) => b.errors - a.errors || a.phase.localeCompare(b.phase)),
    latest_event_at: latest ? new Date(latest).toISOString() : null,
    rooms: { available: false, reason: 'El duelo online y los apodos todavía no están implementados.' },
    privacy: 'Ubicación aproximada por IP, puede ser incorrecta o no estar disponible. No se guarda la IP ni el GPS. Santi/Codex/Claude son marcas declaradas de prueba, no identidad verificada. Sin identificar incluye visitas antiguas y pruebas sin marcar; no equivale a jugadores reales. Las opiniones se muestran para todo el período, sin filtro de pruebas.',
  };
}

// Claude 2026-10-22: mismo resultado que buildDashboard, pero a partir del resumen que calcula la base
// (gh3_dashboard_summary en supabase/dashboard-summary.sql): cubre el período completo sin bajar eventos crudos.
export function fromSummary(summary, days = 30, nowMs = Date.now(), audience = 'all') {
  audienceOf(audience);
  const s = summary || {}, t = s.totals || {}, num = value => Number(value) || 0;
  const eventCounts = Object.fromEntries(['page_view', 'play_clicked', 'assets_ready', 'game_started', 'song_started', 'session_ended', 'load_error', 'cache_fallback']
    .map(name => [name, num(s.event_counts?.[name])]));
  const funnel = FUNNEL.map((name, index) => {
    const key = name === 'page_view' ? 'visits' : name;
    const sessions = num(t[key]), previous = index ? num(t[FUNNEL[index - 1] === 'page_view' ? 'visits' : FUNNEL[index - 1]]) : sessions;
    return { event: name, sessions, from_previous_pct: previous ? Math.round((sessions / previous) * 1000) / 10 : 0 };
  });
  const order = [...ACTORS, 'unknown'];
  return {
    generated_at: new Date(nowMs).toISOString(),
    range_days: days,
    audience,
    totals: {
      sessions: num(t.sessions), visits: num(t.visits), play_clicked: num(t.play_clicked), game_started: num(t.game_started),
      song_started: num(t.song_started), load_errors: num(t.load_errors), cache_fallbacks: num(t.cache_fallbacks), active_5m: num(t.active_5m),
      average_session_seconds: t.average_session_seconds == null ? null : num(t.average_session_seconds),
    },
    event_counts: eventCounts,
    actors: (s.actors || []).map(a => ({ actor: a.actor, sessions: num(a.sessions), game_started: num(a.game_started), songs: num(a.songs), errors: num(a.errors), last_at: a.last_at ? new Date(a.last_at).toISOString() : null }))
      .sort((a, b) => order.indexOf(a.actor) - order.indexOf(b.actor)),
    funnel,
    daily: (s.daily || []).map(d => ({ date: String(d.date).slice(0, 10), visits: num(d.visits), starts: num(d.starts), errors: num(d.errors), by_actor: d.by_actor || {} })),
    sources: s.sources || [],
    devices: s.devices || [],
    songs: s.songs || [],
    error_phases: s.error_phases || [],
    latest_event_at: t.latest_event_at ? new Date(t.latest_event_at).toISOString() : null,
    rooms: { available: false, reason: 'El duelo online y los apodos todavía no están implementados.' },
    privacy: 'Ubicación aproximada por IP, puede ser incorrecta o no estar disponible. No se guarda la IP ni el GPS. Santi/Codex/Claude son marcas declaradas de prueba, no identidad verificada. Sin identificar incluye visitas antiguas y pruebas sin marcar; no equivale a jugadores reales. Las opiniones se muestran para todo el período, sin filtro de pruebas.',
  };
}

// Jugadores en vivo: una sesión cuenta si mandó un latido en los últimos 90 s.
// El menú es aproximado: el juego solo informa vista previa, carga, canción tocando o inicio.
const LIVE_SECONDS = 90;
const LIVE_STAGES = [
  ['menu', 'Menú de canciones'],
  ['loading', 'Cargando una canción'],
  ['playing', 'Tocando una canción'],
  ['idle', 'Inicio u otros menús'],
];

export function buildLive(rows, nowMs = Date.now(), audience = 'all') {
  audienceOf(audience);
  const latest = new Map();
  for (const row of rows) {
    if (!matchesAudience(row.metadata, audience) || typeof row.session_id !== 'string') continue;
    const at = safeDate(row.occurred_at)?.getTime();
    if (!at || at > nowMs || nowMs - at > LIVE_SECONDS * 1000) continue;
    const previous = latest.get(row.session_id);
    if (!previous || at > previous.at) latest.set(row.session_id, { at, stage: String(row.metadata?.stage || 'idle') });
  }
  const counts = new Map(LIVE_STAGES.map(([stage]) => [stage, 0]));
  for (const { stage } of latest.values()) {
    const key = counts.has(stage) ? stage : 'idle';
    counts.set(key, counts.get(key) + 1);
  }
  return {
    generated_at: new Date(nowMs).toISOString(),
    window_seconds: LIVE_SECONDS,
    players: latest.size,
    by_stage: LIVE_STAGES.map(([stage, label]) => ({ stage, label, players: counts.get(stage) })),
  };
}
