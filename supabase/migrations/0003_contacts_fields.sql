-- iPhone Contacts replacement: multi-value fields on people.
-- Run in Supabase SQL Editor.
--
-- Strategy:
--   * Add JSONB array columns for phones, emails, addresses, socials,
--     important_dates, relationships.
--   * Add avatar_url (text URL for now; uploads later via Supabase Storage).
--   * Add notes (the freeform "iPhone notes" textarea — distinct from
--     notes_summary which is AI-generated).
--   * Backfill phones / emails from the legacy single columns so existing
--     rows aren't lost.
--   * Keep legacy phone, email, birthday columns intact for now —
--     voice extraction still writes to them and birthday is special-cased
--     by Sunday Pulse. Drop later in a follow-up migration once the new
--     columns prove out.

alter table public.people
  add column if not exists phones jsonb not null default '[]'::jsonb,
  add column if not exists emails jsonb not null default '[]'::jsonb,
  add column if not exists addresses jsonb not null default '[]'::jsonb,
  add column if not exists socials jsonb not null default '[]'::jsonb,
  add column if not exists important_dates jsonb not null default '[]'::jsonb,
  add column if not exists relationships jsonb not null default '[]'::jsonb,
  add column if not exists avatar_url text,
  add column if not exists notes text;

-- Backfill from legacy single fields. Safe to re-run.
update public.people
set phones = jsonb_build_array(
  jsonb_build_object('label', 'mobile', 'value', phone)
)
where phone is not null
  and (phones is null or phones = '[]'::jsonb);

update public.people
set emails = jsonb_build_array(
  jsonb_build_object('label', 'persönlich', 'value', email)
)
where email is not null
  and (emails is null or emails = '[]'::jsonb);

-- Index relationships by from-person for fast lookups when rendering
-- the related-names section. JSONB GIN is overkill for our scale but
-- cheap and future-proofs queries like "who has X as a relation".
create index if not exists idx_people_relationships
  on public.people using gin (relationships);
