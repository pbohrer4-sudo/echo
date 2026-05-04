-- Sales (or any-purpose) pipelines: configurable stages, configurable
-- custom fields, deals linked to people / organizations / both.
--
-- Run in Supabase SQL Editor.

create table if not exists public.pipelines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  entity_type text not null default 'both' check (
    entity_type in ('person', 'organization', 'both')
  ),
  stages jsonb not null default '[]'::jsonb,
  field_definitions jsonb not null default '[]'::jsonb,
  default_currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.pipelines enable row level security;

drop policy if exists "Users see their pipelines" on public.pipelines;
create policy "Users see their pipelines"
  on public.pipelines for select using (user_id = auth.uid());
drop policy if exists "Users insert their pipelines" on public.pipelines;
create policy "Users insert their pipelines"
  on public.pipelines for insert with check (user_id = auth.uid());
drop policy if exists "Users update their pipelines" on public.pipelines;
create policy "Users update their pipelines"
  on public.pipelines for update using (user_id = auth.uid());
drop policy if exists "Users delete their pipelines" on public.pipelines;
create policy "Users delete their pipelines"
  on public.pipelines for delete using (user_id = auth.uid());

create index if not exists idx_pipelines_user
  on public.pipelines (user_id, deleted_at);

create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  pipeline_id uuid references public.pipelines(id) on delete cascade not null,
  stage_id text not null,
  title text not null,
  person_id uuid references public.people(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  value numeric,
  currency text,
  expected_close_date date,
  probability int check (probability is null or (probability >= 0 and probability <= 100)),
  status text not null default 'open' check (status in ('open', 'won', 'lost')),
  field_values jsonb not null default '{}'::jsonb,
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.deals enable row level security;

drop policy if exists "Users see their deals" on public.deals;
create policy "Users see their deals"
  on public.deals for select using (user_id = auth.uid());
drop policy if exists "Users insert their deals" on public.deals;
create policy "Users insert their deals"
  on public.deals for insert with check (user_id = auth.uid());
drop policy if exists "Users update their deals" on public.deals;
create policy "Users update their deals"
  on public.deals for update using (user_id = auth.uid());
drop policy if exists "Users delete their deals" on public.deals;
create policy "Users delete their deals"
  on public.deals for delete using (user_id = auth.uid());

create index if not exists idx_deals_pipeline_stage
  on public.deals (pipeline_id, stage_id, status, deleted_at);
create index if not exists idx_deals_person
  on public.deals (person_id);
create index if not exists idx_deals_organization
  on public.deals (organization_id);
