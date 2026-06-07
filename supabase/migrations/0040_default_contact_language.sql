-- Default language for new contacts (2026-06-07).
--
-- Per-person language is required on the create form. For users who
-- communicate 90%+ in one language, this profile setting presets the
-- create-form language so they don't pick it every time. Empty = no
-- preset (user must choose on each create).
--
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists default_contact_language text;
