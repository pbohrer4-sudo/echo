-- Schema tidy (2026-06-07): drop dead columns left over from an earlier
-- parked experiment. The current Origin model uses how_we_met /
-- met_location / met_date / introduced_by(+_person_id) / met_with
-- (+_person_id), and classification uses the Purpose axis — so these five
-- columns are unreferenced by any code path. Verified: zero references in
-- lib/ app/ components/.
--
-- Safe to drop (nullable or default-backed). Idempotent.
--
-- Run in Supabase SQL Editor.

alter table public.people
  drop column if exists relationship_class,
  drop column if exists origin_where_met,
  drop column if exists origin_when_met,
  drop column if exists origin_introduced_by,
  drop column if exists origin_met_with;
