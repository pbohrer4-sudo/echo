-- Corrective migration: harden organizations against duplicates and
-- add the indexes the app's hot read paths actually need.
--
-- 1. Soft-delete duplicate organizations (keep oldest by created_at,
--    then id). Re-link any people who pointed at the now-deleted dupes
--    so we don't strand them.
-- 2. Add a partial unique index on (user_id, lower(name)) so future
--    `resolveOrCreateOrganization` calls can rely on Postgres for
--    uniqueness instead of a racy check-then-insert.
-- 3. Add the missing performance indexes (active-only partials, JSONB
--    GIN for email/phone lookup, organization domain lookup, CTA
--    expiry sweep).
--
-- Idempotent: re-running is safe.

-- (1) Dedup. Find duplicates per (user_id, lower(name)) ranked by
--     created_at; keep rank 1 as canonical, mark the rest deleted.
with ranked as (
  select id, user_id, name,
         row_number() over (
           partition by user_id, lower(trim(name))
           order by created_at, id
         ) as rn,
         first_value(id) over (
           partition by user_id, lower(trim(name))
           order by created_at, id
         ) as canonical_id
  from public.organizations
  where deleted_at is null
),
remaps as (
  select id as dup_id, canonical_id
  from ranked
  where rn > 1
)
update public.people p
set organization_id = r.canonical_id
from remaps r
where p.organization_id = r.dup_id;

with ranked as (
  select id,
         row_number() over (
           partition by user_id, lower(trim(name))
           order by created_at, id
         ) as rn
  from public.organizations
  where deleted_at is null
)
update public.organizations
set deleted_at = now()
where id in (select id from ranked where rn > 1);

-- (2) Unique partial index — guards future inserts against the race
--     condition in resolveOrCreateOrganization.
create unique index if not exists uq_organizations_user_name_ci
  on public.organizations (user_id, lower(trim(name)))
  where deleted_at is null;

-- (3) Performance indexes.

-- Active-only partials. Postgres can use these for the dominant
-- "list all my X where deleted_at is null" queries.
create index if not exists idx_organizations_active
  on public.organizations (user_id) where deleted_at is null;

create index if not exists idx_pipelines_active
  on public.pipelines (user_id) where deleted_at is null;

create index if not exists idx_deals_active
  on public.deals (user_id) where deleted_at is null;

create index if not exists idx_workflows_active
  on public.workflows (user_id) where deleted_at is null;

-- Domain lookup for resolveOrCreateOrganization (case-insensitive).
create index if not exists idx_organizations_user_domain
  on public.organizations (user_id, lower(domain))
  where domain is not null and deleted_at is null;

-- JSONB GIN indexes — without these, "find a person by email" is a
-- full table scan over potentially thousands of rows.
create index if not exists idx_people_emails_gin
  on public.people using gin (emails);

create index if not exists idx_people_phones_gin
  on public.people using gin (phones);

-- CTA expiry sweep. Only relevant rows where a CTA actually exists.
create index if not exists idx_people_cta_expires
  on public.people (user_id, cta_expires_at)
  where cta_expires_at is not null;

notify pgrst, 'reload schema';
