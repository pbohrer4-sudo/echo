-- Add scope column to people table.
-- The app code references this column everywhere but it was never
-- added via a migration. Default 'both' covers all existing rows.

alter table public.people
  add column if not exists scope text not null default 'both'
  check (scope in ('work', 'personal', 'both'));
