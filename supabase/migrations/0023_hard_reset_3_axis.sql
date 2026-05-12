-- Hard-Reset + 3-Achsen-Schema (Phase A3-A8 zusammengefasst)
--
-- Entscheidung Patrick 12. Mai 2026: keine Daten-Migration, alle
-- Entity-Daten werden gewiped, Schema kriegt die neuen Felder additiv
-- daneben. Alte Spalten bleiben erst mal (build-Stabilität) — Phase F
-- droppt sie sobald Phase C die UI auf die neuen Spalten umgestellt hat.
--
-- TRUNCATE statt DELETE wegen RESTART IDENTITY + CASCADE (FK-sicher).
-- DROP CONNECTIONS weil tote Tabelle (nicht in Code referenziert).

-- ============================================================
-- Section 1: TRUNCATE alle Entity-Tabellen
-- ============================================================

truncate table
  public.suggestions,
  public.person_tags,
  public.tags,
  public.deals,
  public.pipelines,
  public.workflows,
  public.connections,
  public.debriefs,
  public.todos,
  public.reminders,
  public.notes,
  public.interactions,
  public.organizations,
  public.people
restart identity cascade;

-- ============================================================
-- Section 2: Drop dead `connections` table
-- ============================================================
-- Inventory: "tote Tabelle — kein Code referenziert sie". Briefing
-- erwähnt sie nicht. Wegwerfen, eine FK-Source weniger.

drop table if exists public.connections cascade;

-- ============================================================
-- Section 3: Neue Spalten auf people (3-Achsen + Met-Felder)
-- ============================================================

alter table public.people
  -- Namen-Split (Briefing 3.1)
  add column if not exists first_name text,
  add column if not exists last_name text,

  -- Goldfeld + Met-Kontext (Briefing 5.1)
  add column if not exists how_we_met text,
  add column if not exists met_date date,
  add column if not exists met_location text,
  add column if not exists met_event text,

  -- 3-Achsen (Briefing 4.1-4.3)
  add column if not exists depth text,
  add column if not exists depth_source text not null default 'auto',
  add column if not exists purpose text,
  add column if not exists mode text not null default 'active',
  add column if not exists next_nudge_at timestamptz,

  -- Cadence + Last-Contact (Briefing 4.x neu, parallel zu legacy)
  add column if not exists last_contact_at timestamptz,
  add column if not exists cadence_days integer,

  -- Profile-Felder
  add column if not exists linkedin_url text,
  add column if not exists photo_url text,
  add column if not exists current_location text,
  add column if not exists home_location text;

-- CHECK-Constraints (separate ALTER um if-not-exists-Semantik zu
-- haben — Postgres erlaubt das nicht inline).
alter table public.people drop constraint if exists people_depth_check;
alter table public.people add constraint people_depth_check
  check (depth is null or depth in (
    'inner_5',     -- ≥24 Interaktionen / 12mo
    'trusted_15',  -- ≥12
    'active_50',   -- ≥4
    'network_150', -- ≥2
    'periphery_500' -- ≥1
  ));

alter table public.people drop constraint if exists people_depth_source_check;
alter table public.people add constraint people_depth_source_check
  check (depth_source in ('auto', 'manual_override'));

alter table public.people drop constraint if exists people_purpose_check;
alter table public.people add constraint people_purpose_check
  check (purpose is null or purpose in (
    'personal',
    'family',
    'business_active',
    'business_latent',
    'aspirational'
  ));

alter table public.people drop constraint if exists people_mode_check;
alter table public.people add constraint people_mode_check
  check (mode in ('active', 'nurture', 'dormant', 'reconnect', 'archive'));

-- ============================================================
-- Section 4: Neue Indizes für 3-Achsen-Filter + Heute-Dashboard
-- ============================================================

create index if not exists idx_people_mode
  on public.people(user_id, mode)
  where deleted_at is null;

create index if not exists idx_people_next_nudge
  on public.people(user_id, next_nudge_at)
  where mode = 'active' and deleted_at is null;

create index if not exists idx_people_purpose
  on public.people(user_id, purpose)
  where deleted_at is null;

create index if not exists idx_people_depth
  on public.people(user_id, depth)
  where deleted_at is null;

create index if not exists idx_people_met_date
  on public.people(user_id, met_date desc nulls last)
  where deleted_at is null;

create index if not exists idx_people_last_contact
  on public.people(user_id, last_contact_at desc nulls last)
  where deleted_at is null;

-- ============================================================
-- Section 5: Interactions-Erweiterung
-- ============================================================
-- Briefing 8.x: direction, duration, AI-extrahierte Fakten

alter table public.interactions
  add column if not exists direction text,
  add column if not exists duration_minutes integer,
  add column if not exists ai_extracted_facts jsonb;

alter table public.interactions drop constraint if exists interactions_direction_check;
alter table public.interactions add constraint interactions_direction_check
  check (direction is null or direction in ('inbound', 'outbound', 'mutual'));

-- ============================================================
-- Section 6: PostgREST schema reload
-- ============================================================

notify pgrst, 'reload schema';
