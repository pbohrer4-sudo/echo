-- Organizations as first-class entities. Companies on people get
-- promoted from a free-text column to a foreign key, while the legacy
-- people.company text column stays in place for fast inline display
-- and backwards compat with existing voice extraction.
--
-- Run in Supabase SQL Editor.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  domain text,
  website text,
  industry text,
  size text,
  hq text,
  description text,
  notes text,
  tags text[] not null default '{}'::text[],
  enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.organizations enable row level security;

drop policy if exists "Users see their orgs" on public.organizations;
create policy "Users see their orgs"
  on public.organizations for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their orgs" on public.organizations;
create policy "Users insert their orgs"
  on public.organizations for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their orgs" on public.organizations;
create policy "Users update their orgs"
  on public.organizations for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their orgs" on public.organizations;
create policy "Users delete their orgs"
  on public.organizations for delete
  using (user_id = auth.uid());

create index if not exists idx_organizations_user_name
  on public.organizations (user_id, name);

create index if not exists idx_organizations_user_active
  on public.organizations (user_id, deleted_at);

-- Link from people. Nullable: a person can be unaffiliated.
alter table public.people
  add column if not exists organization_id uuid
  references public.organizations(id) on delete set null;

create index if not exists idx_people_organization
  on public.people (organization_id);

-- Backfill: every distinct (user_id, company) becomes an organization
-- row, then people get linked. ON CONFLICT path keeps re-runs safe.
insert into public.organizations (user_id, name)
select user_id, trim(company) as name
from public.people
where company is not null and trim(company) <> ''
group by user_id, trim(company)
on conflict do nothing;

update public.people p
set organization_id = o.id
from public.organizations o
where o.user_id = p.user_id
  and lower(trim(o.name)) = lower(trim(p.company))
  and p.company is not null
  and p.organization_id is null;
