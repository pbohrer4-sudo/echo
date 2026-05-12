-- LLM-/TTS-Aufruf-Log für Spend-Tracking. Wird von jeder AI-Route
-- nach einem (erfolgreichen oder fehlgeschlagenen) Aufruf insert-et.
-- Ein Row = ein API-Call gegen Anthropic / ElevenLabs.
--
-- cost_cents ist clientseitig in lib/llm-usage.ts berechnet (Preise
-- als Konstanten im Code) — DB hält nur den finalen Cent-Wert.

create table if not exists public.llm_usage_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  endpoint text not null,
  provider text not null check (provider in ('anthropic', 'elevenlabs')),
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  characters integer not null default 0,
  cost_cents numeric(10,4) not null default 0,
  latency_ms integer,
  status text not null default 'ok' check (
    status in ('ok', 'error', 'rate_limited')
  ),
  created_at timestamptz not null default now()
);

alter table public.llm_usage_log enable row level security;

drop policy if exists "Users see own usage" on public.llm_usage_log;
create policy "Users see own usage"
  on public.llm_usage_log for select
  using (user_id = auth.uid());

drop policy if exists "Users insert own usage" on public.llm_usage_log;
create policy "Users insert own usage"
  on public.llm_usage_log for insert
  with check (user_id = auth.uid());

-- Update/Delete bewusst restriktiv — Log soll append-only sein.

create index if not exists idx_llm_usage_user_time
  on public.llm_usage_log (user_id, created_at desc);
create index if not exists idx_llm_usage_endpoint_time
  on public.llm_usage_log (endpoint, created_at desc);
create index if not exists idx_llm_usage_recent
  on public.llm_usage_log (created_at desc);

-- Admin RPC für die LLM-Spend-Karte im Admin-Dashboard.
create or replace function public.admin_llm_usage_stats()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  result json;
begin
  select json_build_object(
    'total_requests_30d', (
      select count(*) from public.llm_usage_log
      where created_at >= v_now - interval '30 days'
    ),
    'total_cost_cents_30d', (
      select coalesce(sum(cost_cents), 0) from public.llm_usage_log
      where created_at >= v_now - interval '30 days'
    ),
    'total_input_tokens_30d', (
      select coalesce(sum(input_tokens), 0) from public.llm_usage_log
      where created_at >= v_now - interval '30 days'
    ),
    'total_output_tokens_30d', (
      select coalesce(sum(output_tokens), 0) from public.llm_usage_log
      where created_at >= v_now - interval '30 days'
    ),
    'error_rate_30d', (
      select case
        when count(*) = 0 then 0
        else round(
          100.0 * count(*) filter (where status = 'error') / count(*),
          2
        )
      end
      from public.llm_usage_log
      where created_at >= v_now - interval '30 days'
    ),
    'by_endpoint_30d', (
      select coalesce(json_agg(json_build_object(
        'endpoint', endpoint,
        'requests', requests,
        'cost_cents', cost_cents
      ) order by cost_cents desc), '[]'::json)
      from (
        select endpoint,
               count(*) as requests,
               sum(cost_cents) as cost_cents
        from public.llm_usage_log
        where created_at >= v_now - interval '30 days'
        group by endpoint
      ) t
    ),
    'daily_7d', (
      select coalesce(json_agg(json_build_object(
        'day', day,
        'requests', requests,
        'cost_cents', cost_cents
      ) order by day), '[]'::json)
      from (
        select date_trunc('day', created_at) as day,
               count(*) as requests,
               sum(cost_cents) as cost_cents
        from public.llm_usage_log
        where created_at >= v_now - interval '7 days'
        group by 1
      ) t
    )
  ) into result;
  return result;
end;
$$;

revoke execute on function public.admin_llm_usage_stats() from public;
revoke execute on function public.admin_llm_usage_stats() from authenticated;
revoke execute on function public.admin_llm_usage_stats() from anon;

notify pgrst, 'reload schema';
