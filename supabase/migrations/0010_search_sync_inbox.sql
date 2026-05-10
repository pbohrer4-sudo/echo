-- 0010 — Search + Sync + Inbox-Channels
--
-- Adds the persistence layer for five new features that build on top
-- of the existing CRM model:
--   1. Global trigram search across people, organizations, notes,
--      interactions
--   2. Smart Reminders (no schema change — uses existing reminders
--      table with source='ai-generated')
--   3. Google Calendar sync — events ingested as interactions
--   4. Gmail sync — messages ingested as interactions
--   5. WhatsApp Cloud API channel — inbound messages routed to inbox
--
-- All tables are RLS-protected via auth.uid() = user_id and reuse the
-- same pattern as existing migrations.

-- ── pg_trgm enables fast ILIKE substring matching via GIN indexes.
-- pg_trgm is bundled with Supabase Postgres; this is idempotent.
create extension if not exists pg_trgm;

-- ============================================================
-- Search: trigram indexes on every column we want to search
-- ============================================================
-- ILIKE '%foo%' becomes index-scan-fast with these. We keep search
-- ILIKE-based (not tsvector/FTS) because trigram handles partial
-- matches and German compound words ("Rückrufbitte") better than
-- stemming-based FTS for a personal CRM dataset.

create index if not exists people_name_trgm
  on public.people using gin (name gin_trgm_ops);
create index if not exists people_company_trgm
  on public.people using gin (company gin_trgm_ops);
create index if not exists people_role_trgm
  on public.people using gin (role gin_trgm_ops);
create index if not exists people_notes_trgm
  on public.people using gin (notes gin_trgm_ops);

create index if not exists organizations_name_trgm
  on public.organizations using gin (name gin_trgm_ops);
create index if not exists organizations_description_trgm
  on public.organizations using gin (description gin_trgm_ops);
create index if not exists organizations_notes_trgm
  on public.organizations using gin (notes gin_trgm_ops);

create index if not exists notes_body_trgm
  on public.notes using gin (body gin_trgm_ops);

create index if not exists interactions_summary_trgm
  on public.interactions using gin (summary gin_trgm_ops);

-- ============================================================
-- external_events: Google Calendar (and later iCal/Outlook)
-- ============================================================
-- One row per upstream calendar event. Linked to a person when the
-- attendee email matches a known person. The same event may match
-- multiple people (group meetings) — we link via the optional
-- person_id and let the sync job create one interactions row per
-- matched person on first ingest.
create table if not exists public.external_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (
    provider in ('google_calendar', 'outlook_calendar', 'apple_calendar')
  ),
  external_id text not null,                     -- provider's event ID
  calendar_id text,                              -- provider's calendar ID
  title text,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  attendees jsonb not null default '[]'::jsonb,  -- [{email, name}]
  organizer_email text,
  status text default 'confirmed',               -- confirmed/tentative/cancelled
  raw jsonb,                                     -- full upstream payload
  matched_person_ids uuid[] not null default '{}',
  interaction_id uuid references public.interactions(id) on delete set null,
  ingested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index if not exists external_events_user_starts
  on public.external_events (user_id, starts_at desc);

alter table public.external_events enable row level security;

drop policy if exists "Users see their events" on public.external_events;
create policy "Users see their events" on public.external_events
  for select using (user_id = auth.uid());
drop policy if exists "Users insert their events" on public.external_events;
create policy "Users insert their events" on public.external_events
  for insert with check (user_id = auth.uid());
drop policy if exists "Users update their events" on public.external_events;
create policy "Users update their events" on public.external_events
  for update using (user_id = auth.uid());
drop policy if exists "Users delete their events" on public.external_events;
create policy "Users delete their events" on public.external_events
  for delete using (user_id = auth.uid());

-- ============================================================
-- external_messages: Gmail (and later Outlook/IMAP)
-- ============================================================
create table if not exists public.external_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (
    provider in ('gmail', 'outlook', 'imap')
  ),
  external_id text not null,                     -- gmail messageId
  thread_id text,                                -- gmail threadId
  direction text not null check (direction in ('in', 'out')),
  from_email text,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject text,
  snippet text,                                  -- first ~200 chars
  body_text text,                                -- plaintext body, may be null
  message_at timestamptz not null,
  labels text[] not null default '{}',
  raw jsonb,
  matched_person_ids uuid[] not null default '{}',
  interaction_id uuid references public.interactions(id) on delete set null,
  ingested_at timestamptz not null default now(),
  unique (user_id, provider, external_id)
);

create index if not exists external_messages_user_at
  on public.external_messages (user_id, message_at desc);
create index if not exists external_messages_thread
  on public.external_messages (user_id, thread_id);

alter table public.external_messages enable row level security;
drop policy if exists "Users see their messages" on public.external_messages;
create policy "Users see their messages" on public.external_messages
  for select using (user_id = auth.uid());
drop policy if exists "Users insert their messages" on public.external_messages;
create policy "Users insert their messages" on public.external_messages
  for insert with check (user_id = auth.uid());
drop policy if exists "Users update their messages" on public.external_messages;
create policy "Users update their messages" on public.external_messages
  for update using (user_id = auth.uid());
drop policy if exists "Users delete their messages" on public.external_messages;
create policy "Users delete their messages" on public.external_messages
  for delete using (user_id = auth.uid());

-- ============================================================
-- wa_messages: WhatsApp Cloud API inbound + outbound
-- ============================================================
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  external_id text not null,                     -- WA message ID (wamid)
  direction text not null check (direction in ('in', 'out')),
  from_number text not null,                     -- E.164
  to_number text not null,                       -- E.164
  message_type text not null,                    -- text/image/audio/document/etc
  text_body text,
  media_url text,
  media_mime text,
  message_at timestamptz not null,
  status text,                                   -- sent/delivered/read/failed
  raw jsonb,
  matched_person_id uuid references public.people(id) on delete set null,
  interaction_id uuid references public.interactions(id) on delete set null,
  unread boolean not null default true,
  ingested_at timestamptz not null default now(),
  unique (user_id, external_id)
);

create index if not exists wa_messages_user_at
  on public.wa_messages (user_id, message_at desc);
create index if not exists wa_messages_unread
  on public.wa_messages (user_id, unread) where unread;

alter table public.wa_messages enable row level security;
drop policy if exists "Users see their wa" on public.wa_messages;
create policy "Users see their wa" on public.wa_messages
  for select using (user_id = auth.uid());
drop policy if exists "Users insert their wa" on public.wa_messages;
create policy "Users insert their wa" on public.wa_messages
  for insert with check (user_id = auth.uid());
drop policy if exists "Users update their wa" on public.wa_messages;
create policy "Users update their wa" on public.wa_messages
  for update using (user_id = auth.uid());
drop policy if exists "Users delete their wa" on public.wa_messages;
create policy "Users delete their wa" on public.wa_messages
  for delete using (user_id = auth.uid());

-- ============================================================
-- Sync-state on service_connections (last successful sync)
-- ============================================================
-- Used by the sync routes to do incremental pulls — Gmail historyId,
-- Calendar nextSyncToken, etc. Stored in config jsonb to avoid yet
-- another migration each time we add a provider.
--
-- No schema change needed: service_connections.config is already
-- jsonb. Documented here for clarity.
