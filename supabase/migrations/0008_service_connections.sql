-- Service Connections — per-user external-service auth state. Note
-- the table name `service_connections` to avoid clobbering the
-- pre-existing `connections` table (person-to-person relationship
-- graph from the original brief, Section 5).
--
-- V1 only stores the connection record + (eventually) tokens. The
-- actual MCP runtime — process spawning + tool invocation — lives
-- in V2/V3 on a long-running worker outside Vercel's serverless
-- boundary.
--
-- Run in Supabase SQL Editor.

create table if not exists public.service_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null,
  status text not null default 'pending' check (
    status in ('pending', 'connected', 'error', 'expired', 'disconnected')
  ),
  account_label text,
  access_token text,
  refresh_token text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  config jsonb not null default '{}'::jsonb,
  last_error text,
  connected_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, provider)
);

alter table public.service_connections enable row level security;

drop policy if exists "Users see their service connections" on public.service_connections;
create policy "Users see their service connections"
  on public.service_connections for select using (user_id = auth.uid());
drop policy if exists "Users insert their service connections" on public.service_connections;
create policy "Users insert their service connections"
  on public.service_connections for insert with check (user_id = auth.uid());
drop policy if exists "Users update their service connections" on public.service_connections;
create policy "Users update their service connections"
  on public.service_connections for update using (user_id = auth.uid());
drop policy if exists "Users delete their service connections" on public.service_connections;
create policy "Users delete their service connections"
  on public.service_connections for delete using (user_id = auth.uid());

create index if not exists idx_service_connections_user_status
  on public.service_connections (user_id, status);

-- Force the PostgREST schema cache to pick up the new table immediately
-- so the app doesn't need a Supabase Studio reload.
notify pgrst, 'reload schema';
