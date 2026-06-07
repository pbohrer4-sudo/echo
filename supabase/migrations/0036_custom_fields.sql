-- Custom fields (P1, hybrid jsonb MVP — 2026-06-07).
--
-- MVP storage model (HYBRID — see memory echo_custom_fields_and_views):
--   profiles.custom_field_defs  jsonb  — per-user field DEFINITIONS, array of
--       { id: string(uuid), label: string, type: text|textarea|number|date|
--         dropdown|checkbox, options?: string[] (dropdown only) }
--   people.custom_field_values  jsonb  — per-person VALUES, object keyed by
--       field def id → value (string | number | boolean | null)
--
-- LONG-TERM REMINDER: migrate to proper FK tables (custom_field_defs +
-- custom_field_values) for queryability at scale + first-class AI tool
-- catalog support. The jsonb version is the MVP, NOT the destination.
--
-- Both columns default to empty so existing rows are valid without
-- backfill. No CHECK constraints — shape is validated in application code
-- (lib/custom-fields.ts) since jsonb CHECKs for nested arrays are painful.
--
-- Run in Supabase SQL Editor.

alter table public.profiles
  add column if not exists custom_field_defs jsonb not null default '[]'::jsonb;

alter table public.people
  add column if not exists custom_field_values jsonb not null default '{}'::jsonb;
