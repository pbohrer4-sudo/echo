-- Batch 2026-06-07: Synergies, per-person language, Assistant relationship,
-- 1./2. Wohnsitz geo types. All idempotent.
--
-- Run in Supabase SQL Editor.

-- ── Synergies ───────────────────────────────────────────────
-- Replaces the "potential" tag cluster: a multi-entry, sentence-length,
-- searchable text list (NOT tags). Existing potential tags stay in the
-- tags table but are no longer shown.
alter table public.people
  add column if not exists synergies text[] not null default '{}'::text[];
create index if not exists people_synergies_gin_idx
  on public.people using gin (synergies);

-- ── Per-person language ─────────────────────────────────────
alter table public.people
  add column if not exists primary_language text,
  add column if not exists secondary_language text;

-- ── Assistant relationship type ─────────────────────────────
alter table public.person_relationships
  drop constraint if exists person_relationships_relationship_type_check;
alter table public.person_relationships
  add constraint person_relationships_relationship_type_check
  check (relationship_type in (
    'introduced_by','colleague','co_founder','mentor','mentee',
    'former_manager','family','friend','investor','advisor','partner',
    'spouse','parent','child','sibling','assistant','custom'
  ));

-- ── 1./2. Wohnsitz geo types ────────────────────────────────
alter table public.person_geographies
  drop constraint if exists person_geographies_geo_type_check;
alter table public.person_geographies
  add constraint person_geographies_geo_type_check
  check (geo_type in (
    'wohnsitz_1','wohnsitz_2','residence','origin','professional_hub',
    'current_location','met_location','custom'
  ));

-- ── Cross-fill fix: tag identity now includes cluster ───────
-- The old unique index (user_id, lower(name)) meant a tag name could
-- only exist in ONE cluster — re-adding it under a different cluster
-- reused the original row, so it appeared in the wrong cluster
-- ("origin shows up in potential"). Make cluster part of identity so a
-- name can exist independently per cluster.
drop index if exists public.idx_tags_user_lower_name;
create unique index if not exists idx_tags_user_lower_name_cluster
  on public.tags (user_id, lower(name), cluster);
