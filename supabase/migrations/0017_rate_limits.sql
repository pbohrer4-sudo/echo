-- Per-user rate-limit buckets. One row per (user_id, key, window).
-- Used by lib/rate-limit.ts to cap calls to AI-spending endpoints
-- before they reach Anthropic / ElevenLabs and burn the BYO budget.
--
-- A Postgres function does the increment atomically so concurrent
-- requests can't undercount. The fallback path in lib/rate-limit.ts
-- handles the case where the function isn't installed (older deploys).

create table if not exists public.rate_limits (
  user_id uuid references auth.users(id) on delete cascade not null,
  key text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, key, window_start)
);

alter table public.rate_limits enable row level security;

drop policy if exists "Users see their rate limits" on public.rate_limits;
create policy "Users see their rate limits"
  on public.rate_limits for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their rate limits" on public.rate_limits;
create policy "Users insert their rate limits"
  on public.rate_limits for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their rate limits" on public.rate_limits;
create policy "Users update their rate limits"
  on public.rate_limits for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their rate limits" on public.rate_limits;
create policy "Users delete their rate limits"
  on public.rate_limits for delete
  using (user_id = auth.uid());

-- Atomic increment. Returns the new count.
create or replace function public.rate_limit_increment(
  p_user_id uuid,
  p_key text,
  p_window_start timestamptz
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits (user_id, key, window_start, count, updated_at)
  values (p_user_id, p_key, p_window_start, 1, now())
  on conflict (user_id, key, window_start)
  do update set count = rate_limits.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;

-- Sweep old buckets — keep only the last hour. Run from any cron, or
-- ignore: stale rows are tiny and only cost a few KB.
create or replace function public.rate_limit_sweep() returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limits where window_start < now() - interval '1 hour';
$$;

create index if not exists idx_rate_limits_window
  on public.rate_limits (window_start);

notify pgrst, 'reload schema';
