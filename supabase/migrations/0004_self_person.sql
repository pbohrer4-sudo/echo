-- Self-person: mark one row in `people` per user as "this is me".
-- The /profile page creates this row on first visit if it's missing.
--
-- Run in Supabase SQL Editor.

alter table public.people
  add column if not exists is_self boolean not null default false;

-- Partial unique index — at most one self-row per user. Doesn't apply
-- to is_self = false rows, so it doesn't conflict with multiple
-- regular contacts.
create unique index if not exists idx_people_one_self_per_user
  on public.people (user_id)
  where is_self = true;
