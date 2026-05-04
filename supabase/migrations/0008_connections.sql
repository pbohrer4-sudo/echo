-- Connections — per-user external-service auth state. V1 only stores
-- the connection record + (eventually) tokens. The actual MCP runtime
-- (process spawning + tool invocation) lives in V2 on a long-running
-- worker outside Vercel's serverless boundary.
--
-- Run in Supabase SQL Editor.

create table if not exists public.connections (
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

alter table public.connections enable row level security;

drop policy if exists "Users see their connections" on public.connections;
create policy "Users see their connections"
  on public.connections for select using (user_id = auth.uid());
drop policy if exists "Users insert their connections" on public.connections;
create policy "Users insert their connections"
  on public.connections for insert with check (user_id = auth.uid());
drop policy if exists "Users update their connections" on public.connections;
create policy "Users update their connections"
  on public.connections for update using (user_id = auth.uid());
drop policy if exists "Users delete their connections" on public.connections;
create policy "Users delete their connections"
  on public.connections for delete using (user_id = auth.uid());

create index if not exists idx_connections_user_status
  on public.connections (user_id, status);
