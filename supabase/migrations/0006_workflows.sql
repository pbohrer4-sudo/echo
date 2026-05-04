-- Workflow definitions (designer state). The runtime that actually
-- fires triggers and executes actions is V2; this table just stores
-- what the user designed — graph nodes, edges, and per-node config.
--
-- Run in Supabase SQL Editor.

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  status text not null default 'draft' check (
    status in ('draft', 'enabled', 'disabled')
  ),
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.workflows enable row level security;

drop policy if exists "Users see their workflows" on public.workflows;
create policy "Users see their workflows"
  on public.workflows for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their workflows" on public.workflows;
create policy "Users insert their workflows"
  on public.workflows for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their workflows" on public.workflows;
create policy "Users update their workflows"
  on public.workflows for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their workflows" on public.workflows;
create policy "Users delete their workflows"
  on public.workflows for delete
  using (user_id = auth.uid());

create index if not exists idx_workflows_user_status
  on public.workflows (user_id, status, deleted_at);
