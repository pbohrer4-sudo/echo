-- 0030 — V3 Schema-Rework: person_contacts / person_relationships /
-- person_geographies als strukturierte Tabellen.
--
-- Ersetzt langfristig die JSONB-Spalten phones/emails/socials/
-- relationships + freitext current_location/home_location/met_location.
-- Aber: in dieser Migration werden die alten Spalten NICHT gedroppt.
-- Phase 1 baut nur die Tabellen + RLS + Backfill. Reads/Writes ziehen
-- in Phasen 2-3 um, Drop kommt erst in Phase 4 nach Verifikation.
--
-- Design-Notes:
-- - text + CHECK statt Postgres-enum — einfacher zu erweitern später.
-- - source 'voice_extract' + 'ai_suggested' zusätzlich zum Briefing-Set,
--   weil unsere Pipelines die produzieren.
-- - person_contacts.value ist text — Validierung (Telefon-Format, Email-
--   Regex) macht die App, nicht die DB.
-- - person_relationships ist NICHT auto-symmetrisch in der DB. Symmetrie
--   wird vom App-Code aufrechterhalten (siehe lib/relationships.ts in
--   Phase 2). Grund: nicht alle Beziehungen sind symmetrisch
--   (mentor↔mentee, introduced_by) — die DB sollte keine Logik haben
--   die später falsch wäre.

-- ─────────────────────── person_contacts ───────────────────────

create table if not exists person_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  channel text not null check (channel in (
    'email','phone','whatsapp','linkedin','telegram','signal','sms',
    'calendly','website','instagram','twitter','github','mastodon',
    'bluesky','threads','tiktok','other'
  )),
  subtype text,            -- z. B. mobile/office/home/landline für phone
  value text not null,
  country_code char(2),    -- für phone
  is_primary boolean not null default false,
  source text not null default 'manual' check (source in (
    'manual','pdl_enrichment','linkedin','vcard_import',
    'voice_extract','ai_suggested'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_contacts_person_idx
  on person_contacts(person_id);
create index if not exists person_contacts_user_channel_value_idx
  on person_contacts(user_id, channel, lower(value));

alter table person_contacts enable row level security;

create policy "person_contacts owner read"
  on person_contacts for select using (user_id = auth.uid());
create policy "person_contacts owner insert"
  on person_contacts for insert with check (user_id = auth.uid());
create policy "person_contacts owner update"
  on person_contacts for update using (user_id = auth.uid());
create policy "person_contacts owner delete"
  on person_contacts for delete using (user_id = auth.uid());

-- ─────────────────────── person_relationships ───────────────────

create table if not exists person_relationships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  related_person_id uuid not null references people(id) on delete cascade,
  relationship_type text not null check (relationship_type in (
    'introduced_by','colleague','co_founder','mentor','mentee',
    'former_manager','family','friend','investor','advisor',
    'partner','spouse','parent','child','sibling','custom'
  )),
  label text,              -- für custom oder Zusatzinfo (z. B. „Studienfreundin")
  created_by text not null default 'user' check (created_by in (
    'user','ai_suggested'
  )),
  created_at timestamptz not null default now(),

  -- Eine Beziehung-Art existiert nur einmal pro Person-Paar.
  unique (person_id, related_person_id, relationship_type),
  -- Selbst-Referenz verhindern.
  check (person_id <> related_person_id)
);

create index if not exists person_relationships_person_idx
  on person_relationships(person_id);
create index if not exists person_relationships_related_idx
  on person_relationships(related_person_id);

alter table person_relationships enable row level security;

create policy "person_relationships owner read"
  on person_relationships for select using (user_id = auth.uid());
create policy "person_relationships owner insert"
  on person_relationships for insert with check (user_id = auth.uid());
create policy "person_relationships owner update"
  on person_relationships for update using (user_id = auth.uid());
create policy "person_relationships owner delete"
  on person_relationships for delete using (user_id = auth.uid());

-- ─────────────────────── person_geographies ─────────────────────

create table if not exists person_geographies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  person_id uuid not null references people(id) on delete cascade,
  geo_type text not null check (geo_type in (
    'residence','origin','professional_hub','current_location',
    'met_location','custom'
  )),
  custom_label text,        -- bei geo_type='custom'
  is_active boolean not null default true,
  display_name text not null,
  street text,
  postal_code text,
  city text,
  region text,
  country text,
  country_code char(2),
  latitude double precision,
  longitude double precision,
  place_id text,            -- OSM-place_id (oder später Google Places ID)
  precision text check (precision in ('address','city','region','country')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists person_geographies_person_idx
  on person_geographies(person_id);
create index if not exists person_geographies_user_city_idx
  on person_geographies(user_id, lower(city));
create index if not exists person_geographies_user_country_idx
  on person_geographies(user_id, country_code);

alter table person_geographies enable row level security;

create policy "person_geographies owner read"
  on person_geographies for select using (user_id = auth.uid());
create policy "person_geographies owner insert"
  on person_geographies for insert with check (user_id = auth.uid());
create policy "person_geographies owner update"
  on person_geographies for update using (user_id = auth.uid());
create policy "person_geographies owner delete"
  on person_geographies for delete using (user_id = auth.uid());

-- ─────────────────────── Backfill aus JSONB ─────────────────────
-- Einmaliger Kopiervorgang. Schreibvorgänge bleiben vorerst auf den
-- alten JSONB-Spalten; eine Re-Backfill-Routine in lib/backfill.ts
-- kann später drift wieder einsammeln.

-- phones → person_contacts (channel=phone)
insert into person_contacts (user_id, person_id, channel, subtype, value, source)
select
  p.user_id,
  p.id,
  'phone',
  nullif(ph->>'label', ''),
  ph->>'value',
  'manual'
from people p,
     lateral jsonb_array_elements(coalesce(p.phones, '[]'::jsonb)) ph
where p.deleted_at is null
  and coalesce(ph->>'value','') <> '';

-- emails → person_contacts (channel=email)
insert into person_contacts (user_id, person_id, channel, subtype, value, source)
select
  p.user_id,
  p.id,
  'email',
  nullif(em->>'label', ''),
  em->>'value',
  'manual'
from people p,
     lateral jsonb_array_elements(coalesce(p.emails, '[]'::jsonb)) em
where p.deleted_at is null
  and coalesce(em->>'value','') <> '';

-- socials → person_contacts mit platform-Mapping auf channel
insert into person_contacts (user_id, person_id, channel, value, source)
select
  p.user_id,
  p.id,
  case lower(s->>'platform')
    when 'linkedin' then 'linkedin'
    when 'instagram' then 'instagram'
    when 'twitter' then 'twitter'
    when 'github' then 'github'
    when 'mastodon' then 'mastodon'
    when 'bluesky' then 'bluesky'
    when 'threads' then 'threads'
    when 'tiktok' then 'tiktok'
    when 'website' then 'website'
    else 'other'
  end,
  s->>'handle_or_url',
  'manual'
from people p,
     lateral jsonb_array_elements(coalesce(p.socials, '[]'::jsonb)) s
where p.deleted_at is null
  and coalesce(s->>'handle_or_url','') <> '';

-- linkedin_url scalar → person_contacts (channel=linkedin), aber nur
-- wenn nicht bereits via socials gemapped.
insert into person_contacts (user_id, person_id, channel, value, source)
select p.user_id, p.id, 'linkedin', p.linkedin_url, 'manual'
from people p
where p.deleted_at is null
  and coalesce(p.linkedin_url, '') <> ''
  and not exists (
    select 1 from person_contacts c
    where c.person_id = p.id and c.channel = 'linkedin'
  );

-- Pro Channel pro Person die erste Zeile als primary markieren.
update person_contacts c
   set is_primary = true
  from (
    select distinct on (person_id, channel) id
      from person_contacts
     order by person_id, channel, created_at, id
  ) firsts
 where c.id = firsts.id;

-- relationships → person_relationships
insert into person_relationships
  (user_id, person_id, related_person_id, relationship_type, label, created_by)
select
  p.user_id,
  p.id,
  (rel->>'related_person_id')::uuid,
  case lower(coalesce(rel->>'label',''))
    when 'partner:in' then 'partner'
    when 'ehepartner:in' then 'spouse'
    when 'mutter' then 'parent'
    when 'vater' then 'parent'
    when 'sohn' then 'child'
    when 'tochter' then 'child'
    when 'bruder' then 'sibling'
    when 'schwester' then 'sibling'
    when 'freund:in' then 'friend'
    when 'kolleg:in' then 'colleague'
    when 'mentor:in' then 'mentor'
    else 'custom'
  end,
  rel->>'label',
  'user'
from people p,
     lateral jsonb_array_elements(coalesce(p.relationships, '[]'::jsonb)) rel
where p.deleted_at is null
  and (rel->>'related_person_id') is not null
  and (rel->>'related_person_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
on conflict (person_id, related_person_id, relationship_type) do nothing;

-- current_location → person_geographies (residence + is_active=true)
insert into person_geographies
  (user_id, person_id, geo_type, is_active, display_name,
   latitude, longitude, place_id)
select
  p.user_id,
  p.id,
  'residence',
  true,
  coalesce(p.current_location_geo->>'display_name', p.current_location),
  case when p.current_location_geo->>'lat' is not null
       then (p.current_location_geo->>'lat')::double precision end,
  case when p.current_location_geo->>'lng' is not null
       then (p.current_location_geo->>'lng')::double precision end,
  p.current_location_geo->>'place_id'
from people p
where p.deleted_at is null
  and coalesce(p.current_location, '') <> '';

-- home_location → person_geographies (origin)
insert into person_geographies
  (user_id, person_id, geo_type, is_active, display_name,
   latitude, longitude, place_id)
select
  p.user_id,
  p.id,
  'origin',
  true,
  coalesce(p.home_location_geo->>'display_name', p.home_location),
  case when p.home_location_geo->>'lat' is not null
       then (p.home_location_geo->>'lat')::double precision end,
  case when p.home_location_geo->>'lng' is not null
       then (p.home_location_geo->>'lng')::double precision end,
  p.home_location_geo->>'place_id'
from people p
where p.deleted_at is null
  and coalesce(p.home_location, '') <> '';

-- met_location → person_geographies (met_location)
insert into person_geographies
  (user_id, person_id, geo_type, is_active, display_name,
   latitude, longitude, place_id)
select
  p.user_id,
  p.id,
  'met_location',
  true,
  coalesce(p.met_location_geo->>'display_name', p.met_location),
  case when p.met_location_geo->>'lat' is not null
       then (p.met_location_geo->>'lat')::double precision end,
  case when p.met_location_geo->>'lng' is not null
       then (p.met_location_geo->>'lng')::double precision end,
  p.met_location_geo->>'place_id'
from people p
where p.deleted_at is null
  and coalesce(p.met_location, '') <> '';

-- addresses → person_geographies (custom, mit street/city/postal/country)
insert into person_geographies
  (user_id, person_id, geo_type, custom_label, is_active, display_name,
   street, city, postal_code, country)
select
  p.user_id,
  p.id,
  'custom',
  a->>'label',
  true,
  -- Display fällt auf city zurück, sonst Postal+Land Notlösung.
  coalesce(
    nullif(trim(concat_ws(', ',
      nullif(a->>'street', ''),
      nullif(a->>'city', ''),
      nullif(a->>'country', '')
    )), ''),
    a->>'label'
  ),
  nullif(a->>'street', ''),
  nullif(a->>'city', ''),
  nullif(a->>'postal_code', ''),
  nullif(a->>'country', '')
from people p,
     lateral jsonb_array_elements(coalesce(p.addresses, '[]'::jsonb)) a
where p.deleted_at is null
  and (
    coalesce(a->>'street','') <> '' or
    coalesce(a->>'city','') <> '' or
    coalesce(a->>'postal_code','') <> '' or
    coalesce(a->>'country','') <> ''
  );
