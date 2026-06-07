-- Reusable custom occasion labels for "Wichtige Daten" (2026-06-07).
--
-- When a user adds an important date with a custom occasion (the "andere"
-- path), the label is auto-remembered here so it shows up in the dropdown
-- next time. Per-user list of strings.
--
-- Default-occasion labels (Geburtstag, 1. Treffen, Hochzeitstag, Jahrestag)
-- live in code (lib/types.ts DATE_LABELS) and are NOT stored here — only
-- the user's own additions.
--
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists custom_date_labels jsonb not null default '[]'::jsonb;
