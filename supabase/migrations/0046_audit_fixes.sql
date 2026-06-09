-- 0046 — Audit fixes: missing RLS policy, GIN indexes, partial index,
-- and tags unique index cluster coverage.
--
-- All changes are additive (IF NOT EXISTS / IF EXISTS guards).
-- No down-migration needed.

-- ============================================================
-- Fix 1: Missing UPDATE policy on person_life_events
-- ============================================================
-- The 0027 migration added SELECT/INSERT/DELETE policies but omitted
-- UPDATE. person_life_events has no user_id column (it is a junction
-- table); ownership is verified by joining through life_events.

drop policy if exists "Users can update their own life events" on public.person_life_events;
create policy "Users can update their own life events"
  on public.person_life_events
  for update
  using (exists (
    select 1 from public.life_events
    where life_events.id = person_life_events.life_event_id
    and life_events.user_id = auth.uid()
  ));

-- ============================================================
-- Fix 2: GIN index on interactions.person_ids
-- ============================================================
-- Queries that filter by a single participant UUID use the
-- @> (contains) operator on the uuid[] column, which requires
-- a GIN index to avoid full-table scans.

create index if not exists idx_interactions_person_ids_gin
  on public.interactions using gin(person_ids);

-- ============================================================
-- Fix 3: Composite partial index on people for list queries
-- ============================================================
-- The standard people list query filters on (user_id, is_self = false,
-- deleted_at IS NULL) and orders by name. A covering partial index
-- avoids a heap fetch for those columns.

create index if not exists idx_people_active_list
  on public.people(user_id, name)
  where is_self = false and deleted_at is null;

-- ============================================================
-- Fix 4: Tags unique index must include cluster column
-- ============================================================
-- The existing index idx_tags_user_lower_name (created in 0022) covers
-- only (user_id, lower(name)). The same tag name in different clusters
-- (e.g. "startup" in 'interests' vs 'potential') should be allowed per
-- user. Replace the index to include cluster so uniqueness is enforced
-- across (user_id, lower(name), cluster).
--
-- There is no named table constraint — only the expression index. Drop
-- it and create the wider one. The ALTER TABLE DROP CONSTRAINT guard is
-- kept for safety in case a constraint was added manually.

alter table public.tags drop constraint if exists tags_user_id_name_key;
drop index if exists public.idx_tags_user_lower_name;

create unique index if not exists idx_tags_user_lower_name_cluster
  on public.tags(user_id, lower(name), cluster);

notify pgrst, 'reload schema';
