-- Consolidate "Origin" (how/where/when/who met) into person scalars
-- (2026-06-07). Patrick: Origin was duplicated across a tag cluster, a
-- geography type, a relationship type and scalars. The clean model is a
-- single "Origin" section built from person scalars.
--
-- Existing scalars reused: how_we_met, met_date, met_location.
-- New scalars added here:
--   introduced_by — wer den Kontakt vermittelt hat (Freitext-Name)
--   met_with      — mit wem zusammen man die Person getroffen hat
--
-- The 'origin' TAG cluster is hidden in the UI (cluster editors no longer
-- list it); existing origin tags stay in the DB but aren't shown. The
-- 'origin'/'met_location' GEO types + 'introduced_by' RELATIONSHIP type
-- remain for users who already use them — the new scalars are the
-- primary, simple path.
--
-- Run in Supabase SQL Editor.

alter table public.people
  add column if not exists introduced_by text,
  add column if not exists met_with text;
