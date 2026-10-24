-- Claude 2026-10-22: resumen del panel calculado en la base. Se aplica en el editor SQL de Supabase (proyecto nvlwlmyuqorxaupcdbdb).
-- v2: con ~100.000 eventos por día, leer los eventos crudos de 30 días tardaba 11 s (la base corta a los 8 s).
-- Ahora cada día terminado se resume UNA vez en gh3_daily_stats y solo «hoy» se calcula en el momento.
-- Sesiones de un período = suma de sesiones de cada día (una visita que cruza la medianoche cuenta en los dos días).
-- Días y semanas en hora de Argentina; semanas de lunes a domingo. Solo service_role (la función del panel) puede usarlo.

create index if not exists gh3_analytics_events_occurred_event_idx
  on public.gh3_analytics_events (occurred_at, event_name);

create table if not exists public.gh3_daily_stats (
  day date not null,
  actor text not null,
  kind text not null,      -- any | event | device | source | song | phase | error_sessions | duration | last | done
  label text not null default '',
  sessions int not null default 0,
  events int not null default 0,
  extra numeric,
  primary key (day, actor, kind, label)
);
alter table public.gh3_daily_stats enable row level security;
revoke all on table public.gh3_daily_stats from public, anon, authenticated;
grant all on table public.gh3_daily_stats to service_role;

-- Jugadores conectados: una fila por visita, que el latido (cada 20 s) actualiza en vez de sumar eventos.
-- Así «jugando ahora» funciona sin agregar ~1 millón de filas por día a gh3_analytics_events.
create table if not exists public.gh3_live_sessions (
  session_id text primary key,
  seen_at timestamptz not null default now(),
  stage text not null default 'idle',
  tester text,
  device text
);
create index if not exists gh3_live_sessions_seen_idx on public.gh3_live_sessions (seen_at);
alter table public.gh3_live_sessions enable row level security;
revoke all on table public.gh3_live_sessions from public, anon, authenticated;
grant all on table public.gh3_live_sessions to service_role;

-- Quién generó el evento (marcas de prueba declaradas), igual que shared/audience.js.
create or replace function public.gh3_actor(m jsonb) returns text
language sql immutable as $$
  select case when m->>'tester' in ('santi','codex','claude','automation') then m->>'tester' else 'unknown' end
$$;

create or replace function public.gh3_matches(m jsonb, p_audience text) returns boolean
language sql immutable as $$
  select p_audience = 'all'
      or (p_audience = 'internal' and public.gh3_actor(m) <> 'unknown')
      or public.gh3_actor(m) = p_audience
$$;

create or replace function public.gh3_actor_matches(p_actor text, p_audience text) returns boolean
language sql immutable as $$
  select p_audience = 'all' or (p_audience = 'internal' and p_actor <> 'unknown') or p_actor = p_audience
$$;

-- Filas de resumen para los eventos de [p_from, p_to), agrupadas por día local y autor.
create or replace function public.gh3_day_rows(p_from timestamptz, p_to timestamptz)
returns table (day date, actor text, kind text, label text, sessions int, events int, extra numeric)
language sql stable
set search_path = public
set work_mem = '64MB'
as $$
with e as materialized (
  select occurred_at, event_name, session_id, source, device,
         gh3_actor(metadata) actor,
         (occurred_at at time zone 'America/Argentina/Buenos_Aires')::date as day,
         case when event_name = 'song_started' then left(coalesce(metadata->>'song', 'unknown'), 48) end song,
         case when event_name = 'load_error' then left(coalesce(metadata->>'phase', 'unknown'), 32) end phase,
         case when event_name = 'session_ended' and metadata->>'seconds' ~ '^[0-9.]+$'
              then least(greatest((metadata->>'seconds')::numeric, 0), 86400) end secs
  from gh3_analytics_events
  where occurred_at >= p_from and occurred_at < p_to and event_name <> 'heartbeat'
)
select day, actor, 'any', '', count(distinct session_id)::int, count(*)::int, null::numeric from e group by 1, 2
union all
select day, actor, 'event', event_name, count(distinct session_id)::int, count(*)::int, null from e group by 1, 2, 4
union all
select day, actor, 'device', left(coalesce(device, 'unknown'), 64), count(distinct session_id)::int, count(*)::int, null
  from e where event_name = 'page_view' group by 1, 2, 4
union all
select day, actor, 'source', left(coalesce(source, 'unknown'), 64), count(distinct session_id)::int, count(*)::int, null
  from e where event_name = 'page_view' group by 1, 2, 4
union all
select day, actor, 'song', song, count(distinct session_id)::int, count(*)::int, null from e where song is not null group by 1, 2, 4
union all
select day, actor, 'phase', phase, count(distinct session_id)::int, count(*)::int, null from e where phase is not null group by 1, 2, 4
union all
select day, actor, 'error_sessions', '', count(distinct session_id)::int, count(*)::int, null
  from e where event_name in ('load_error', 'runtime_error') group by 1, 2
union all
select day, actor, 'duration', '', 0, count(*)::int, sum(secs) from e where secs is not null group by 1, 2
union all
select day, actor, 'last', '', 0, 0, extract(epoch from max(occurred_at)) from e group by 1, 2
$$;

-- Resume (una sola vez) los días terminados entre hoy-p_days y ayer que todavía no estén resumidos.
create or replace function public.gh3_rollup_ensure(p_days int)
returns void
language plpgsql volatile
set search_path = public
set work_mem = '64MB'
as $$
declare
  today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
  d date;
begin
  perform pg_advisory_xact_lock(hashtext('gh3_daily_stats'));
  delete from gh3_live_sessions where seen_at < now() - interval '1 day';  -- conectados de ayer: ya no sirven
  for d in select g::date from generate_series(today - p_days, today - 1, interval '1 day') g loop
    continue when exists (select 1 from gh3_daily_stats s where s.day = d and s.kind = 'done');
    delete from gh3_daily_stats s where s.day = d;
    insert into gh3_daily_stats (day, actor, kind, label, sessions, events, extra)
      select * from gh3_day_rows(d::timestamp at time zone 'America/Argentina/Buenos_Aires',
                                 (d + 1)::timestamp at time zone 'America/Argentina/Buenos_Aires');
    insert into gh3_daily_stats (day, actor, kind) values (d, '', 'done');
  end loop;
  -- Retención (OK de Santi 2026-10-22): los eventos crudos de más de 14 días se borran SOLO si su día ya está resumido.
  -- Hasta 20.000 por llamada, para no pasar el tope de 8 s; las llamadas siguientes terminan el resto.
  delete from gh3_analytics_events
  where id in (
    select ev.id from gh3_analytics_events ev
    where ev.occurred_at < (today - 14)::timestamp at time zone 'America/Argentina/Buenos_Aires'
      and exists (select 1 from gh3_daily_stats s
                  where s.kind = 'done' and s.day = (ev.occurred_at at time zone 'America/Argentina/Buenos_Aires')::date)
    limit 20000);
end
$$;

-- Días resumidos + hoy en el momento, para los últimos p_days días.
create or replace function public.gh3_stats_rows(p_days int)
returns table (day date, actor text, kind text, label text, sessions int, events int, extra numeric)
language plpgsql volatile
set search_path = public
set work_mem = '64MB'
as $$
declare today date := (now() at time zone 'America/Argentina/Buenos_Aires')::date;
begin
  perform gh3_rollup_ensure(p_days);
  return query
    select s.day, s.actor, s.kind, s.label, s.sessions, s.events, s.extra from gh3_daily_stats s
      where s.day > today - p_days and s.day < today and s.kind <> 'done'
    union all
    select * from gh3_day_rows(today::timestamp at time zone 'America/Argentina/Buenos_Aires', now() + interval '1 minute');
end
$$;

-- Resumen del período (7/30/90 días): totales, embudo, días, dispositivos, origen, canciones, errores, autores.
create or replace function public.gh3_dashboard_summary(p_days int, p_audience text default 'all')
returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare result jsonb;
begin
  create temporary table if not exists gh3_tmp_rows (day date, actor text, kind text, label text, sessions int, events int, extra numeric) on commit drop;
  truncate gh3_tmp_rows;
  insert into gh3_tmp_rows select * from gh3_stats_rows(p_days) r where gh3_actor_matches(r.actor, p_audience);
  with s as (select * from gh3_tmp_rows),
  days as (
    select generate_series((now() at time zone 'America/Argentina/Buenos_Aires')::date - (p_days - 1),
                           (now() at time zone 'America/Argentina/Buenos_Aires')::date, interval '1 day')::date as day
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
        'sessions', (select coalesce(sum(sessions), 0) from s where kind = 'any'),
        'visits', (select coalesce(sum(sessions), 0) from s where kind = 'event' and label = 'page_view'),
        'play_clicked', (select coalesce(sum(sessions), 0) from s where kind = 'event' and label = 'play_clicked'),
        'assets_ready', (select coalesce(sum(sessions), 0) from s where kind = 'event' and label = 'assets_ready'),
        'game_started', (select coalesce(sum(sessions), 0) from s where kind = 'event' and label = 'game_started'),
        'song_started', (select coalesce(sum(sessions), 0) from s where kind = 'event' and label = 'song_started'),
        'load_errors', (select coalesce(sum(events), 0) from s where kind = 'event' and label = 'load_error'),
        'cache_fallbacks', (select coalesce(sum(events), 0) from s where kind = 'event' and label = 'cache_fallback'),
        'active_5m', (select count(distinct session_id) from gh3_analytics_events
                       where occurred_at >= now() - interval '5 minutes' and event_name <> 'heartbeat' and gh3_matches(metadata, p_audience)),
        'average_session_seconds', (select round(sum(extra) / nullif(sum(events), 0)) from s where kind = 'duration'),
        'latest_event_at', (select to_timestamp(max(extra)) from s where kind = 'last')),
    'event_counts', (select coalesce(jsonb_object_agg(label, n), '{}') from (select label, sum(events) n from s where kind = 'event' group by 1) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('date', d.day,
                'visits', coalesce((select sum(sessions) from s where s.day = d.day and kind = 'event' and label = 'page_view'), 0),
                'starts', coalesce((select sum(sessions) from s where s.day = d.day and kind = 'event' and label = 'game_started'), 0),
                'errors', coalesce((select sum(events) from s where s.day = d.day and kind = 'event' and label = 'load_error'), 0),
                'by_actor', coalesce((select jsonb_object_agg(actor, sessions) from s where s.day = d.day and kind = 'event' and label = 'page_view'), '{}'))
              order by d.day), '[]') from days d),
    'actors', (select coalesce(jsonb_agg(jsonb_build_object('actor', a.actor,
                'sessions', (select coalesce(sum(sessions), 0) from s where s.actor = a.actor and kind = 'any'),
                'game_started', (select coalesce(sum(sessions), 0) from s where s.actor = a.actor and kind = 'event' and label = 'game_started'),
                'songs', (select coalesce(sum(events), 0) from s where s.actor = a.actor and kind = 'event' and label = 'song_started'),
                'errors', (select coalesce(sum(events), 0) from s where s.actor = a.actor and kind = 'event' and label in ('load_error', 'runtime_error')),
                'last_at', (select to_timestamp(max(extra)) from s where s.actor = a.actor and kind = 'last'))), '[]')
              from (select distinct actor from s where kind = 'any') a),
    'sources', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'sessions', n) order by n desc, label), '[]')
        from (select label, sum(sessions) n from s where kind = 'source' group by 1) x),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('label', label, 'sessions', n) order by n desc, label), '[]')
        from (select label, sum(sessions) n from s where kind = 'device' group by 1) x),
    'songs', (select coalesce(jsonb_agg(jsonb_build_object('song', label, 'starts', n) order by n desc, label), '[]')
        from (select label, sum(events) n from s where kind = 'song' group by 1) x),
    'error_phases', (select coalesce(jsonb_agg(jsonb_build_object('phase', label, 'errors', n) order by n desc, label), '[]')
        from (select label, sum(events) n from s where kind = 'phase' group by 1) x)
  ) into result;
  return result;
end
$$;

-- Resumen por semana (lunes a domingo): las últimas p_weeks semanas, la actual incluida.
create or replace function public.gh3_dashboard_weekly(p_weeks int default 12, p_audience text default 'all')
returns jsonb
language plpgsql volatile
set search_path = public
as $$
declare
  first_week date := date_trunc('week', now() at time zone 'America/Argentina/Buenos_Aires')::date - (p_weeks - 1) * 7;
  result jsonb;
begin
  with s as (
    select date_trunc('week', r.day)::date week, r.* from gh3_stats_rows((now() at time zone 'America/Argentina/Buenos_Aires')::date - first_week + 1) r
    where r.day >= first_week and gh3_actor_matches(r.actor, p_audience)
  ),
  weeks as (select generate_series(first_week, first_week + (p_weeks - 1) * 7, interval '7 days')::date as week),
  w as (
    select week,
      sum(sessions) filter (where kind = 'event' and label = 'page_view') visits,
      sum(sessions) filter (where kind = 'event' and label = 'game_started') played,
      sum(sessions) filter (where kind = 'event' and label = 'song_started') with_song,
      sum(events) filter (where kind = 'event' and label = 'song_started') songs,
      sum(sessions) filter (where kind = 'device' and label = 'phone') phone,
      sum(events) filter (where kind = 'event' and label in ('load_error', 'runtime_error')) errors,
      sum(sessions) filter (where kind = 'error_sessions') sessions_with_errors,
      round(sum(extra) filter (where kind = 'duration') / nullif(sum(events) filter (where kind = 'duration'), 0)) avg_seconds
    from s group by week
  ),
  top as (
    select distinct on (week) week, label song, n from (select week, label, sum(events) n from s where kind = 'song' group by 1, 2) x
    order by week, n desc, label
  )
  select coalesce(jsonb_agg(jsonb_build_object('week', k.week, 'visits', coalesce(w.visits, 0), 'played', coalesce(w.played, 0),
           'with_song', coalesce(w.with_song, 0), 'songs', coalesce(w.songs, 0), 'phone', coalesce(w.phone, 0),
           'errors', coalesce(w.errors, 0), 'sessions_with_errors', coalesce(w.sessions_with_errors, 0),
           'avg_seconds', w.avg_seconds, 'top_song', t.song, 'top_song_starts', t.n) order by k.week), '[]')
  into result
  from weeks k left join w on w.week = k.week left join top t on t.week = k.week;
  return result;
end
$$;

-- En vivo: última hora (sesiones, arranques, canciones, errores, canciones más tocadas).
create or replace function public.gh3_dashboard_last_hour(p_audience text default 'all')
returns jsonb
language sql stable
set search_path = public
as $$
with e as (
  select event_name, session_id, metadata from gh3_analytics_events
  where occurred_at >= now() - interval '1 hour' and event_name <> 'heartbeat' and gh3_matches(metadata, p_audience)
)
select jsonb_build_object(
  'sessions', (select count(distinct session_id) from e),
  'visits', (select count(distinct session_id) from e where event_name = 'page_view'),
  'game_started', (select count(distinct session_id) from e where event_name = 'game_started'),
  'songs', (select count(*) from e where event_name = 'song_started'),
  'errors', (select count(*) from e where event_name in ('load_error', 'runtime_error')),
  'top_songs', (select coalesce(jsonb_agg(jsonb_build_object('song', song, 'starts', n) order by n desc, song), '[]') from (
     select left(coalesce(metadata->>'song', 'unknown'), 48) song, count(*) n from e where event_name = 'song_started'
     group by 1 order by 2 desc, 1 limit 5) x))
$$;

revoke all on function public.gh3_actor(jsonb), public.gh3_matches(jsonb, text), public.gh3_actor_matches(text, text),
  public.gh3_day_rows(timestamptz, timestamptz), public.gh3_rollup_ensure(int), public.gh3_stats_rows(int),
  public.gh3_dashboard_summary(int, text), public.gh3_dashboard_weekly(int, text), public.gh3_dashboard_last_hour(text)
  from public, anon, authenticated;
grant execute on function public.gh3_actor(jsonb), public.gh3_matches(jsonb, text), public.gh3_actor_matches(text, text),
  public.gh3_day_rows(timestamptz, timestamptz), public.gh3_rollup_ensure(int), public.gh3_stats_rows(int),
  public.gh3_dashboard_summary(int, text), public.gh3_dashboard_weekly(int, text), public.gh3_dashboard_last_hour(text)
  to service_role;

-- Primer resumen de los días ya terminados (en el editor SQL no hay tope de 8 s; después cada día nuevo se resume una vez).
-- También borra los primeros crudos de más de 14 días ya resumidos (hasta 20.000).
select public.gh3_rollup_ensure(90);
