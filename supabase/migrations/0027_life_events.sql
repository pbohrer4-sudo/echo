-- Life Events Section (Phase D2, Briefing v3 Section 11).
--
-- Fotos, Dokumente, Voice-Notes, Milestones und Text-Notizen mit
-- Zeit und optionalem Ort pro Person. Eigene Tabelle + Junction für
-- Multi-Person-Verknüpfung (z.B. Foto vom Offsite-Wochenende kann
-- mehreren Personen zugeordnet sein).
--
-- File-Storage:
-- - Supabase Storage Bucket `life-events` mit RLS-Policy
-- - Pfad-Convention: `{user_id}/{life_event_id}/{filename}`
-- - Storage-Bucket muss separat im Supabase Dashboard angelegt werden
--   (oder via Supabase CLI). Diese Migration kümmert sich nur um die
--   Tabellen.

create table if not exists public.life_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,

  title text not null,
  description text,
  event_type text not null,  -- 'photo' | 'document' | 'voice_note' | 'milestone' | 'note'
  occurred_at timestamptz not null,

  -- Media (für photo/document/voice_note; null für milestone/note)
  file_path text,         -- Supabase Storage Pfad
  file_size_bytes integer,
  mime_type text,
  thumbnail_path text,    -- für Bilder (optional, kann später per Edge Function gefüllt werden)

  -- Geographie (optional)
  location_name text,
  google_place_id text,
  latitude decimal(10, 7),
  longitude decimal(10, 7),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint life_events_type_check check (event_type in (
    'photo', 'document', 'voice_note', 'milestone', 'note'
  )),
  constraint life_events_title_not_empty check (length(trim(title)) > 0)
);

create index if not exists idx_life_events_user_occurred
  on public.life_events(user_id, occurred_at desc)
  where deleted_at is null;

create index if not exists idx_life_events_type
  on public.life_events(user_id, event_type)
  where deleted_at is null;

alter table public.life_events enable row level security;

drop policy if exists "Users see their life_events" on public.life_events;
create policy "Users see their life_events"
  on public.life_events for select
  using (user_id = auth.uid());

drop policy if exists "Users insert their life_events" on public.life_events;
create policy "Users insert their life_events"
  on public.life_events for insert
  with check (user_id = auth.uid());

drop policy if exists "Users update their life_events" on public.life_events;
create policy "Users update their life_events"
  on public.life_events for update
  using (user_id = auth.uid());

drop policy if exists "Users delete their life_events" on public.life_events;
create policy "Users delete their life_events"
  on public.life_events for delete
  using (user_id = auth.uid());

-- Junction für Multi-Person-Verknüpfung
create table if not exists public.person_life_events (
  person_id uuid references public.people(id) on delete cascade not null,
  life_event_id uuid references public.life_events(id) on delete cascade not null,
  added_at timestamptz not null default now(),
  primary key (person_id, life_event_id)
);

create index if not exists idx_ple_event on public.person_life_events(life_event_id);

alter table public.person_life_events enable row level security;

drop policy if exists "Users see their person_life_events" on public.person_life_events;
create policy "Users see their person_life_events"
  on public.person_life_events for select
  using (exists (
    select 1 from public.life_events
    where life_events.id = person_life_events.life_event_id
    and life_events.user_id = auth.uid()
  ));

drop policy if exists "Users insert their person_life_events" on public.person_life_events;
create policy "Users insert their person_life_events"
  on public.person_life_events for insert
  with check (exists (
    select 1 from public.life_events
    where life_events.id = person_life_events.life_event_id
    and life_events.user_id = auth.uid()
  ));

drop policy if exists "Users delete their person_life_events" on public.person_life_events;
create policy "Users delete their person_life_events"
  on public.person_life_events for delete
  using (exists (
    select 1 from public.life_events
    where life_events.id = person_life_events.life_event_id
    and life_events.user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
