-- Smart keyword tags for synergies (2026-06-07, Option 1).
--
-- synergies is free-text sentences; synergy_tags holds short structured
-- keywords extracted from them by Claude (on-demand "Verschlagworten"),
-- so synergies become filterable + searchable across the People list.
-- GIN index for fast array-contains filtering.
--
-- Run in Supabase SQL Editor.

alter table public.people
  add column if not exists synergy_tags text[] not null default '{}'::text[];

create index if not exists people_synergy_tags_gin_idx
  on public.people using gin (synergy_tags);
