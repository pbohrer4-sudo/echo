-- Phase 1+2 of the Stakeholder/Beziehungs-Modell:
-- - Stakeholder-Typ Ebene 1 (multi-select, erweiterbar)
-- - Stakeholder-Sub-Typ Ebene 2 (per-E1 freie Liste, jsonb)
-- - Geographien (mehrwertig, zeit-sensitiv)
-- - Industrie + Funktion (Single-Text, AI-enrich-ready in Phase 3)
-- - Call-to-Action + Verfall
-- - Priorität (A/B/C) + Bucket (this-week/next-week/later) + set-at
-- - Interessen & Synergien (chip array)
-- - Manueller Depth-Override (für Beziehungstiefe-Berechnung)
--
-- Run in Supabase SQL Editor.

alter table public.people
  add column if not exists stakeholder_types text[] not null default '{}'::text[],
  add column if not exists stakeholder_sub_types jsonb not null default '{}'::jsonb,
  add column if not exists geographies jsonb not null default '[]'::jsonb,
  add column if not exists industry text,
  add column if not exists job_function text,
  add column if not exists cta text,
  add column if not exists cta_expires_at timestamptz,
  add column if not exists priority text
    check (priority is null or priority in ('A', 'B', 'C')),
  add column if not exists priority_bucket text
    check (
      priority_bucket is null
      or priority_bucket in ('this-week', 'next-week', 'later')
    ),
  add column if not exists priority_set_at timestamptz,
  add column if not exists interests text[] not null default '{}'::text[],
  add column if not exists depth_override text
    check (
      depth_override is null
      or depth_override in ('Fremd', 'Bekannt', 'Vertraut', 'Persönlich')
    );

-- Indexes for the most common filters we'll surface (priority + warmth
-- views, stakeholder filter). text[] uses GIN; single text columns get
-- B-tree for ORDER BY.
create index if not exists idx_people_stakeholder_types
  on public.people using gin (stakeholder_types);

create index if not exists idx_people_interests
  on public.people using gin (interests);

create index if not exists idx_people_priority
  on public.people (priority, priority_bucket);
