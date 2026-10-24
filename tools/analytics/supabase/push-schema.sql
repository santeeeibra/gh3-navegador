-- Claude 2026-10-24: avisos push del panel. Se pega en el editor SQL de Supabase (proyecto nvlwlmyuqorxaupcdbdb).
-- __CRON_KEY__ se reemplaza al armar (tools/analytics/push-armar.mjs) por la clave secreta del cron.
create table if not exists public.gh3_push_subs (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.gh3_push_state (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);
alter table public.gh3_push_subs enable row level security;
alter table public.gh3_push_state enable row level security;
revoke all on table public.gh3_push_subs, public.gh3_push_state from public, anon, authenticated;
grant all on table public.gh3_push_subs, public.gh3_push_state to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('gh3-push-check') where exists (select 1 from cron.job where jobname = 'gh3-push-check');
select cron.schedule('gh3-push-check', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://nvlwlmyuqorxaupcdbdb.supabase.co/functions/v1/gh3-push?action=check',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-key', '__CRON_KEY__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
$job$);
