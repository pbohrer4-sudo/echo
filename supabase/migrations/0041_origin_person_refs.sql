-- Origin "Vermittelt durch" + "Getroffen mit" become person references
-- (2026-06-07). They were free text; now they link to a real CRM person
-- (created inline if missing). Keep the text columns as the denormalised
-- display name so reads don't need a join; add nullable FK columns for
-- the link.
--
-- on delete set null: if the referenced person is deleted, the link
-- clears but the name text stays.
--
-- Run in Supabase SQL Editor.

alter table public.people
  add column if not exists introduced_by_person_id uuid references public.people(id) on delete set null,
  add column if not exists met_with_person_id uuid references public.people(id) on delete set null;
