-- Migration: add new tables from briefing v3
-- Tables: user_preferences, person_contacts, person_relationships,
--         person_geographies, passions, circles + person_circles,
--         suggestions, user_api_keys, quota_usage,
--         life_events + person_life_events
-- UP

-- ── user_preferences ────────────────────────────────────────────────────────
-- Per-user settings that don't belong in the profiles auth table.
create table if not exists user_preferences (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  key          text not null,
  value        jsonb not null default 'null',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, key)
);
alter table user_preferences enable row level security;
create policy "user_preferences: owner full access"
  on user_preferences for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── person_contacts ──────────────────────────────────────────────────────────
-- Structured contact channels as rows (phones, emails, socials).
-- Replaces / supplements the JSONB arrays on people.
create table if not exists person_contacts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  kind         text not null,   -- 'phone' | 'email' | 'social' | 'address'
  label        text,
  value        text not null,
  is_primary   boolean not null default false,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_person_contacts_person on person_contacts(person_id) where deleted_at is null;
alter table person_contacts enable row level security;
create policy "person_contacts: owner full access"
  on person_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── person_relationships ─────────────────────────────────────────────────────
-- Bidirectional person-to-person edges. Each edge stored once; the label
-- is from the perspective of person_id_a toward person_id_b.
create table if not exists person_relationships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id_a  uuid not null references people(id) on delete cascade,
  person_id_b  uuid not null references people(id) on delete cascade,
  label_a_to_b text,   -- e.g. "Partner:in", "Mentor:in"
  label_b_to_a text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (person_id_a <> person_id_b)
);
create index if not exists idx_person_rel_a on person_relationships(person_id_a) where deleted_at is null;
create index if not exists idx_person_rel_b on person_relationships(person_id_b) where deleted_at is null;
alter table person_relationships enable row level security;
create policy "person_relationships: owner full access"
  on person_relationships for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── person_geographies ───────────────────────────────────────────────────────
-- Structured location history as rows (replaces geographies JSONB on people).
create table if not exists person_geographies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  kind         text not null default 'Wohnort',  -- Wohnort | Aufenthalt | Herkunft | Hub
  place        text not null,
  since        date,
  until        date,
  is_current   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_person_geo_person on person_geographies(person_id) where deleted_at is null;
alter table person_geographies enable row level security;
create policy "person_geographies: owner full access"
  on person_geographies for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── passions ─────────────────────────────────────────────────────────────────
-- Up to 5 deep passions per person (not generic tags).
create table if not exists passions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  name         text not null,
  emoji        text,
  sort_order   smallint not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_passions_person on passions(person_id) where deleted_at is null;
alter table passions enable row level security;
create policy "passions: owner full access"
  on passions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── circles ──────────────────────────────────────────────────────────────────
-- Named relationship circles (e.g. "Mastermind", "Surfer-Gruppe").
create table if not exists circles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  emoji        text,
  color        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create index if not exists idx_circles_user on circles(user_id) where deleted_at is null;
alter table circles enable row level security;
create policy "circles: owner full access"
  on circles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── person_circles ───────────────────────────────────────────────────────────
-- Junction table: which people belong to which circle.
create table if not exists person_circles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid not null references people(id) on delete cascade,
  circle_id    uuid not null references circles(id) on delete cascade,
  joined_at    date,
  role         text,
  created_at   timestamptz not null default now(),
  unique (person_id, circle_id)
);
alter table person_circles enable row level security;
create policy "person_circles: owner full access"
  on person_circles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── suggestions ──────────────────────────────────────────────────────────────
-- AI-generated suggestions awaiting user confirmation.
create type if not exists suggestion_status as enum (
  'pending', 'accepted', 'rejected', 'dismissed'
);
create type if not exists suggestion_kind as enum (
  'tag', 'depth', 'reminder', 'enrichment', 'reply', 'next_action'
);

create table if not exists suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  person_id    uuid references people(id) on delete cascade,
  kind         suggestion_kind not null,
  status       suggestion_status not null default 'pending',
  payload      jsonb not null default '{}',
  reasoning    text,
  source       text,   -- 'voice', 'debrief', 'enrichment', 'ai'
  expires_at   timestamptz,
  acted_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_suggestions_user_pending
  on suggestions(user_id, created_at desc)
  where status = 'pending';
alter table suggestions enable row level security;
create policy "suggestions: owner full access"
  on suggestions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── user_api_keys ────────────────────────────────────────────────────────────
-- BYOK (bring-your-own-key) encrypted API keys per provider.
-- Actual key material stored in Supabase Vault; this table stores the vault
-- secret ID and metadata only.
create table if not exists user_api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  provider     text not null,   -- 'anthropic' | 'elevenlabs' | 'deepgram' | 'pdl'
  vault_secret_id uuid,         -- reference to vault.secrets if Vault is enabled
  key_hint     text,            -- last 4 chars shown in UI
  is_active    boolean not null default true,
  verified_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, provider)
);
alter table user_api_keys enable row level security;
create policy "user_api_keys: owner full access"
  on user_api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── quota_usage ──────────────────────────────────────────────────────────────
-- Weekly quota tracking per user (Free = 100 AI calls/week, Pro = unlimited).
create table if not exists quota_usage (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  week_start   date not null,   -- Monday of the ISO week
  ai_calls     integer not null default 0,
  voice_secs   integer not null default 0,
  enrichments  integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, week_start)
);
create index if not exists idx_quota_user_week on quota_usage(user_id, week_start desc);
alter table quota_usage enable row level security;
create policy "quota_usage: owner read"
  on quota_usage for select
  using (auth.uid() = user_id);
create policy "quota_usage: service role write"
  on quota_usage for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── life_events ──────────────────────────────────────────────────────────────
-- Catalog of significant life event types.
create table if not exists life_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  emoji        text,
  is_system    boolean not null default false,  -- built-in vs. custom
  created_at   timestamptz not null default now()
);
alter table life_events enable row level security;
create policy "life_events: owner full access"
  on life_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── person_life_events ───────────────────────────────────────────────────────
-- Events attached to a specific person.
create table if not exists person_life_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  person_id      uuid not null references people(id) on delete cascade,
  life_event_id  uuid references life_events(id) on delete set null,
  name           text not null,      -- denormalized for display if life_event deleted
  emoji          text,
  occurred_on    date,
  notes          text,
  source         text default 'manual',  -- 'manual' | 'ai' | 'enrichment'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_person_life_events_person
  on person_life_events(person_id, occurred_on desc)
  where deleted_at is null;
alter table person_life_events enable row level security;
create policy "person_life_events: owner full access"
  on person_life_events for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── updated_at triggers for new tables ─────────────────────────────────────
-- Assumes a generic set_updated_at() trigger function already exists
-- (created in an earlier migration). Add triggers only for tables that
-- need auto-update.

do $$
begin
  if exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) then
    execute 'create trigger set_updated_at before update on user_preferences
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on person_contacts
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on person_relationships
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on person_geographies
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on passions
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on circles
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on suggestions
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on user_api_keys
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on quota_usage
               for each row execute function set_updated_at()';
    execute 'create trigger set_updated_at before update on person_life_events
               for each row execute function set_updated_at()';
  end if;
end $$;

-- DOWN
-- drop trigger if exists set_updated_at on user_preferences;
-- drop trigger if exists set_updated_at on person_contacts;
-- drop trigger if exists set_updated_at on person_relationships;
-- drop trigger if exists set_updated_at on person_geographies;
-- drop trigger if exists set_updated_at on passions;
-- drop trigger if exists set_updated_at on circles;
-- drop trigger if exists set_updated_at on suggestions;
-- drop trigger if exists set_updated_at on user_api_keys;
-- drop trigger if exists set_updated_at on quota_usage;
-- drop trigger if exists set_updated_at on person_life_events;
-- drop table if exists person_life_events;
-- drop table if exists life_events;
-- drop table if exists quota_usage;
-- drop table if exists user_api_keys;
-- drop type if exists suggestion_kind;
-- drop type if exists suggestion_status;
-- drop table if exists suggestions;
-- drop table if exists person_circles;
-- drop table if exists circles;
-- drop table if exists passions;
-- drop table if exists person_geographies;
-- drop table if exists person_relationships;
-- drop table if exists person_contacts;
-- drop table if exists user_preferences;
