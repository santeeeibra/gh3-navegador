-- Reviewed deployment SQL. Apply together with the two Edge Functions after approval.
begin;
create table if not exists public.gh3_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 5),
  category text not null check (category in ('general','performance','audio','controls','loading','graphics','suggestion','other')),
  message text not null default '' check (char_length(message) <= 2000),
  nickname text not null default '' check (char_length(nickname) <= 40),
  device text not null check (device in ('phone','tablet','desktop','unknown')),
  browser text not null check (browser in ('Edge','Firefox','Opera','Brave','Chrome','Safari','Other')),
  rate_bucket text check (rate_bucket ~ '^[a-f0-9]{64}$')
);
alter table public.gh3_feedback enable row level security;
revoke all on public.gh3_feedback from public, anon, authenticated;
grant select, insert, update on public.gh3_feedback to service_role;
create index if not exists gh3_feedback_created_idx on public.gh3_feedback (created_at desc);
create index if not exists gh3_feedback_bucket_idx on public.gh3_feedback (rate_bucket, created_at desc);

create or replace function public.gh3_submit_feedback(p_data jsonb, p_bucket text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then raise exception 'invalid_bucket'; end if;
  -- Serialize same-network submissions so parallel requests cannot bypass the cap.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket, 0));
  if exists (select 1 from public.gh3_feedback where request_id = (p_data->>'request_id')::uuid) then return 'duplicate'; end if;
  if (select count(*) from public.gh3_feedback where rate_bucket = p_bucket and created_at >= now() - interval '10 minutes') >= 3 then return 'limited'; end if;
  -- Only the current day's salted digest is needed for limits. Expire old digests.
  update public.gh3_feedback set rate_bucket = null where rate_bucket is not null and created_at < now() - interval '1 day';
  insert into public.gh3_feedback (request_id, rating, category, message, nickname, device, browser, rate_bucket)
  values ((p_data->>'request_id')::uuid, (p_data->>'rating')::smallint, p_data->>'category', p_data->>'message', p_data->>'nickname', p_data->>'device', p_data->>'browser', p_bucket)
  on conflict (request_id) do nothing;
  return 'stored';
end;
$$;
revoke all on function public.gh3_submit_feedback(jsonb,text) from public, anon, authenticated;
grant execute on function public.gh3_submit_feedback(jsonb,text) to service_role;
commit;
